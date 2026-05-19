package libro

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestSetAsyncExtractRuntimeConfigAppliesQueueBeforeWorkersStart(t *testing.T) {
	svc := NewService(nil, nil, nil)
	svc.SetAsyncExtractRuntimeConfig(AsyncExtractRuntimeConfig{
		Workers:       3,
		QueueSize:     37,
		JobTTLMinutes: 45,
	})

	svc.runtimeMu.RLock()
	defer svc.runtimeMu.RUnlock()

	if svc.extractRuntime.Workers != 3 {
		t.Fatalf("expected workers=3, got %d", svc.extractRuntime.Workers)
	}
	if svc.extractRuntime.QueueSize != 37 {
		t.Fatalf("expected queue_size=37, got %d", svc.extractRuntime.QueueSize)
	}
	if svc.extractRuntime.JobTTLMinutes != 45 {
		t.Fatalf("expected ttl=45, got %d", svc.extractRuntime.JobTTLMinutes)
	}
	if svc.extractQueue == nil {
		t.Fatalf("expected queue to be initialized")
	}
	if cap(svc.extractQueue) != 37 {
		t.Fatalf("expected queue capacity 37, got %d", cap(svc.extractQueue))
	}
}

func TestEnqueueExtractJobReturnsSaturationWhenQueueFull(t *testing.T) {
	svc := NewService(nil, nil, nil)
	svc.SetAsyncExtractRuntimeConfig(AsyncExtractRuntimeConfig{
		Workers:       1,
		QueueSize:     10,
		JobTTLMinutes: 60,
	})

	blocker := make(chan struct{})
	started := make(chan struct{}, 1)
	svc.setExtractRunnerForTests(func(_ context.Context, _ string, _ ExtractLibroRequest, _ string, _ string) (*ExtractLibroResponse, error) {
		select {
		case started <- struct{}{}:
		default:
		}
		<-blocker
		return &ExtractLibroResponse{}, nil
	})

	job1, err := svc.enqueueExtractJob("trabajo-1", ExtractLibroRequest{}, "u", "teacher")
	if err != nil {
		t.Fatalf("enqueue job1: %v", err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatalf("worker did not start first job on time")
	}

	queuedJobs := make([]*extractLibroJob, 0, 10)
	for i := 2; i <= 11; i++ {
		job, enqueueErr := svc.enqueueExtractJob(fmt.Sprintf("trabajo-buffer-%d", i), ExtractLibroRequest{}, "u", "teacher")
		if enqueueErr != nil {
			t.Fatalf("enqueue buffered job %d: %v", i, enqueueErr)
		}
		queuedJobs = append(queuedJobs, job)
	}

	_, err = svc.enqueueExtractJob("trabajo-overflow", ExtractLibroRequest{}, "u", "teacher")
	if err == nil {
		t.Fatalf("expected saturation error when queue is full")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "saturada") {
		t.Fatalf("expected saturation message, got: %v", err)
	}

	close(blocker)
	waitForJobState(t, svc, job1.JobID, EstadoJobCompletado, 3*time.Second)
	for _, queued := range queuedJobs {
		waitForJobState(t, svc, queued.JobID, EstadoJobCompletado, 5*time.Second)
	}
}

func TestExtractWorkerPoolRespectsConcurrencyLimit(t *testing.T) {
	svc := NewService(nil, nil, nil)
	svc.SetAsyncExtractRuntimeConfig(AsyncExtractRuntimeConfig{
		Workers:       2,
		QueueSize:     32,
		JobTTLMinutes: 60,
	})

	var current int64
	var maxSeen int64
	svc.setExtractRunnerForTests(func(_ context.Context, _ string, _ ExtractLibroRequest, _ string, _ string) (*ExtractLibroResponse, error) {
		now := atomic.AddInt64(&current, 1)
		updateAtomicMax(&maxSeen, now)
		time.Sleep(120 * time.Millisecond)
		atomic.AddInt64(&current, -1)
		return &ExtractLibroResponse{}, nil
	})

	const totalJobs = 8
	jobIDs := make([]string, 0, totalJobs)
	for i := 0; i < totalJobs; i++ {
		job, err := svc.enqueueExtractJob(fmt.Sprintf("trabajo-concurrency-%d", i+1), ExtractLibroRequest{}, "u", "teacher")
		if err != nil {
			t.Fatalf("enqueue job %d: %v", i+1, err)
		}
		jobIDs = append(jobIDs, job.JobID)
	}

	for _, jobID := range jobIDs {
		waitForJobState(t, svc, jobID, EstadoJobCompletado, 6*time.Second)
	}

	gotMax := atomic.LoadInt64(&maxSeen)
	if gotMax <= 0 {
		t.Fatalf("expected max concurrency to be tracked, got %d", gotMax)
	}
	if gotMax > 2 {
		t.Fatalf("expected max concurrency <= 2 workers, got %d", gotMax)
	}
}

func TestCleanupFinishedJobsRemovesExpiredEntries(t *testing.T) {
	svc := NewService(nil, nil, nil)
	now := time.Now()
	old := now.Add(-2 * time.Hour)
	start := old.Add(-2 * time.Minute)

	svc.jobsByID["done"] = &extractLibroJob{
		JobID:       "done",
		Estado:      EstadoJobCompletado,
		QueuedAt:    start,
		StartedAt:   &start,
		UpdatedAt:   old,
		CompletedAt: &old,
	}
	svc.jobsByID["failed"] = &extractLibroJob{
		JobID:     "failed",
		Estado:    EstadoJobError,
		QueuedAt:  start,
		StartedAt: &start,
		UpdatedAt: old,
		FailedAt:  &old,
	}
	svc.jobsByID["active"] = &extractLibroJob{
		JobID:     "active",
		Estado:    EstadoJobEnProgreso,
		QueuedAt:  now.Add(-time.Minute),
		UpdatedAt: now.Add(-time.Minute),
	}

	removed := svc.cleanupFinishedJobs(30*time.Minute, now)
	if removed != 2 {
		t.Fatalf("expected 2 removed jobs, got %d", removed)
	}

	if svc.getJob("done") != nil {
		t.Fatalf("expected completed job to be cleaned up")
	}
	if svc.getJob("failed") != nil {
		t.Fatalf("expected failed job to be cleaned up")
	}
	if svc.getJob("active") == nil {
		t.Fatalf("expected active job to remain in queue map")
	}
}

func TestRunExtractJobStoresTimingMetrics(t *testing.T) {
	svc := NewService(nil, nil, nil)
	svc.SetAsyncExtractRuntimeConfig(AsyncExtractRuntimeConfig{
		Workers:       1,
		QueueSize:     10,
		JobTTLMinutes: 60,
	})

	svc.setExtractRunnerForTests(func(_ context.Context, _ string, _ ExtractLibroRequest, _ string, _ string) (*ExtractLibroResponse, error) {
		time.Sleep(90 * time.Millisecond)
		return &ExtractLibroResponse{}, nil
	})

	job, err := svc.enqueueExtractJob("trabajo-metrics", ExtractLibroRequest{}, "u", "teacher")
	if err != nil {
		t.Fatalf("enqueue metrics job: %v", err)
	}

	waitForJobState(t, svc, job.JobID, EstadoJobCompletado, 4*time.Second)

	current := svc.getJob(job.JobID)
	if current == nil {
		t.Fatalf("expected metrics job to be tracked")
	}
	if current.StartedAt == nil || current.CompletedAt == nil {
		t.Fatalf("expected started_at and completed_at to be set")
	}
	if current.WaitMs < 0 {
		t.Fatalf("expected non-negative wait ms, got %d", current.WaitMs)
	}
	if current.RunMs <= 0 {
		t.Fatalf("expected positive run ms, got %d", current.RunMs)
	}
	if current.TotalMs <= 0 {
		t.Fatalf("expected positive total ms, got %d", current.TotalMs)
	}
	if current.TotalMs < current.RunMs {
		t.Fatalf("expected total_ms >= run_ms, got total=%d run=%d", current.TotalMs, current.RunMs)
	}
	if current.QueueDepthPeak < 1 {
		t.Fatalf("expected queue depth peak >= 1, got %d", current.QueueDepthPeak)
	}
}

func updateAtomicMax(target *int64, candidate int64) {
	for {
		current := atomic.LoadInt64(target)
		if candidate <= current {
			return
		}
		if atomic.CompareAndSwapInt64(target, current, candidate) {
			return
		}
	}
}

func waitForJobState(t *testing.T, svc *Service, jobID string, expected EstadoExtraccionJob, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		job := svc.getJob(jobID)
		if job != nil && job.Estado == expected {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	job := svc.getJob(jobID)
	if job == nil {
		t.Fatalf("job %s disappeared before reaching state %s", jobID, expected)
	}
	t.Fatalf("job %s did not reach state %s, current=%s", jobID, expected, job.Estado)
}

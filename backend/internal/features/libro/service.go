package libro

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type Service struct {
	repo                  *Repository
	analysisAI            *AIService
	mcpAI                 *AIService
	mcp                   *mcpOrchestrator
	modelTrainingRevision string
	benchmarkBatchID      string
	metricsMu             sync.RWMutex
	metricsByID           map[string]*LibroObservabilityResponse
	jobsMu                sync.RWMutex
	jobsByID              map[string]*extractLibroJob
	runtimeMu             sync.RWMutex
	extractRuntime        AsyncExtractRuntimeConfig
	extractQueue          chan string
	extractQueuePeak      int
	extractWorkersStarted bool
	extractWorkersOnce    sync.Once
	extractCleanupOnce    sync.Once
	extractRunner         extractJobRunner
}

type extractLibroJob struct {
	JobID          string
	TrabajoID      string
	UserID         string
	Role           string
	Req            ExtractLibroRequest
	Estado         EstadoExtraccionJob
	Progress       int
	Message        string
	Error          *string
	ErrorType      *string
	ErrorMessage   *string
	QueuedAt       time.Time
	StartedAt      *time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
	FailedAt       *time.Time
	WaitMs         int64
	RunMs          int64
	TotalMs        int64
	QueueDepthPeak int
	WorkerID       int
	Result         *ExtractLibroResponse
}

type extractJobRunner func(ctx context.Context, trabajoID string, req ExtractLibroRequest, userID, role string) (*ExtractLibroResponse, error)

type AsyncExtractRuntimeConfig struct {
	Workers       int
	QueueSize     int
	JobTTLMinutes int
}

const (
	defaultExtractWorkers       = 2
	defaultExtractQueueSize     = 100
	defaultExtractJobTTLMinutes = 60
	minExtractWorkers           = 1
	maxExtractWorkers           = 16
	minExtractQueueSize         = 10
	maxExtractQueueSize         = 5000
	minExtractJobTTLMinutes     = 5
	maxExtractJobTTLMinutes     = 24 * 60
)

func normalizeAsyncRuntimeConfig(cfg AsyncExtractRuntimeConfig) AsyncExtractRuntimeConfig {
	out := cfg
	if out.Workers < minExtractWorkers {
		out.Workers = defaultExtractWorkers
	}
	if out.Workers > maxExtractWorkers {
		out.Workers = maxExtractWorkers
	}
	if out.QueueSize < minExtractQueueSize {
		out.QueueSize = defaultExtractQueueSize
	}
	if out.QueueSize > maxExtractQueueSize {
		out.QueueSize = maxExtractQueueSize
	}
	if out.JobTTLMinutes < minExtractJobTTLMinutes {
		out.JobTTLMinutes = defaultExtractJobTTLMinutes
	}
	if out.JobTTLMinutes > maxExtractJobTTLMinutes {
		out.JobTTLMinutes = maxExtractJobTTLMinutes
	}
	return out
}

func NewService(repo *Repository, analysisAI *AIService, mcpAI *AIService) *Service {
	if analysisAI == nil {
		analysisAI = mcpAI
	}
	if mcpAI == nil {
		mcpAI = analysisAI
	}
	runtime := normalizeAsyncRuntimeConfig(AsyncExtractRuntimeConfig{})
	svc := &Service{
		repo:           repo,
		analysisAI:     analysisAI,
		mcpAI:          mcpAI,
		mcp:            newMCPOrchestrator(repo),
		metricsByID:    make(map[string]*LibroObservabilityResponse),
		jobsByID:       make(map[string]*extractLibroJob),
		extractRuntime: runtime,
	}
	svc.extractRunner = svc.ExtractLibro
	return svc
}

func (s *Service) SetAsyncExtractRuntimeConfig(cfg AsyncExtractRuntimeConfig) {
	if s == nil {
		return
	}
	normalized := normalizeAsyncRuntimeConfig(cfg)
	s.runtimeMu.Lock()
	s.extractRuntime = normalized
	// Queue size can only be changed before workers are started.
	if !s.extractWorkersStarted {
		s.extractQueue = make(chan string, normalized.QueueSize)
		s.extractQueuePeak = 0
	}
	s.runtimeMu.Unlock()
}

func (s *Service) setExtractRunnerForTests(runner extractJobRunner) {
	if s == nil {
		return
	}
	if runner == nil {
		s.extractRunner = s.ExtractLibro
		return
	}
	s.extractRunner = runner
}

func (s *Service) ensureAsyncWorkersStarted() {
	if s == nil {
		return
	}
	s.extractWorkersOnce.Do(func() {
		s.runtimeMu.RLock()
		cfg := s.extractRuntime
		queue := s.extractQueue
		s.runtimeMu.RUnlock()
		if queue == nil {
			queue = make(chan string, cfg.QueueSize)
			s.runtimeMu.Lock()
			s.extractQueue = queue
			s.runtimeMu.Unlock()
		}
		s.runtimeMu.Lock()
		s.extractWorkersStarted = true
		s.runtimeMu.Unlock()
		for workerID := 1; workerID <= cfg.Workers; workerID++ {
			id := workerID
			go s.extractWorkerLoop(id, queue)
		}
		s.startAsyncJobCleanupLoop(cfg)
	})
}

func (s *Service) startAsyncJobCleanupLoop(cfg AsyncExtractRuntimeConfig) {
	s.extractCleanupOnce.Do(func() {
		interval := time.Minute
		ttl := time.Duration(cfg.JobTTLMinutes) * time.Minute
		if ttl < 2*time.Minute {
			interval = 30 * time.Second
		}
		go func() {
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for range ticker.C {
				s.cleanupFinishedJobs(ttl, time.Now())
			}
		}()
	})
}

func (s *Service) cleanupFinishedJobs(ttl time.Duration, now time.Time) int {
	if s == nil {
		return 0
	}
	if ttl <= 0 {
		return 0
	}
	removed := 0
	s.jobsMu.Lock()
	for jobID, job := range s.jobsByID {
		if job == nil {
			delete(s.jobsByID, jobID)
			removed++
			continue
		}
		if job.Estado != EstadoJobCompletado && job.Estado != EstadoJobError {
			continue
		}
		reference := job.UpdatedAt
		if job.CompletedAt != nil {
			reference = *job.CompletedAt
		}
		if now.Sub(reference) >= ttl {
			delete(s.jobsByID, jobID)
			removed++
		}
	}
	s.jobsMu.Unlock()
	return removed
}

func (s *Service) currentQueueDepthPeak() int {
	s.runtimeMu.RLock()
	defer s.runtimeMu.RUnlock()
	return s.extractQueuePeak
}

func (s *Service) registerQueueDepthPeak(depth int) int {
	s.runtimeMu.Lock()
	if depth > s.extractQueuePeak {
		s.extractQueuePeak = depth
	}
	peak := s.extractQueuePeak
	s.runtimeMu.Unlock()
	return peak
}

func (s *Service) extractWorkerLoop(workerID int, queue <-chan string) {
	for jobID := range queue {
		s.runExtractJob(workerID, jobID)
	}
}

func (s *Service) runExtractJob(workerID int, jobID string) {
	started := time.Now()
	s.updateJob(jobID, func(job *extractLibroJob) {
		job.Estado = EstadoJobEnProgreso
		job.Progress = 10
		job.Message = "iniciando extraccion"
		job.StartedAt = &started
		if !job.QueuedAt.IsZero() {
			job.WaitMs = started.Sub(job.QueuedAt).Milliseconds()
		}
		job.WorkerID = workerID
		job.UpdatedAt = started
	})

	s.updateJob(jobID, func(job *extractLibroJob) {
		job.Progress = 35
		job.Message = "procesando contenido"
		job.UpdatedAt = time.Now()
	})

	job := s.getJob(jobID)
	if job == nil {
		return
	}

	runner := s.extractRunner
	if runner == nil {
		runner = s.ExtractLibro
	}
	result, err := runner(context.Background(), job.TrabajoID, job.Req, job.UserID, job.Role)
	if err != nil {
		now := time.Now()
		runMs := now.Sub(started).Milliseconds()
		errorType := classifyExtractError(err)
		message := userErrorMessage(errorType, err)
		s.updateJob(jobID, func(current *extractLibroJob) {
			current.Estado = EstadoJobError
			current.Progress = 100
			current.Message = "extraccion fallo"
			current.Error = &message
			current.ErrorType = &errorType
			current.ErrorMessage = &message
			current.RunMs = runMs
			current.TotalMs = calcJobTotalDurationMs(current, now)
			current.UpdatedAt = now
			current.CompletedAt = &now
			current.FailedAt = &now
		})
		return
	}

	now := time.Now()
	runMs := now.Sub(started).Milliseconds()
	s.updateJob(jobID, func(current *extractLibroJob) {
		current.Estado = EstadoJobCompletado
		current.Progress = 100
		current.Message = "extraccion completada"
		current.Result = result
		current.RunMs = runMs
		current.TotalMs = calcJobTotalDurationMs(current, now)
		current.UpdatedAt = now
		current.CompletedAt = &now
	})
}

func (s *Service) SetModelLifecycleMetadata(trainingRevision string, benchmarkBatchID string) {
	if s == nil {
		return
	}
	s.modelTrainingRevision = strings.TrimSpace(trainingRevision)
	s.benchmarkBatchID = strings.TrimSpace(benchmarkBatchID)
	if s.benchmarkBatchID == "" {
		s.benchmarkBatchID = s.modelTrainingRevision
	}
}

func (s *Service) StartExtractLibroAsync(ctx context.Context, trabajoID string, req ExtractLibroRequest, userID, role string) (*ExtractLibroAsyncResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}
	job, err := s.enqueueExtractJob(trabajoID, req, userID, role)
	if err != nil {
		return nil, err
	}

	return &ExtractLibroAsyncResponse{
		JobID:          job.JobID,
		TrabajoID:      job.TrabajoID,
		Estado:         job.Estado,
		Progress:       job.Progress,
		Message:        job.Message,
		QueuedAt:       job.QueuedAt,
		QueueDepthPeak: job.QueueDepthPeak,
	}, nil
}

func (s *Service) GetExtractLibroJob(ctx context.Context, trabajoID, jobID, userID, role string) (*LibroExtractJobStatusResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}

	s.jobsMu.RLock()
	job, ok := s.jobsByID[jobID]
	s.jobsMu.RUnlock()
	if !ok || job.TrabajoID != trabajoID {
		return nil, errors.New("job no encontrado")
	}

	now := time.Now()
	return &LibroExtractJobStatusResponse{
		JobID:          job.JobID,
		TrabajoID:      job.TrabajoID,
		Estado:         job.Estado,
		Progress:       job.Progress,
		Message:        job.Message,
		Error:          job.Error,
		ErrorType:      job.ErrorType,
		ErrorMessage:   job.ErrorMessage,
		QueuedAt:       job.QueuedAt,
		StartedAt:      job.StartedAt,
		UpdatedAt:      job.UpdatedAt,
		CompletedAt:    job.CompletedAt,
		FailedAt:       job.FailedAt,
		WaitMs:         job.WaitMs,
		RunMs:          calcJobRunDurationMs(job, now),
		DurationMs:     calcJobRunDurationMs(job, now),
		TotalMs:        calcJobTotalDurationMs(job, now),
		QueueDepthPeak: job.QueueDepthPeak,
		Result:         job.Result,
	}, nil
}

func (s *Service) enqueueExtractJob(trabajoID string, req ExtractLibroRequest, userID, role string) (*extractLibroJob, error) {
	if s == nil {
		return nil, errors.New("servicio de libro no disponible")
	}
	s.ensureAsyncWorkersStarted()

	jobID, err := newExtractJobID()
	if err != nil {
		return nil, err
	}

	s.runtimeMu.RLock()
	queue := s.extractQueue
	depthBefore := 0
	if queue != nil {
		depthBefore = len(queue)
	}
	s.runtimeMu.RUnlock()
	if queue == nil {
		return nil, errors.New("cola de extraccion no disponible")
	}

	now := time.Now()
	job := &extractLibroJob{
		JobID:     jobID,
		TrabajoID: trabajoID,
		UserID:    userID,
		Role:      role,
		Req:       req,
		Estado:    EstadoJobPendiente,
		Progress:  0,
		Message:   "job pendiente",
		QueuedAt:  now,
		UpdatedAt: now,
	}

	s.jobsMu.Lock()
	s.jobsByID[jobID] = job
	s.jobsMu.Unlock()

	peak := s.registerQueueDepthPeak(depthBefore + 1)
	job.QueueDepthPeak = peak

	select {
	case queue <- jobID:
		return job, nil
	default:
		s.jobsMu.Lock()
		delete(s.jobsByID, jobID)
		s.jobsMu.Unlock()
		return nil, errors.New("cola de extraccion saturada. Intenta nuevamente en unos segundos")
	}
}

func (s *Service) getJob(jobID string) *extractLibroJob {
	s.jobsMu.RLock()
	defer s.jobsMu.RUnlock()
	return s.jobsByID[jobID]
}

func (s *Service) updateJob(jobID string, updater func(job *extractLibroJob)) {
	s.jobsMu.Lock()
	defer s.jobsMu.Unlock()
	if job, ok := s.jobsByID[jobID]; ok {
		updater(job)
	}
}

func newExtractJobID() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("no se pudo generar job id: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

func (s *Service) GetEstado(ctx context.Context, trabajoID, userID, role string) (*LibroEstadoResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}
	ext, err := s.repo.GetExtraccionByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	preguntas, err := s.repo.ListPreguntasByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	return &LibroEstadoResponse{Extraccion: ext, Preguntas: preguntas}, nil
}

func (s *Service) ExtractLibro(ctx context.Context, trabajoID string, req ExtractLibroRequest, userID, role string) (*ExtractLibroResponse, error) {
	start := time.Now()
	var hadFallback bool
	var finalErr error
	defer func() {
		s.recordExtractMetrics(trabajoID, time.Since(start), hadFallback, finalErr)
	}()

	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		finalErr = err
		return nil, err
	}

	contentHash := req.HashContenido
	if contentHash != nil {
		trimmed := strings.TrimSpace(*contentHash)
		contentHash = &trimmed
	}
	if contentHash == nil || *contentHash == "" {
		h := hashNormalizedContent(req.Contenido)
		contentHash = &h
	}

	var fileHash *string
	if req.HashArchivo != nil {
		trimmed := strings.TrimSpace(*req.HashArchivo)
		if trimmed != "" {
			fileHash = &trimmed
		}
	}

	idioma := strings.TrimSpace(req.Idioma)
	if idioma == "" {
		idioma = "es"
	}

	titulo := inferLibroTitulo(req.ArchivoURL, trabajoID)
	libroRecurso, err := s.repo.FindLibroRecursoByHashes(ctx, *contentHash, fileHash, "v1")
	if err != nil {
		finalErr = err
		return nil, err
	}

	if libroRecurso == nil {
		byTitle, findTitleErr := s.repo.FindLatestLibroRecursoByTitulo(ctx, titulo)
		if findTitleErr != nil {
			finalErr = findTitleErr
			return nil, findTitleErr
		}
		if byTitle != nil {
			sameContent := strings.EqualFold(strings.TrimSpace(byTitle.HashContenido), strings.TrimSpace(*contentHash))
			sameFile := byTitle.HashArchivo != nil && fileHash != nil && strings.EqualFold(strings.TrimSpace(*byTitle.HashArchivo), strings.TrimSpace(*fileHash))

			if sameContent || sameFile {
				libroRecurso = byTitle
			} else {
				updateMetadata := asRawJSON(map[string]interface{}{
					"origen":          "trabajo_libro_extract",
					"accion":          "actualizacion_por_nueva_informacion",
					"actualizado_por": userID,
				})
				libroRecurso, err = s.repo.RefreshLibroRecursoForNewContenido(ctx, LibroRecurso{
					ID:             byTitle.ID,
					Titulo:         titulo,
					ArchivoURL:     req.ArchivoURL,
					Idioma:         idioma,
					HashContenido:  *contentHash,
					HashArchivo:    fileHash,
					HashVersion:    "v1",
					Estado:         EstadoLibroRecursoProcesando,
					EsPublico:      true,
					Metadata:       updateMetadata,
					CreatedBy:      &userID,
					PaginasTotales: nil,
					Descripcion:    byTitle.Descripcion,
				})
				if err != nil {
					finalErr = err
					return nil, err
				}
			}
		}
	}

	paginaInicio := 1
	if req.PaginaInicio != nil && *req.PaginaInicio > 0 {
		paginaInicio = *req.PaginaInicio
	}

	if libroRecurso != nil && !libroRecurso.EsPublico {
		if err := s.repo.EnsureLibroRecursoPublic(ctx, libroRecurso.ID); err != nil {
			finalErr = err
			return nil, err
		}
		libroRecurso.EsPublico = true
	}

	notaExtrayendo := "extrayendo con IA"
	if libroRecurso != nil && libroRecurso.Estado == EstadoLibroRecursoCompletado {
		reusedResp, reused, reuseErr := s.tryReuseLibroRecurso(ctx, trabajoID, req, userID, libroRecurso)
		if reuseErr != nil {
			finalErr = reuseErr
			return nil, reuseErr
		}
		if reused {
			return reusedResp, nil
		}
	}
	if libroRecurso == nil {
		libroRecurso, err = s.repo.CreateLibroRecurso(ctx, LibroRecurso{
			Titulo:        titulo,
			Descripcion:   nil,
			ArchivoURL:    req.ArchivoURL,
			Idioma:        idioma,
			HashContenido: *contentHash,
			HashArchivo:   fileHash,
			HashVersion:   "v1",
			Estado:        EstadoLibroRecursoProcesando,
			EsPublico:     true,
			Metadata:      []byte(`{"origen":"trabajo_libro_extract"}`),
			CreatedBy:     &userID,
		})
		if err != nil {
			finalErr = err
			return nil, err
		}
	}

	var libroRecursoID *string
	if libroRecurso != nil {
		libroRecursoID = &libroRecurso.ID
	}

	extraccion, err := s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:       trabajoID,
		LibroRecursoID:  libroRecursoID,
		ArchivoURL:      req.ArchivoURL,
		Idioma:          idioma,
		PaginaInicio:    paginaInicio,
		PaginaFin:       req.PaginaFin,
		Estado:          EstadoExtrayendo,
		NotasExtraccion: &notaExtrayendo,
		CreatedBy:       &userID,
	})
	if err != nil {
		finalErr = err
		return nil, err
	}

	preguntas, usadoFallback, notaFinal, err := s.analysisAI.ExtractQuestions(ctx, req)
	if err != nil {
		finalErr = err
		return nil, err
	}
	hadFallback = usadoFallback
	if len(preguntas) == 0 {
		finalErr = errors.New("no se pudieron extraer preguntas")
		return nil, finalErr
	}
	pageGroups := buildPageGroupsFromPreguntas(preguntas)
	snapshots := mergeExtraccionSnapshots(nil, "ai_raw", preguntas, s.appendModelLifecycleMetadata(map[string]interface{}{
		"model_profile":        "analysis",
		"model_name":           safeAIModelName(s.analysisAI),
		"model_tag":            safeAIModelName(s.analysisAI),
		"modo_formulario":      normalizeModoFormulario(req.ModoFormulario),
		"used_fallback":        usadoFallback,
		"page_groups_detected": len(pageGroups),
	}))

	if err := s.repo.ReplacePreguntas(ctx, trabajoID, preguntas); err != nil {
		finalErr = err
		return nil, err
	}

	imageByPage := normalizeImageMapByPage(req.ImagenesPorPagina)
	metadataByPage := normalizeMetadataMapByPage(req.ImagenesMetadata)
	contentChunks := splitContentByPageMarkers(req.Contenido, req.PaginaInicio, imageByPage, metadataByPage)
	maxPageFromContent := 0
	for _, chunk := range contentChunks {
		if chunk.Page > maxPageFromContent {
			maxPageFromContent = chunk.Page
		}
	}

	if libroRecurso != nil {
		pageContents := buildLibroContenidoPaginas(contentChunks)
		if err := s.repo.UpsertLibroContenidoPaginas(ctx, libroRecurso.ID, pageContents); err != nil {
			finalErr = err
			return nil, err
		}
	}

	// Calculate total pages detected from the extracted questions
	paginasDetectadas := make(map[int]bool)
	for _, p := range preguntas {
		if p.PaginaLibro != nil && *p.PaginaLibro > 0 {
			paginasDetectadas[*p.PaginaLibro] = true
		}
	}
	totalPaginasDetectadas := len(paginasDetectadas)
	if maxPageFromContent > totalPaginasDetectadas {
		totalPaginasDetectadas = maxPageFromContent
	}
	if totalPaginasDetectadas == 0 && req.PaginaFin != nil && *req.PaginaFin > 0 {
		// Fallback if no pages detected in questions, use the range provided
		totalPaginasDetectadas = *req.PaginaFin
	}

	prom := avgConfianza(preguntas)
	nota := notaFinal
	extraccion, err = s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:           trabajoID,
		LibroRecursoID:      libroRecursoID,
		ArchivoURL:          req.ArchivoURL,
		Idioma:              idioma,
		PaginaInicio:        paginaInicio,
		PaginaFin:           req.PaginaFin,
		Estado:              EstadoCompletado,
		PreguntasDetectadas: len(preguntas),
		ConfianzaPromedio:   prom,
		NotasExtraccion:     &nota,
		Snapshots:           snapshots,
		UsadoFallback:       usadoFallback,
	})
	if err != nil {
		finalErr = err
		return nil, err
	}

	if err := s.repo.UpdateTrabajoPostExtraccion(ctx, trabajoID, extraccion.ID); err != nil {
		finalErr = err
		return nil, err
	}

	if libroRecurso != nil {
		if err := s.repo.UpdateLibroRecursoAfterExtract(ctx, libroRecurso.ID, EstadoLibroRecursoCompletado, &totalPaginasDetectadas, req.ArchivoURL); err != nil {
			finalErr = err
			return nil, err
		}
		if err := s.repo.LinkTrabajoLibroRecurso(ctx, trabajoID, libroRecurso.ID, userID); err != nil {
			finalErr = err
			return nil, err
		}
	}

	stored, err := s.repo.ListPreguntasByTrabajo(ctx, trabajoID)
	if err != nil {
		finalErr = err
		return nil, err
	}

	return &ExtractLibroResponse{
		Extraccion:     extraccion,
		Preguntas:      stored,
		PageGroups:     buildPageGroupsFromPreguntas(stored),
		Reutilizado:    false,
		LibroRecursoID: libroRecursoID,
	}, nil
}

func (s *Service) tryReuseLibroRecurso(ctx context.Context, trabajoID string, req ExtractLibroRequest, userID string, recurso *LibroRecurso) (*ExtractLibroResponse, bool, error) {
	if recurso == nil {
		return nil, false, nil
	}

	preguntas, err := s.repo.ListPreguntasByLibroRecurso(ctx, recurso.ID)
	if err != nil {
		return nil, false, err
	}
	if len(preguntas) == 0 {
		return nil, false, nil
	}

	copyPreguntas := make([]TrabajoPregunta, 0, len(preguntas))
	for idx := range preguntas {
		item := preguntas[idx]
		item.ID = ""
		item.TrabajoID = trabajoID
		copyPreguntas = append(copyPreguntas, item)
	}

	if err := s.repo.ReplacePreguntas(ctx, trabajoID, copyPreguntas); err != nil {
		return nil, false, err
	}

	nota := fmt.Sprintf("reutilizado desde libro_recurso %s", recurso.ID)
	extraccion, err := s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:           trabajoID,
		LibroRecursoID:      &recurso.ID,
		ArchivoURL:          req.ArchivoURL,
		Idioma:              recurso.Idioma,
		PaginaInicio:        1,
		PaginaFin:           req.PaginaFin,
		Estado:              EstadoCompletado,
		PreguntasDetectadas: len(copyPreguntas),
		ConfianzaPromedio:   avgConfianza(copyPreguntas),
		NotasExtraccion:     &nota,
		Snapshots: mergeExtraccionSnapshots(nil, "ai_raw", copyPreguntas, s.appendModelLifecycleMetadata(map[string]interface{}{
			"model_profile":     "analysis",
			"model_name":        "reused_libro_recurso",
			"model_tag":         "reused_libro_recurso",
			"used_fallback":     false,
			"reutilizado":       true,
			"source_recurso_id": recurso.ID,
		})),
		UsadoFallback: false,
	})
	if err != nil {
		return nil, false, err
	}

	if err := s.repo.UpdateTrabajoPostExtraccion(ctx, trabajoID, extraccion.ID); err != nil {
		return nil, false, err
	}
	if err := s.repo.LinkTrabajoLibroRecurso(ctx, trabajoID, recurso.ID, userID); err != nil {
		return nil, false, err
	}

	stored, err := s.repo.ListPreguntasByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, false, err
	}

	return &ExtractLibroResponse{
		Extraccion:     extraccion,
		Preguntas:      stored,
		PageGroups:     buildPageGroupsFromPreguntas(stored),
		Reutilizado:    true,
		LibroRecursoID: &recurso.ID,
	}, true, nil
}

func (s *Service) GetObservability(ctx context.Context, trabajoID, userID, role string) (*LibroObservabilityResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}

	s.metricsMu.RLock()
	defer s.metricsMu.RUnlock()

	if metric, ok := s.metricsByID[trabajoID]; ok {
		copyMetric := *metric
		return &copyMetric, nil
	}

	return &LibroObservabilityResponse{TrabajoID: trabajoID}, nil
}

func (s *Service) ListLibroRecursos(ctx context.Context, q LibroRecursoListQuery, userID, role string) (*LibroRecursoListResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}

	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 20
	}
	if q.PageSize > 100 {
		q.PageSize = 100
	}

	items, total, err := s.repo.ListLibroRecursos(ctx, q)
	if err != nil {
		return nil, err
	}

	return &LibroRecursoListResponse{
		Items:    items,
		Total:    total,
		Page:     q.Page,
		PageSize: q.PageSize,
	}, nil
}

func (s *Service) GetLibroRecursoDetail(ctx context.Context, recursoID, userID, role string) (*LibroRecursoDetailResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" {
		return nil, errors.New("recurso_id es requerido")
	}
	return s.repo.GetLibroRecursoDetail(ctx, recursoID)
}

func (s *Service) GetLibroRecursoPagina(ctx context.Context, recursoID string, pagina int, userID, role string) (*LibroRecursoPaginaResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" {
		return nil, errors.New("recurso_id es requerido")
	}
	if pagina < 1 {
		return nil, errors.New("pagina invalida")
	}

	detail, err := s.repo.GetLibroRecursoDetail(ctx, recursoID)
	if err != nil {
		return nil, err
	}

	totalPaginas := pagina
	if detail.PaginasTotales != nil && *detail.PaginasTotales > 0 {
		totalPaginas = *detail.PaginasTotales
	} else if detail.PaginasDetectadas > 0 {
		totalPaginas = int(detail.PaginasDetectadas)
	}
	if totalPaginas > 0 && pagina > totalPaginas {
		return nil, errors.New("pagina fuera de rango")
	}

	preguntas, err := s.repo.ListPreguntasByLibroRecursoAndPagina(ctx, recursoID, pagina)
	if err != nil {
		return nil, err
	}

	contenidoPagina, err := s.repo.GetLibroContenidoPagina(ctx, recursoID, pagina)
	if err != nil {
		return nil, err
	}
	contenido := ""
	var imagenBase64 *string
	if contenidoPagina != nil {
		contenido = strings.TrimSpace(contenidoPagina.Contenido)
		imagenBase64 = contenidoPagina.ImagenBase64
	}

	viewMetadata := asRawJSON(map[string]interface{}{
		"origen": "libro_recurso_viewer",
		"pagina": pagina,
	})
	_ = s.repo.CreateLibroRecursoView(ctx, recursoID, pagina, &userID, viewMetadata)

	watermarkText := fmt.Sprintf("Arcanea â€¢ %s â€¢ %s", role, userID)

	return &LibroRecursoPaginaResponse{
		LibroRecursoID: recursoID,
		Pagina:         pagina,
		TotalPaginas:   totalPaginas,
		Contenido:      contenido,
		ImagenBase64:   imagenBase64,
		Preguntas:      preguntas,
		Watermark: ViewerWatermarkConfig{
			Enabled: true,
			Text:    watermarkText,
		},
		Controles: ViewerControls{
			DisableDownload:    true,
			DisablePrint:       true,
			DisableContextMenu: true,
		},
	}, nil
}

func (s *Service) CreateLibroChatSession(ctx context.Context, recursoID string, req CreateLibroChatSessionRequest, userID, role string) (*LibroChatSession, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" {
		return nil, errors.New("recurso_id es requerido")
	}
	if _, err := s.repo.GetLibroRecursoDetail(ctx, recursoID); err != nil {
		return nil, err
	}

	titulo := trimOrNil(req.Titulo)
	session, err := s.repo.CreateLibroChatSession(ctx, LibroChatSession{
		LibroRecursoID: recursoID,
		Titulo:         titulo,
		CreatedBy:      &userID,
	})
	if err != nil {
		return nil, err
	}
	return session, nil
}

func (s *Service) ListLibroChatSessions(ctx context.Context, recursoID, userID, role string, limit, offset int) (*LibroChatSessionListResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" {
		return nil, errors.New("recurso_id es requerido")
	}
	if _, err := s.repo.GetLibroRecursoDetail(ctx, recursoID); err != nil {
		return nil, err
	}

	items, total, err := s.repo.ListLibroChatSessions(ctx, recursoID, limit, offset)
	if err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	return &LibroChatSessionListResponse{
		Items:  items,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}

func (s *Service) GetLibroChatMessages(ctx context.Context, recursoID, sessionID, userID, role string, limit int) ([]LibroChatMessage, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" || strings.TrimSpace(sessionID) == "" {
		return nil, errors.New("recurso_id y session_id son requeridos")
	}

	session, err := s.repo.GetLibroChatSession(ctx, recursoID, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, errors.New("sesion no encontrada")
	}

	return s.repo.ListLibroChatMessages(ctx, sessionID, limit)
}

func (s *Service) SendLibroChatMessage(ctx context.Context, recursoID, sessionID string, req LibroChatSendMessageRequest, userID, role string) (*LibroChatSendMessageResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" || strings.TrimSpace(sessionID) == "" {
		return nil, errors.New("recurso_id y session_id son requeridos")
	}
	message := strings.TrimSpace(req.Mensaje)
	if message == "" {
		return nil, errors.New("mensaje es requerido")
	}

	session, err := s.repo.GetLibroChatSession(ctx, recursoID, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, errors.New("sesion no encontrada")
	}

	now := time.Now()
	if _, err := s.repo.CreateLibroChatMessage(ctx, LibroChatMessage{
		SessionID: sessionID,
		Role:      ChatMessageRoleUser,
		Content:   message,
		Metadata:  []byte(`{"source":"user"}`),
		CreatedBy: &userID,
	}); err != nil {
		return nil, err
	}

	history, err := s.repo.ListLibroChatMessages(ctx, sessionID, 8)
	if err != nil {
		return nil, err
	}

	mcpBundle, err := s.mcp.BuildChatContext(ctx, recursoID, message)
	if err != nil {
		return nil, err
	}

	policyMode := "teacher_full"
	if role == "student" {
		policyMode = "student_summary_hints"
	}

	guardrailApplied := false
	var guardrailReason *string
	matchedPreguntas := []TrabajoPregunta{}
	if role == "student" {
		matchedPreguntas, _ = s.repo.SearchPreguntasContextByLibroRecurso(ctx, recursoID, message, 8)
		if apply, reason := shouldApplyStudentGuardrail(message, matchedPreguntas); apply {
			guardrailApplied = true
			guardrailReason = &reason
		}
	}

	systemPrompt := buildLibroChatSystemPrompt(role, guardrailApplied)
	messages := make([]map[string]string, 0, 12)
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt + "\n\n" + mcpBundle.PromptContext})

	for _, item := range history {
		roleText := string(item.Role)
		if roleText != "user" && roleText != "assistant" && roleText != "system" {
			continue
		}
		messages = append(messages, map[string]string{
			"role":    roleText,
			"content": strings.TrimSpace(item.Content),
		})
	}

	if len(messages) == 1 || messages[len(messages)-1]["role"] != "user" {
		messages = append(messages, map[string]string{"role": "user", "content": message})
	}

	started := time.Now()
	answer, usedFallback, modelName, aiErr := s.mcpAI.GenerateChatAnswer(ctx, messages)
	latencyMs := time.Since(started).Milliseconds()

	errorCode := (*string)(nil)
	if aiErr != nil || strings.TrimSpace(answer) == "" {
		fallback := buildChatFallbackAnswer(message, mcpBundle)
		answer = fallback
		usedFallback = true
		e := "model_unavailable"
		errorCode = &e
	}
	if role == "student" {
		sanitizedAnswer, sanitized, sanitizedReason := sanitizeStudentAssistantAnswer(message, answer, guardrailApplied, guardrailReason, matchedPreguntas, mcpBundle)
		answer = sanitizedAnswer
		if sanitized {
			guardrailApplied = true
			guardrailReason = sanitizedReason
			if errorCode == nil {
				code := "student_guardrail"
				errorCode = &code
			}
		}
	}

	meta := asRawJSON(s.appendModelLifecycleMetadata(map[string]interface{}{
		"tool_calls":         mcpBundle.ToolCalls,
		"policy_mode":        policyMode,
		"guardrail_applied":  guardrailApplied,
		"guardrail_reason":   guardrailReason,
		"model_profile":      "mcp",
		"model_tag":          resolveModelTag(modelName, s.mcpAI),
		"mcp_model_ref":      safeAIModelName(s.mcpAI),
		"matched_questions":  len(matchedPreguntas),
		"analysis_model_ref": safeAIModelName(s.analysisAI),
	}))
	latencyInt := int(latencyMs)
	var modelPtr *string
	if strings.TrimSpace(modelName) != "" {
		trimmedModel := strings.TrimSpace(modelName)
		modelPtr = &trimmedModel
	}

	assistantMsg, err := s.repo.CreateLibroChatMessage(ctx, LibroChatMessage{
		SessionID:    sessionID,
		Role:         ChatMessageRoleAssistant,
		Content:      answer,
		Metadata:     meta,
		Model:        modelPtr,
		LatencyMs:    &latencyInt,
		UsedFallback: usedFallback,
		CreatedBy:    &userID,
	})
	if err != nil {
		return nil, err
	}

	if err := s.repo.TouchLibroChatSession(ctx, sessionID, now); err != nil {
		return nil, err
	}

	telemMeta := asRawJSON(s.appendModelLifecycleMetadata(map[string]interface{}{
		"message_id":         assistantMsg.ID,
		"tool_calls":         mcpBundle.ToolCalls,
		"policy_mode":        policyMode,
		"guardrail_applied":  guardrailApplied,
		"guardrail_reason":   guardrailReason,
		"model_profile":      "mcp",
		"model_tag":          resolveModelTag(modelName, s.mcpAI),
		"mcp_model_ref":      safeAIModelName(s.mcpAI),
		"matched_questions":  len(matchedPreguntas),
		"analysis_model_ref": safeAIModelName(s.analysisAI),
	}))
	_ = s.repo.CreateLibroChatTelemetria(ctx, LibroChatTelemetria{
		SessionID:      sessionID,
		LibroRecursoID: recursoID,
		UserID:         &userID,
		EventType:      "chat_message",
		LatencyMs:      &latencyInt,
		UsedFallback:   usedFallback,
		ErrorCode:      errorCode,
		Metadata:       telemMeta,
	})

	return &LibroChatSendMessageResponse{
		SessionID:        sessionID,
		RecursoID:        recursoID,
		UserMessage:      message,
		Answer:           answer,
		Model:            modelPtr,
		UsedFallback:     usedFallback,
		LatencyMs:        latencyMs,
		ToolCalls:        mcpBundle.ToolCalls,
		PolicyMode:       policyMode,
		GuardrailApplied: guardrailApplied,
		GuardrailReason:  guardrailReason,
	}, nil
}

func (s *Service) GetLibroChatReporte(ctx context.Context, recursoID, userID, role string, topToolsLimit int) (*LibroChatReportResponse, error) {
	if err := authorizeLibroChatReportAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" {
		return nil, errors.New("recurso_id es requerido")
	}
	if _, err := s.repo.GetLibroRecursoDetail(ctx, recursoID); err != nil {
		return nil, err
	}

	report, err := s.repo.GetLibroChatReport(ctx, recursoID, topToolsLimit)
	if err != nil {
		return nil, err
	}
	return report, nil
}

func (s *Service) SendLibroChatFeedback(
	ctx context.Context,
	recursoID, sessionID, messageID string,
	req LibroChatFeedbackRequest,
	userID, role string,
) (*LibroChatFeedbackResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(recursoID) == "" || strings.TrimSpace(sessionID) == "" || strings.TrimSpace(messageID) == "" {
		return nil, errors.New("recurso_id, session_id y message_id son requeridos")
	}
	reaction := strings.ToLower(strings.TrimSpace(req.Reaction))
	switch reaction {
	case "up", "down":
	default:
		return nil, errors.New("reaction invalida: usa up o down")
	}

	session, err := s.repo.GetLibroChatSession(ctx, recursoID, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, errors.New("sesion no encontrada")
	}
	message, err := s.repo.GetLibroChatMessage(ctx, sessionID, messageID)
	if err != nil {
		return nil, err
	}
	if message == nil {
		return nil, errors.New("mensaje no encontrado")
	}

	comment := trimOrNil(req.Comment)
	meta := asRawJSON(map[string]interface{}{
		"message_id": messageID,
		"reaction":   reaction,
		"comment":    comment,
		"source":     "chat_feedback",
	})
	_ = s.repo.CreateLibroChatTelemetria(ctx, LibroChatTelemetria{
		SessionID:      sessionID,
		LibroRecursoID: recursoID,
		UserID:         &userID,
		EventType:      "chat_feedback",
		UsedFallback:   false,
		Metadata:       meta,
	})

	return &LibroChatFeedbackResponse{
		Ok:        true,
		MessageID: messageID,
	}, nil
}

func (s *Service) RevisarLibro(ctx context.Context, trabajoID string, req RevisionLibroRequest, userID, role string) (*LibroEstadoResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}
	if len(req.Preguntas) == 0 {
		return nil, errors.New("debe enviar al menos una pregunta")
	}

	preguntas := make([]TrabajoPregunta, 0, len(req.Preguntas))
	nextOrden := 1
	for _, p := range req.Preguntas {
		texto := strings.TrimSpace(p.Texto)
		if texto == "" {
			continue
		}

		baseTipo := normalizeTipoPregunta(p.Tipo)
		parts := splitCompositeQuestionText(texto)
		if len(parts) == 0 {
			continue
		}

		for _, part := range parts {
			itemText := strings.TrimSpace(part)
			if itemText == "" {
				continue
			}

			puntajeMaximo := 1.0
			if p.PuntajeMaximo != nil && *p.PuntajeMaximo > 0 {
				puntajeMaximo = *p.PuntajeMaximo
			}

			tipo := inferQuestionTypeFromText(baseTipo, itemText)
			opciones := normalizeOptionsForQuestion(p.Opciones, tipo, itemText, len(parts) == 1)
			tipo, opciones, respuestaCorrecta := normalizeQuestionFormByMode(
				tipo,
				opciones,
				p.RespuestaCorrecta,
				p.ConfianzaIA,
				ModoFormularioMixtoAuto,
				s.minClosedConfidenceThreshold(),
			)

			var imageBase64 *string
			var imageFuente *string
			manualOverride := p.ImagenManualOverride != nil && *p.ImagenManualOverride
			if manualOverride {
				imageBase64 = trimOrNil(p.ImagenBase64)
				if imageBase64 != nil {
					imageFuente = trimOrNil(p.ImagenFuente)
					if imageFuente == nil {
						manualSource := "manual_override"
						imageFuente = &manualSource
					}
				}
			} else if isVisualCueQuestion(itemText) {
				imageBase64 = p.ImagenBase64
				imageFuente = p.ImagenFuente
			}

			preguntas = append(preguntas, TrabajoPregunta{
				Texto:                 itemText,
				Tipo:                  tipo,
				Opciones:              opciones,
				RespuestaCorrecta:     respuestaCorrecta,
				PuntajeMaximo:         puntajeMaximo,
				PaginaLibro:           p.PaginaLibro,
				ConfianzaIA:           p.ConfianzaIA,
				ImagenBase64:          imageBase64,
				ImagenFuente:          imageFuente,
				RespuestaEsperadaTipo: normalizeRespuestaEsperadaTipo(p.RespuestaEsperadaTipo, tipo),
				Placeholder:           trimOrNil(p.Placeholder),
				Orden:                 nextOrden,
			})
			nextOrden++
		}
	}
	if len(preguntas) == 0 {
		return nil, errors.New("debe mantener al menos una pregunta valida")
	}
	currentExtraccion, err := s.repo.GetExtraccionByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	reviewSnapshots := mergeExtraccionSnapshots(rawSnapshotsFromExtraccion(currentExtraccion), "review_final", preguntas, map[string]interface{}{
		"reviewed_by": userID,
	})

	if err := s.repo.ReplacePreguntas(ctx, trabajoID, preguntas); err != nil {
		return nil, err
	}

	estado := EstadoRevision
	if req.Aprobar {
		estado = EstadoAprobado
	}
	extraccion, err := s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:           trabajoID,
		Estado:              estado,
		PreguntasDetectadas: len(preguntas),
		NotasRevision:       req.NotasRevision,
		Snapshots:           reviewSnapshots,
		RevisadoPor:         &userID,
		ConfianzaPromedio:   avgConfianza(preguntas),
	})
	if err != nil {
		return nil, err
	}

	stored, err := s.repo.ListPreguntasByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	return &LibroEstadoResponse{Extraccion: extraccion, Preguntas: stored}, nil
}

func (s *Service) ConfirmarLibro(ctx context.Context, trabajoID string, req ConfirmarLibroRequest, userID, role string) (*ConfirmarLibroResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}

	ext, err := s.repo.GetExtraccionByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	if ext == nil {
		return nil, errors.New("no existe una extraccion para este trabajo")
	}
	if ext.Estado != EstadoAprobado {
		return nil, errors.New("la extraccion debe estar aprobada antes de confirmar")
	}

	preguntas, err := s.repo.ListPreguntasByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	if len(preguntas) == 0 {
		return nil, errors.New("no se puede confirmar sin preguntas")
	}

	ext, err = s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:     trabajoID,
		Estado:        EstadoAprobado,
		NotasRevision: req.NotasFinales,
		ConfirmadoPor: &userID,
	})
	if err != nil {
		return nil, err
	}

	t, err := s.repo.GetTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}

	if req.Publicar {
		t, err = s.repo.UpdateTrabajoEstado(ctx, trabajoID, "publicado")
		if err != nil {
			return nil, err
		}
	}

	return &ConfirmarLibroResponse{Trabajo: t, Extraccion: ext}, nil
}

func (s *Service) authorizeTrabajo(ctx context.Context, trabajoID, userID, role string) error {
	if strings.TrimSpace(trabajoID) == "" {
		return errors.New("trabajo_id es requerido")
	}
	if role != "teacher" && role != "admin" && role != "super_admin" {
		return errors.New("no autorizado")
	}
	if role == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("no autorizado para este trabajo")
		}
	}
	_, err := s.repo.GetTrabajo(ctx, trabajoID)
	if err != nil {
		return err
	}
	return nil
}

func authorizeLibroRecursosAccess(role string) error {
	switch role {
	case "student", "teacher", "admin", "super_admin", "resource_manager":
		return nil
	default:
		return errors.New("no autorizado")
	}
}

func authorizeLibroChatReportAccess(role string) error {
	switch role {
	case "teacher", "admin", "super_admin", "resource_manager":
		return nil
	default:
		return errors.New("no autorizado")
	}
}

var (
	studentDirectAnswerRequestRe = regexp.MustCompile(`\b(?:dime|dame|pasame|pasa|indica|di|quiero|necesito)\b.{0,40}\b(?:respuesta|solucion|opcion|resultado|resuelta)\b`)
	studentQuestionRefRe         = regexp.MustCompile(`\b(?:pregunta|ejercicio|item|reactivo|numero|nro|pagina|pag)\b`)
	studentAnswerLeakRe          = regexp.MustCompile(`(?m)\b(?:la respuesta(?:\s+correcta)?\s+es|respuesta(?:\s+final)?\s*[:\-]|opcion\s+correcta|solucion\s*[:\-]|answer\s*[:\-])\b`)
	studentOptionLeakLineRe      = regexp.MustCompile(`(?m)^\s*(?:[a-d]\)|[a-d]\.|opcion\s*[a-d]|respuesta\s*[a-d])\b`)
)

func buildPageGroupsFromPreguntas(preguntas []TrabajoPregunta) []LibroPageGroupSummary {
	if len(preguntas) == 0 {
		return []LibroPageGroupSummary{}
	}

	grouped := make(map[int]*LibroPageGroupSummary, len(preguntas))
	for _, p := range preguntas {
		if p.PaginaLibro == nil || *p.PaginaLibro <= 0 {
			continue
		}
		page := *p.PaginaLibro
		group, ok := grouped[page]
		if !ok {
			group = &LibroPageGroupSummary{Pagina: page}
			grouped[page] = group
		}
		group.PreguntasTotal++
		if p.Orden > 0 {
			group.Ordenes = append(group.Ordenes, p.Orden)
		}
	}

	if len(grouped) == 0 {
		return []LibroPageGroupSummary{}
	}

	pages := make([]int, 0, len(grouped))
	for page := range grouped {
		pages = append(pages, page)
	}
	sort.Ints(pages)

	out := make([]LibroPageGroupSummary, 0, len(pages))
	for _, page := range pages {
		group := grouped[page]
		if len(group.Ordenes) > 1 {
			sort.Ints(group.Ordenes)
		}
		out = append(out, *group)
	}
	return out
}

func rawSnapshotsFromExtraccion(ext *LibroExtraccion) json.RawMessage {
	if ext == nil || len(ext.Snapshots) == 0 {
		return nil
	}
	copied := make([]byte, len(ext.Snapshots))
	copy(copied, ext.Snapshots)
	return copied
}

func mergeExtraccionSnapshots(existing json.RawMessage, snapshotKey string, preguntas []TrabajoPregunta, metadata map[string]interface{}) json.RawMessage {
	key := strings.TrimSpace(snapshotKey)
	if key == "" {
		key = "snapshot"
	}

	root := make(map[string]interface{})
	if len(existing) > 0 && strings.TrimSpace(string(existing)) != "" {
		var parsed map[string]interface{}
		if err := json.Unmarshal(existing, &parsed); err == nil && parsed != nil {
			root = parsed
		}
	}

	snapshot := map[string]interface{}{
		"captured_at":     time.Now().UTC().Format(time.RFC3339),
		"preguntas_total": len(preguntas),
		"page_groups":     buildPageGroupsFromPreguntas(preguntas),
		"preguntas":       preguntas,
	}
	if len(metadata) > 0 {
		snapshot["metadata"] = metadata
	}
	root[key] = snapshot
	return asRawJSON(root)
}

func safeAIModelName(ai *AIService) string {
	if ai == nil {
		return ""
	}
	if model := ai.ConfiguredModelTag(); model != "" {
		return model
	}
	if fallback := ai.FallbackModelTag(); fallback != "" {
		return fallback
	}
	return ""
}

func resolveModelTag(modelName string, ai *AIService) string {
	if resolved := strings.TrimSpace(modelName); resolved != "" {
		return resolved
	}
	return safeAIModelName(ai)
}

func (s *Service) minClosedConfidenceThreshold() float64 {
	if s == nil || s.analysisAI == nil {
		return 0.72
	}
	return s.analysisAI.minClosedConfidenceThreshold()
}

func (s *Service) appendModelLifecycleMetadata(meta map[string]interface{}) map[string]interface{} {
	if meta == nil {
		meta = map[string]interface{}{}
	}
	if revision := strings.TrimSpace(s.modelTrainingRevision); revision != "" {
		meta["training_revision"] = revision
	}
	if batch := strings.TrimSpace(s.benchmarkBatchID); batch != "" {
		meta["benchmark_batch_id"] = batch
	}
	return meta
}

func shouldApplyStudentGuardrail(message string, matchedPreguntas []TrabajoPregunta) (bool, string) {
	normalized := normalizeGuardrailText(message)
	if normalized == "" {
		return false, ""
	}

	if studentDirectAnswerRequestRe.MatchString(normalized) {
		return true, "direct_answer_request"
	}
	if strings.Contains(normalized, "respuesta correcta") ||
		strings.Contains(normalized, "dame la respuesta") ||
		strings.Contains(normalized, "dime la respuesta") ||
		strings.Contains(normalized, "solo la respuesta") ||
		strings.Contains(normalized, "respuesta final") ||
		strings.Contains(normalized, "opcion correcta") ||
		strings.Contains(normalized, "resuelvelo") ||
		strings.Contains(normalized, "hazme la tarea") {
		return true, "direct_answer_request"
	}

	if len(matchedPreguntas) == 0 {
		return false, ""
	}

	if studentQuestionRefRe.MatchString(normalized) {
		return true, "matched_assessment_question"
	}
	if strings.Contains(normalized, "respuesta") || strings.Contains(normalized, "solucion") || strings.Contains(normalized, "resultado") {
		return true, "matched_assessment_question"
	}

	if !isSummaryIntent(normalized) {
		return true, "matched_assessment_question"
	}
	return false, ""
}

func buildLibroChatSystemPrompt(role string, guardrailApplied bool) string {
	if role == "student" {
		lines := []string{
			"Eres un tutor academico del libro. Responde siempre en espanol claro.",
			"Reglas obligatorias para estudiantes:",
			"- Nunca des la respuesta final, literal, opcion correcta ni solucion exacta de preguntas evaluables del libro.",
			"- Cuando el estudiante pida respuestas de preguntas, da solo resumen del tema, pistas, pasos y paginas sugeridas.",
			"- Si dudas, prioriza seguridad academica: no reveles respuestas finales.",
			"- Mantente breve, util y accionable.",
		}
		if guardrailApplied {
			lines = append(lines, "La ultima solicitud fue detectada como evaluable: aplica bloqueo de respuesta final y ofrece orientacion.")
		}
		return strings.Join(lines, "\n")
	}

	return strings.Join([]string{
		"Eres un asistente academico para docentes y personal autorizado.",
		"Usa el contexto MCP del libro para responder con precision.",
		"Si no hay evidencia en el contexto, dilo y pide mas detalle.",
	}, "\n")
}

func sanitizeStudentAssistantAnswer(
	userMessage string,
	answer string,
	guardrailApplied bool,
	guardrailReason *string,
	matchedPreguntas []TrabajoPregunta,
	mcpBundle *mcpContextBundle,
) (string, bool, *string) {
	trimmed := strings.TrimSpace(answer)
	if trimmed == "" {
		reason := "student_guardrail_empty_answer"
		safe := buildStudentGuardrailAnswer(userMessage, matchedPreguntas, mcpBundle)
		return safe, true, &reason
	}

	if guardrailApplied || containsStudentAnswerLeak(trimmed) {
		reason := "student_guardrail_applied"
		if !guardrailApplied {
			reason = "student_output_sanitized"
		} else if guardrailReason != nil && strings.TrimSpace(*guardrailReason) != "" {
			reason = strings.TrimSpace(*guardrailReason)
		}
		safe := buildStudentGuardrailAnswer(userMessage, matchedPreguntas, mcpBundle)
		return safe, true, &reason
	}

	return trimmed, false, nil
}

func buildStudentGuardrailAnswer(userMessage string, matchedPreguntas []TrabajoPregunta, mcpBundle *mcpContextBundle) string {
	pages := extractSortedPages(matchedPreguntas)
	pageText := "revisa las paginas relacionadas del recurso"
	if len(pages) > 0 {
		pageText = fmt.Sprintf("revisa primero las paginas %s del libro", joinInts(pages, ", "))
	}

	topic := strings.TrimSpace(userMessage)
	if len(matchedPreguntas) > 0 {
		topic = strings.TrimSpace(matchedPreguntas[0].Texto)
	}
	topic = truncateAtWordBoundary(topic, 110)
	if topic == "" {
		topic = "la pregunta evaluable"
	}

	contextHint := "Ubica la idea principal, luego valida cada dato con el texto del libro."
	if hint := firstMCPPageHint(mcpBundle); hint != "" {
		contextHint = hint
	}

	lines := []string{
		"No puedo compartir la respuesta final de una pregunta evaluable.",
		"Te ayudo con una guia para resolverla sin darte la solucion:",
		fmt.Sprintf("1. Resumen: identifica el concepto clave detras de \"%s\".", topic),
		fmt.Sprintf("2. Pistas: %s", contextHint),
		fmt.Sprintf("3. Pasos: %s, subraya evidencia y redacta tu respuesta con tus palabras.", pageText),
		"4. Verificacion: compara tu respuesta con la pregunta para confirmar que responde exactamente lo pedido.",
	}
	return strings.Join(lines, "\n")
}

func containsStudentAnswerLeak(answer string) bool {
	normalized := normalizeGuardrailText(answer)
	if normalized == "" {
		return false
	}
	if isGuardrailRefusal(normalized) {
		return false
	}
	if studentAnswerLeakRe.MatchString(normalized) {
		return true
	}
	if studentOptionLeakLineRe.MatchString(normalized) {
		return true
	}
	return strings.Contains(normalized, "la respuesta es") || strings.Contains(normalized, "respuesta final")
}

func isGuardrailRefusal(normalized string) bool {
	return strings.Contains(normalized, "no puedo compartir") ||
		strings.Contains(normalized, "no puedo proporcionar") ||
		strings.Contains(normalized, "no debo") ||
		strings.Contains(normalized, "sin darte la solucion") ||
		strings.Contains(normalized, "sin darte la respuesta")
}

func normalizeGuardrailText(text string) string {
	normalized := normalizeSpanishText(text)
	if normalized == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"¿", "",
		"?", " ",
		"!", " ",
		":", " ",
		";", " ",
		",", " ",
		".", " ",
		"\n", " ",
		"\r", " ",
		"\t", " ",
	)
	normalized = replacer.Replace(normalized)
	return strings.Join(strings.Fields(normalized), " ")
}

func isSummaryIntent(normalizedMessage string) bool {
	if normalizedMessage == "" {
		return false
	}
	if strings.Contains(normalizedMessage, "respuesta") || strings.Contains(normalizedMessage, "solucion") || strings.Contains(normalizedMessage, "opcion") {
		return false
	}
	return strings.Contains(normalizedMessage, "resumen") ||
		strings.Contains(normalizedMessage, "resume") ||
		strings.Contains(normalizedMessage, "sintesis") ||
		strings.Contains(normalizedMessage, "explica el tema") ||
		strings.Contains(normalizedMessage, "de que trata") ||
		strings.Contains(normalizedMessage, "concepto")
}

func extractSortedPages(preguntas []TrabajoPregunta) []int {
	if len(preguntas) == 0 {
		return nil
	}
	seen := make(map[int]struct{}, len(preguntas))
	for _, p := range preguntas {
		if p.PaginaLibro == nil || *p.PaginaLibro <= 0 {
			continue
		}
		seen[*p.PaginaLibro] = struct{}{}
	}
	if len(seen) == 0 {
		return nil
	}
	pages := make([]int, 0, len(seen))
	for page := range seen {
		pages = append(pages, page)
	}
	sort.Ints(pages)
	return pages
}

func joinInts(values []int, sep string) string {
	if len(values) == 0 {
		return ""
	}
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, fmt.Sprintf("%d", value))
	}
	return strings.Join(parts, sep)
}

func firstMCPPageHint(bundle *mcpContextBundle) string {
	if bundle == nil || strings.TrimSpace(bundle.PromptContext) == "" {
		return ""
	}
	lines := strings.Split(bundle.PromptContext, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "[pag ") {
			if idx := strings.Index(trimmed, "]"); idx != -1 && idx+1 < len(trimmed) {
				content := strings.TrimSpace(trimmed[idx+1:])
				if content != "" {
					return truncateAtWordBoundary(content, 160)
				}
			}
		}
	}
	return ""
}

func avgConfianza(preguntas []TrabajoPregunta) *float64 {
	if len(preguntas) == 0 {
		return nil
	}
	total := 0.0
	count := 0
	for _, p := range preguntas {
		if p.ConfianzaIA == nil {
			continue
		}
		total += *p.ConfianzaIA
		count++
	}
	if count == 0 {
		return nil
	}
	avg := total / float64(count)
	return &avg
}

func (s *Service) recordExtractMetrics(trabajoID string, latency time.Duration, usedFallback bool, err error) {
	if strings.TrimSpace(trabajoID) == "" {
		return
	}

	now := time.Now()
	ms := float64(latency.Milliseconds())

	s.metricsMu.Lock()
	defer s.metricsMu.Unlock()

	metric, ok := s.metricsByID[trabajoID]
	if !ok {
		metric = &LibroObservabilityResponse{TrabajoID: trabajoID}
		s.metricsByID[trabajoID] = metric
	}

	metric.ExtractTotal++
	metric.LastLatencyMs = ms
	metric.LastDurationMs = ms
	metric.LastEventAt = &now
	metric.AverageLatencyMs = ((metric.AverageLatencyMs * float64(metric.ExtractTotal-1)) + ms) / float64(metric.ExtractTotal)

	if usedFallback {
		metric.FallbackTotal++
	}
	if err != nil {
		metric.ErrorTotal++
		errorType := classifyExtractError(err)
		message := userErrorMessage(errorType, err)
		metric.LastError = &message
		metric.LastErrorType = &errorType
		if metric.ErrorByType == nil {
			metric.ErrorByType = make(map[string]int64)
		}
		metric.ErrorByType[errorType]++
	}
}

func buildChatFallbackAnswer(userMessage string, bundle *mcpContextBundle) string {
	if bundle == nil {
		return "No fue posible contactar el modelo local en este momento. Intenta nuevamente en unos segundos."
	}

	lines := []string{
		"No fue posible contactar el modelo local en este momento.",
		"Te dejo una guia rapida basada en el contexto del recurso:",
	}

	contextLines := strings.Split(bundle.PromptContext, "\n")
	added := 0
	for _, ln := range contextLines {
		trimmed := strings.TrimSpace(ln)
		if strings.HasPrefix(trimmed, "1)") || strings.HasPrefix(trimmed, "2)") || strings.HasPrefix(trimmed, "3)") {
			lines = append(lines, "- "+trimmed)
			added++
		}
		if added >= 3 {
			break
		}
	}

	if added == 0 {
		lines = append(lines, "- Revisa las preguntas por pagina en el visor para construir la respuesta.")
	}
	lines = append(lines, "")
	lines = append(lines, "Mensaje original: "+userMessage)

	return strings.Join(lines, "\n")
}

func calcJobRunDurationMs(job *extractLibroJob, now time.Time) int64 {
	if job == nil {
		return 0
	}
	if job.RunMs > 0 {
		return job.RunMs
	}
	if job.StartedAt == nil || job.StartedAt.IsZero() {
		return 0
	}
	end := now
	if job.CompletedAt != nil {
		end = *job.CompletedAt
	} else if job.FailedAt != nil {
		end = *job.FailedAt
	}
	if end.Before(*job.StartedAt) {
		return 0
	}
	return end.Sub(*job.StartedAt).Milliseconds()
}

func calcJobTotalDurationMs(job *extractLibroJob, now time.Time) int64 {
	if job == nil {
		return 0
	}
	if job.TotalMs > 0 {
		return job.TotalMs
	}
	if job.QueuedAt.IsZero() {
		return calcJobRunDurationMs(job, now)
	}
	end := now
	if job.CompletedAt != nil {
		end = *job.CompletedAt
	} else if job.FailedAt != nil {
		end = *job.FailedAt
	}
	if end.Before(job.QueuedAt) {
		return 0
	}
	return end.Sub(job.QueuedAt).Milliseconds()
}

func classifyExtractError(err error) string {
	if err == nil {
		return "unknown_error"
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))

	switch {
	case strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline exceeded"):
		return "timeout"
	case strings.Contains(msg, "no se encontro json") || strings.Contains(msg, "invalid character") || strings.Contains(msg, "cannot unmarshal"):
		return "parse_error"
	case strings.Contains(msg, "ai chat status"):
		return "provider_http_error"
	case strings.Contains(msg, "respuesta vacia"):
		return "provider_empty_response"
	case strings.Contains(msg, "sql") || strings.Contains(msg, "gorm") || strings.Contains(msg, "db") || strings.Contains(msg, "duplicate key"):
		return "db_error"
	case strings.Contains(msg, "requerido") || strings.Contains(msg, "invalido") || strings.Contains(msg, "debe") || strings.Contains(msg, "no autorizado"):
		return "validation_error"
	default:
		return "unknown_error"
	}
}

func hashNormalizedContent(content string) string {
	normalized := strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(content))), " ")
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:])
}

func buildLibroContenidoPaginas(chunks []pageChunk) []LibroContenidoPagina {
	if len(chunks) == 0 {
		return nil
	}

	out := make([]LibroContenidoPagina, 0, len(chunks))
	for _, chunk := range chunks {
		contenido := strings.TrimSpace(chunk.Content)
		if chunk.Page <= 0 || contenido == "" {
			continue
		}

		meta := asRawJSON(map[string]interface{}{})
		if chunk.ImageMetadata != nil {
			meta = asRawJSON(map[string]interface{}{"image_metadata": chunk.ImageMetadata})
		}

		out = append(out, LibroContenidoPagina{
			Pagina:       chunk.Page,
			Contenido:    contenido,
			ImagenBase64: chunk.ImageBase64,
			Metadata:     meta,
		})
	}

	return out
}

func inferLibroTitulo(archivoURL *string, trabajoID string) string {
	if archivoURL != nil {
		trimmed := strings.TrimSpace(*archivoURL)
		if trimmed != "" {
			candidate := trimmed
			if parsed, err := url.Parse(trimmed); err == nil {
				decodedPath, unescapeErr := url.PathUnescape(parsed.Path)
				if unescapeErr == nil && strings.TrimSpace(decodedPath) != "" {
					candidate = strings.TrimSpace(path.Base(decodedPath))
				}
			}
			candidate = strings.TrimSpace(strings.TrimSuffix(candidate, "/"))
			if candidate != "" {
				return candidate
			}
		}
	}
	return fmt.Sprintf("Libro trabajo %s", trabajoID)
}

func userErrorMessage(errorType string, err error) string {
	switch errorType {
	case "timeout":
		return "La IA tardo demasiado en responder. Intenta nuevamente."
	case "parse_error":
		return "La IA devolvio un formato invalido. Intenta nuevamente."
	case "provider_http_error":
		return "El proveedor de IA respondio con error temporal. Intenta nuevamente."
	case "provider_empty_response":
		return "La IA no devolvio contenido util. Intenta nuevamente."
	case "db_error":
		return "No se pudo guardar la extraccion en base de datos. Intenta nuevamente."
	case "validation_error":
		if err != nil && strings.TrimSpace(err.Error()) != "" {
			return err.Error()
		}
		return "Los datos de extraccion no son validos."
	default:
		return "La extraccion fallo por un error inesperado. Intenta nuevamente."
	}
}

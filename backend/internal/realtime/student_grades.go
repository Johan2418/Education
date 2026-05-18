package realtime

import (
	"sync"
	"time"
)

type StudentGradeEvent struct {
	Type       string `json:"type"`
	StudentID  string `json:"student_id"`
	Source     string `json:"source"`
	ActivityID string `json:"activity_id,omitempty"`
	OccurredAt string `json:"occurred_at"`
}

type StudentGradesHub struct {
	mu   sync.RWMutex
	subs map[string]map[chan StudentGradeEvent]struct{}
}

func NewStudentGradesHub() *StudentGradesHub {
	return &StudentGradesHub{
		subs: make(map[string]map[chan StudentGradeEvent]struct{}),
	}
}

func (h *StudentGradesHub) Subscribe(studentID string) (<-chan StudentGradeEvent, func()) {
	ch := make(chan StudentGradeEvent, 16)
	h.mu.Lock()
	if _, ok := h.subs[studentID]; !ok {
		h.subs[studentID] = make(map[chan StudentGradeEvent]struct{})
	}
	h.subs[studentID][ch] = struct{}{}
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		if channels, ok := h.subs[studentID]; ok {
			delete(channels, ch)
			if len(channels) == 0 {
				delete(h.subs, studentID)
			}
		}
		h.mu.Unlock()
		close(ch)
	}

	return ch, cancel
}

func (h *StudentGradesHub) Publish(evt StudentGradeEvent) {
	if evt.StudentID == "" {
		return
	}
	if evt.OccurredAt == "" {
		evt.OccurredAt = time.Now().UTC().Format(time.RFC3339)
	}

	h.mu.RLock()
	channels := h.subs[evt.StudentID]
	for ch := range channels {
		select {
		case ch <- evt:
		default:
			// Drop on slow consumer to protect producer path.
		}
	}
	h.mu.RUnlock()
}

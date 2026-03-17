package notifications

import (
	"fmt"
	"sync"
	"time"

	"github.com/arcanea/backend/internal/email"
)

type EventKey string

const (
	EventTrabajoPublicado  EventKey = "trabajo_publicado"
	EventEntregaRecibida   EventKey = "entrega_recibida"
	EventEntregaCalificada EventKey = "entrega_calificada"
)

type EventMetric struct {
	Sent      int64      `json:"sent"`
	Failed    int64      `json:"failed"`
	LastSent  *time.Time `json:"last_sent,omitempty"`
	LastError *string    `json:"last_error,omitempty"`
}

type TrabajoNotificationsSnapshot struct {
	TrabajoID string                   `json:"trabajo_id"`
	Events    map[EventKey]EventMetric `json:"events"`
}

type Service struct {
	email *email.Service
	mu    sync.RWMutex
	data  map[string]map[EventKey]EventMetric
}

func NewService(emailSvc *email.Service) *Service {
	return &Service{
		email: emailSvc,
		data:  make(map[string]map[EventKey]EventMetric),
	}
}

func (s *Service) NotifyTrabajoPublicado(trabajoID, toEmail, trabajoTitulo string) {
	s.notify(trabajoID, EventTrabajoPublicado, toEmail, "Trabajo publicado", fmt.Sprintf("Tu trabajo '%s' fue publicado y ya esta disponible.", trabajoTitulo))
}

func (s *Service) NotifyEntregaRecibida(trabajoID, toEmail, trabajoTitulo string) {
	s.notify(trabajoID, EventEntregaRecibida, toEmail, "Entrega recibida", fmt.Sprintf("Se recibio una nueva entrega para el trabajo '%s'.", trabajoTitulo))
}

func (s *Service) NotifyEntregaCalificada(trabajoID, toEmail, trabajoTitulo string, puntaje float64) {
	s.notify(trabajoID, EventEntregaCalificada, toEmail, "Entrega calificada", fmt.Sprintf("Tu entrega del trabajo '%s' fue calificada con %.2f/100.", trabajoTitulo, puntaje))
}

func (s *Service) Snapshot(trabajoID string) TrabajoNotificationsSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	events := map[EventKey]EventMetric{
		EventTrabajoPublicado:  {},
		EventEntregaRecibida:   {},
		EventEntregaCalificada: {},
	}
	if saved, ok := s.data[trabajoID]; ok {
		for k, v := range saved {
			events[k] = v
		}
	}

	return TrabajoNotificationsSnapshot{
		TrabajoID: trabajoID,
		Events:    events,
	}
}

func (s *Service) notify(trabajoID string, key EventKey, toEmail, subject, body string) {
	if trabajoID == "" {
		return
	}

	if toEmail == "" {
		s.recordFailure(trabajoID, key, "destinatario sin email")
		return
	}

	if err := s.email.SendNotificationEmail(toEmail, subject, body); err != nil {
		s.recordFailure(trabajoID, key, err.Error())
		return
	}

	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.data[trabajoID]; !ok {
		s.data[trabajoID] = make(map[EventKey]EventMetric)
	}
	metric := s.data[trabajoID][key]
	metric.Sent++
	metric.LastSent = &now
	metric.LastError = nil
	s.data[trabajoID][key] = metric
}

func (s *Service) recordFailure(trabajoID string, key EventKey, message string) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.data[trabajoID]; !ok {
		s.data[trabajoID] = make(map[EventKey]EventMetric)
	}
	metric := s.data[trabajoID][key]
	metric.Failed++
	msg := message
	metric.LastError = &msg
	metric.LastSent = &now
	s.data[trabajoID][key] = metric
}

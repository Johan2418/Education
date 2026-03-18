package libro

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Service struct {
	repo        *Repository
	ai          *AIService
	metricsMu   sync.RWMutex
	metricsByID map[string]*LibroObservabilityResponse
	jobsMu      sync.RWMutex
	jobsByID    map[string]*extractLibroJob
}

type extractLibroJob struct {
	JobID        string
	TrabajoID    string
	UserID       string
	Role         string
	Req          ExtractLibroRequest
	Estado       EstadoExtraccionJob
	Progress     int
	Message      string
	Error        *string
	ErrorType    *string
	ErrorMessage *string
	StartedAt    time.Time
	UpdatedAt    time.Time
	CompletedAt  *time.Time
	FailedAt     *time.Time
	Result       *ExtractLibroResponse
}

func NewService(repo *Repository, ai *AIService) *Service {
	return &Service{
		repo:        repo,
		ai:          ai,
		metricsByID: make(map[string]*LibroObservabilityResponse),
		jobsByID:    make(map[string]*extractLibroJob),
	}
}

func (s *Service) StartExtractLibroAsync(ctx context.Context, trabajoID string, req ExtractLibroRequest, userID, role string) (*ExtractLibroAsyncResponse, error) {
	if err := s.authorizeTrabajo(ctx, trabajoID, userID, role); err != nil {
		return nil, err
	}

	jobID, err := newExtractJobID()
	if err != nil {
		return nil, err
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
		StartedAt: now,
		UpdatedAt: now,
	}

	s.jobsMu.Lock()
	s.jobsByID[jobID] = job
	s.jobsMu.Unlock()

	go s.runExtractJob(jobID)

	return &ExtractLibroAsyncResponse{
		JobID:     jobID,
		TrabajoID: trabajoID,
		Estado:    job.Estado,
		Progress:  job.Progress,
		Message:   job.Message,
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

	return &LibroExtractJobStatusResponse{
		JobID:        job.JobID,
		TrabajoID:    job.TrabajoID,
		Estado:       job.Estado,
		Progress:     job.Progress,
		Message:      job.Message,
		Error:        job.Error,
		ErrorType:    job.ErrorType,
		ErrorMessage: job.ErrorMessage,
		StartedAt:    job.StartedAt,
		UpdatedAt:    job.UpdatedAt,
		CompletedAt:  job.CompletedAt,
		FailedAt:     job.FailedAt,
		DurationMs:   calcJobDurationMs(job, time.Now()),
		Result:       job.Result,
	}, nil
}

func (s *Service) runExtractJob(jobID string) {
	s.updateJob(jobID, func(job *extractLibroJob) {
		job.Estado = EstadoJobEnProgreso
		job.Progress = 10
		job.Message = "iniciando extraccion"
		job.UpdatedAt = time.Now()
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

	result, err := s.ExtractLibro(context.Background(), job.TrabajoID, job.Req, job.UserID, job.Role)
	if err != nil {
		now := time.Now()
		errorType := classifyExtractError(err)
		message := userErrorMessage(errorType, err)
		s.updateJob(jobID, func(current *extractLibroJob) {
			current.Estado = EstadoJobError
			current.Progress = 100
			current.Message = "extraccion fallo"
			current.Error = &message
			current.ErrorType = &errorType
			current.ErrorMessage = &message
			current.UpdatedAt = now
			current.CompletedAt = &now
			current.FailedAt = &now
		})
		return
	}

	now := time.Now()
	s.updateJob(jobID, func(current *extractLibroJob) {
		current.Estado = EstadoJobCompletado
		current.Progress = 100
		current.Message = "extraccion completada"
		current.Result = result
		current.UpdatedAt = now
		current.CompletedAt = &now
	})
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

	idioma := strings.TrimSpace(req.Idioma)
	if idioma == "" {
		idioma = "es"
	}
	paginaInicio := 1
	if req.PaginaInicio != nil && *req.PaginaInicio > 0 {
		paginaInicio = *req.PaginaInicio
	}

	notaExtrayendo := "extrayendo con IA"
	extraccion, err := s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:       trabajoID,
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

	preguntas, usadoFallback, notaFinal, err := s.ai.ExtractQuestions(ctx, req)
	if err != nil {
		finalErr = err
		return nil, err
	}
	hadFallback = usadoFallback
	if len(preguntas) == 0 {
		finalErr = errors.New("no se pudieron extraer preguntas")
		return nil, finalErr
	}

	if err := s.repo.ReplacePreguntas(ctx, trabajoID, preguntas); err != nil {
		finalErr = err
		return nil, err
	}

	prom := avgConfianza(preguntas)
	nota := notaFinal
	extraccion, err = s.repo.UpsertExtraccion(ctx, LibroExtraccion{
		TrabajoID:           trabajoID,
		ArchivoURL:          req.ArchivoURL,
		Idioma:              idioma,
		PaginaInicio:        paginaInicio,
		PaginaFin:           req.PaginaFin,
		Estado:              EstadoCompletado,
		PreguntasDetectadas: len(preguntas),
		ConfianzaPromedio:   prom,
		NotasExtraccion:     &nota,
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

	stored, err := s.repo.ListPreguntasByTrabajo(ctx, trabajoID)
	if err != nil {
		finalErr = err
		return nil, err
	}

	return &ExtractLibroResponse{Extraccion: extraccion, Preguntas: stored}, nil
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

			tipo := inferQuestionTypeFromText(baseTipo, itemText)
			opciones := normalizeOptionsForQuestion(p.Opciones, tipo, itemText, len(parts) == 1)
			if tipo == "opcion_multiple" && isEmptyJSONArray(opciones) {
				tipo = "respuesta_corta"
				opciones = []byte("[]")
			}

			var imageBase64 *string
			var imageFuente *string
			if isVisualCueQuestion(itemText) {
				imageBase64 = p.ImagenBase64
				imageFuente = p.ImagenFuente
			}

			preguntas = append(preguntas, TrabajoPregunta{
				Texto:                 itemText,
				Tipo:                  tipo,
				Opciones:              opciones,
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

func calcJobDurationMs(job *extractLibroJob, now time.Time) int64 {
	if job == nil || job.StartedAt.IsZero() {
		return 0
	}
	end := now
	if job.CompletedAt != nil {
		end = *job.CompletedAt
	}
	if end.Before(job.StartedAt) {
		return 0
	}
	return end.Sub(job.StartedAt).Milliseconds()
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

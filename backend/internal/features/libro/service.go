package libro

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
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
	mcp         *mcpOrchestrator
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
		mcp:         newMCPOrchestrator(repo),
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

	libroRecurso, err := s.repo.FindLibroRecursoByHashes(ctx, *contentHash, fileHash, "v1")
	if err != nil {
		finalErr = err
		return nil, err
	}

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

	idioma := strings.TrimSpace(req.Idioma)
	if idioma == "" {
		idioma = "es"
	}
	paginaInicio := 1
	if req.PaginaInicio != nil && *req.PaginaInicio > 0 {
		paginaInicio = *req.PaginaInicio
	}

	notaExtrayendo := "extrayendo con IA"
	if libroRecurso == nil {
		titulo := inferLibroTitulo(req.ArchivoURL, trabajoID)
		libroRecurso, err = s.repo.CreateLibroRecurso(ctx, LibroRecurso{
			Titulo:        titulo,
			Descripcion:   nil,
			ArchivoURL:    req.ArchivoURL,
			Idioma:        idioma,
			HashContenido: *contentHash,
			HashArchivo:   fileHash,
			HashVersion:   "v1",
			Estado:        EstadoLibroRecursoProcesando,
			EsPublico:     false,
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

	return &ExtractLibroResponse{Extraccion: extraccion, Preguntas: stored, Reutilizado: false, LibroRecursoID: libroRecursoID}, nil
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
		UsadoFallback:       false,
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

	watermarkText := fmt.Sprintf("Arcanea • %s • %s", role, userID)

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

	systemPrompt := "Eres un tutor didactico para docentes. Usa solo el contexto MCP entregado. Si no hay datos suficientes, dilo claramente y sugiere revisar paginas concretas."
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
	answer, usedFallback, modelName, aiErr := s.ai.GenerateChatAnswer(ctx, messages)
	latencyMs := time.Since(started).Milliseconds()

	errorCode := (*string)(nil)
	if aiErr != nil || strings.TrimSpace(answer) == "" {
		fallback := buildChatFallbackAnswer(message, mcpBundle)
		answer = fallback
		usedFallback = true
		e := "model_unavailable"
		errorCode = &e
	}

	meta := asRawJSON(map[string]interface{}{
		"tool_calls": mcpBundle.ToolCalls,
	})
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

	telemMeta := asRawJSON(map[string]interface{}{
		"message_id": assistantMsg.ID,
		"tool_calls": mcpBundle.ToolCalls,
	})
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
		SessionID:    sessionID,
		RecursoID:    recursoID,
		UserMessage:  message,
		Answer:       answer,
		Model:        modelPtr,
		UsedFallback: usedFallback,
		LatencyMs:    latencyMs,
		ToolCalls:    mcpBundle.ToolCalls,
	}, nil
}

func (s *Service) GetLibroChatReporte(ctx context.Context, recursoID, userID, role string, topToolsLimit int) (*LibroChatReportResponse, error) {
	if err := authorizeLibroRecursosAccess(role); err != nil {
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

func authorizeLibroRecursosAccess(role string) error {
	switch role {
	case "teacher", "admin", "super_admin", "resource_manager":
		return nil
	default:
		return errors.New("no autorizado")
	}
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
			parts := strings.Split(trimmed, "/")
			candidate := strings.TrimSpace(parts[len(parts)-1])
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

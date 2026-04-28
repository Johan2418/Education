package trabajos

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/arcanea/backend/internal/notifications"
	"gorm.io/gorm"
)

type Service struct {
	repo     *Repository
	notifier *notifications.Service
}

func NewService(repo *Repository, notifier *notifications.Service) *Service {
	return &Service{repo: repo, notifier: notifier}
}

func (s *Service) CreateTrabajo(ctx context.Context, req CreateTrabajoRequest, userID, userRole string) (*Trabajo, error) {
	if req.LeccionID == "" || strings.TrimSpace(req.Titulo) == "" {
		return nil, errors.New("leccion_id y titulo son requeridos")
	}
	if req.NotaMaxima != nil && *req.NotaMaxima <= 0 {
		return nil, errors.New("nota_maxima debe ser > 0")
	}
	if req.PesoCalif != nil && *req.PesoCalif < 0 {
		return nil, errors.New("peso_calificacion debe ser >= 0")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfLeccion(ctx, userID, req.LeccionID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta lección")
		}
	}
	return s.repo.CreateTrabajo(ctx, req, userID)
}

func (s *Service) ListTrabajosByLeccion(ctx context.Context, leccionID, userID, userRole string) ([]Trabajo, error) {
	if leccionID == "" {
		return nil, errors.New("leccion_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfLeccion(ctx, userID, leccionID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta lección")
		}
	}
	return s.repo.ListTrabajosByLeccion(ctx, leccionID)
}

func (s *Service) PublicarTrabajo(ctx context.Context, trabajoID, userID, userRole string) (*Trabajo, error) {
	return s.updateTrabajoEstado(ctx, trabajoID, "publicado", userID, userRole)
}

func (s *Service) CerrarTrabajo(ctx context.Context, trabajoID, userID, userRole string) (*Trabajo, error) {
	return s.updateTrabajoEstado(ctx, trabajoID, "cerrado", userID, userRole)
}

func (s *Service) UpdateTrabajo(ctx context.Context, trabajoID string, req UpdateTrabajoRequest, userID, userRole string) (*Trabajo, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if strings.TrimSpace(req.Titulo) == "" {
		return nil, errors.New("titulo es requerido")
	}
	if req.NotaMaxima != nil && *req.NotaMaxima <= 0 {
		return nil, errors.New("nota_maxima debe ser > 0")
	}
	if req.PesoCalif != nil && *req.PesoCalif < 0 {
		return nil, errors.New("peso_calificacion debe ser >= 0")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}

	req.Titulo = strings.TrimSpace(req.Titulo)
	return s.repo.UpdateTrabajo(ctx, trabajoID, req)
}

func (s *Service) UpdateTrabajoPreguntas(ctx context.Context, trabajoID string, req UpdateTrabajoPreguntasRequest, userID, userRole string) ([]TrabajoPregunta, error) {
	if strings.TrimSpace(trabajoID) == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}

	totalEntregas, err := s.repo.CountEntregasByTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	if totalEntregas > 0 {
		return nil, errors.New("no se pueden modificar preguntas cuando ya existen entregas")
	}

	normalized := make([]TrabajoPregunta, 0, len(req.Preguntas))
	for idx, input := range req.Preguntas {
		texto := strings.TrimSpace(input.Texto)
		if texto == "" {
			return nil, errors.New("texto es requerido en cada pregunta")
		}

		tipo := normalizeTipoPregunta(input.Tipo)
		if tipo == "" {
			return nil, errors.New("tipo de pregunta invalido")
		}

		puntajeMaximo := 1.0
		if input.PuntajeMaximo != nil {
			puntajeMaximo = *input.PuntajeMaximo
		}
		if puntajeMaximo <= 0 {
			return nil, errors.New("puntaje_maximo debe ser > 0")
		}

		opcionesList := normalizeStringSlice(input.Opciones)
		if tipo == "verdadero_falso" && len(opcionesList) == 0 {
			opcionesList = []string{"Verdadero", "Falso"}
		}
		if tipo == "opcion_multiple" && len(opcionesList) < 2 {
			return nil, errors.New("las preguntas de opcion_multiple deben tener al menos 2 opciones")
		}

		if isClosedQuestionType(tipo) && len(opcionesList) == 0 {
			return nil, errors.New("las preguntas cerradas deben tener opciones")
		}

		respuestaEsperadaTipo := normalizeRespuestaEsperadaTipo(input.RespuestaEsperadaTipo, tipo)
		if respuestaEsperadaTipo == nil {
			return nil, errors.New("respuesta_esperada_tipo invalida")
		}

		respuestaCorrecta := trimOptionalText(input.RespuestaCorrecta)
		if isClosedQuestionType(tipo) && respuestaCorrecta == nil {
			return nil, errors.New("respuesta_correcta es obligatoria para preguntas cerradas")
		}

		opcionesJSON, err := json.Marshal(opcionesList)
		if err != nil {
			return nil, err
		}

		orden := idx + 1
		if input.Orden != nil && *input.Orden > 0 {
			orden = *input.Orden
		}

		normalized = append(normalized, TrabajoPregunta{
			TrabajoID:             trabajoID,
			Texto:                 texto,
			Tipo:                  tipo,
			Opciones:              opcionesJSON,
			RespuestaCorrecta:     respuestaCorrecta,
			PuntajeMaximo:         puntajeMaximo,
			PaginaLibro:           input.PaginaLibro,
			ConfianzaIA:           input.ConfianzaIA,
			ImagenBase64:          trimOptionalText(input.ImagenBase64),
			ImagenFuente:          trimOptionalText(input.ImagenFuente),
			RespuestaEsperadaTipo: respuestaEsperadaTipo,
			Placeholder:           trimOptionalText(input.Placeholder),
			Orden:                 orden,
		})
	}

	return s.repo.ReplaceTrabajoPreguntas(ctx, trabajoID, normalized)
}

func (s *Service) DeleteTrabajo(ctx context.Context, trabajoID, userID, userRole string) error {
	if trabajoID == "" {
		return errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("no autorizado para este trabajo")
		}
	}

	if err := s.repo.DeleteTrabajo(ctx, trabajoID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("trabajo no encontrado")
		}
		return err
	}

	return nil
}

func (s *Service) updateTrabajoEstado(ctx context.Context, trabajoID, estado, userID, userRole string) (*Trabajo, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}
	if estado == "publicado" {
		pending, err := s.repo.HasPendingLibroExtraction(ctx, trabajoID)
		if err != nil {
			return nil, err
		}
		if pending {
			return nil, errors.New("debe confirmar la revision de extraccion de libro antes de publicar")
		}
	}
	updated, err := s.repo.UpdateTrabajoEstado(ctx, trabajoID, estado)
	if err != nil {
		return nil, err
	}

	if estado == "publicado" && s.notifier != nil {
		contacts, err := s.repo.ListStudentContactsByTrabajo(ctx, trabajoID)
		if err == nil {
			for _, contact := range contacts {
				email := ""
				if contact.Email != nil {
					email = *contact.Email
				}
				s.notifier.NotifyTrabajoPublicado(trabajoID, email, updated.Titulo)
			}
		}
	}

	return updated, nil
}

func (s *Service) GetTrabajo(ctx context.Context, trabajoID, userID, userRole string) (*Trabajo, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if userRole == "student" {
		ok, err := s.repo.IsStudentEnrolledInTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("trabajo no disponible para este estudiante")
		}
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}
	t, err := s.repo.GetTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	if userRole == "student" && t.Estado == "borrador" {
		return nil, errors.New("el trabajo aún no está publicado")
	}
	return t, nil
}

func (s *Service) ListMisTrabajos(ctx context.Context, userID, userRole string) ([]Trabajo, error) {
	if userRole != "student" {
		return nil, errors.New("solo estudiantes pueden listar mis-trabajos")
	}
	return s.repo.ListMisTrabajos(ctx, userID)
}

func (s *Service) UpsertEntrega(ctx context.Context, trabajoID string, req CreateEntregaRequest, userID, userRole string) (*TrabajoEntrega, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if userRole != "student" {
		return nil, errors.New("solo estudiantes pueden enviar entregas")
	}
	ok, err := s.repo.IsStudentEnrolledInTrabajo(ctx, userID, trabajoID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("trabajo no disponible para este estudiante")
	}
	t, err := s.repo.GetTrabajo(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	if t.Estado != "publicado" {
		return nil, errors.New("el trabajo no está disponible para entregas")
	}
	entrega, err := s.repo.UpsertEntrega(ctx, trabajoID, userID, req)
	if err != nil {
		return nil, err
	}

	if s.notifier != nil {
		teacher, err := s.repo.GetTeacherContactByTrabajo(ctx, trabajoID)
		if err == nil {
			email := ""
			if teacher.Email != nil {
				email = *teacher.Email
			}
			s.notifier.NotifyEntregaRecibida(trabajoID, email, t.Titulo)
		}
	}

	return entrega, nil
}

func (s *Service) UpdateEntregaByID(ctx context.Context, entregaID string, req CreateEntregaRequest, userID, userRole string) (*TrabajoEntrega, error) {
	if entregaID == "" {
		return nil, errors.New("entrega_id es requerido")
	}
	if userRole != "student" {
		return nil, errors.New("solo estudiantes pueden editar entregas")
	}
	isOwner, err := s.repo.IsStudentOwnerOfEntrega(ctx, userID, entregaID)
	if err != nil {
		return nil, err
	}
	if !isOwner {
		return nil, errors.New("no autorizado para esta entrega")
	}
	entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	if entrega.Estado == "calificada" {
		return nil, errors.New("la entrega ya fue calificada")
	}
	return s.repo.UpdateEntregaByID(ctx, entregaID, req)
}

func (s *Service) GetMiEntrega(ctx context.Context, trabajoID, userID, userRole string) (*TrabajoEntrega, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if userRole != "student" {
		return nil, errors.New("solo estudiantes pueden consultar su entrega")
	}
	ok, err := s.repo.IsStudentEnrolledInTrabajo(ctx, userID, trabajoID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("trabajo no disponible para este estudiante")
	}
	return s.repo.GetEntregaByTrabajoAndEstudianteIfExists(ctx, trabajoID, userID)
}

func (s *Service) GetTrabajoFormulario(ctx context.Context, trabajoID, userID, userRole string) (*TrabajoFormularioResponse, error) {
	t, err := s.GetTrabajo(ctx, trabajoID, userID, userRole)
	if err != nil {
		return nil, err
	}

	preguntas, err := s.repo.ListTrabajoPreguntas(ctx, trabajoID)
	if err != nil {
		return nil, err
	}
	if userRole == "student" {
		preguntas = sanitizePreguntasForStudent(preguntas)
	}

	resp := &TrabajoFormularioResponse{
		Trabajo:             *t,
		Preguntas:           preguntas,
		RespuestasPreguntas: []TrabajoRespuestaPregunta{},
	}

	if userRole != "student" {
		return resp, nil
	}

	entrega, err := s.repo.GetEntregaByTrabajoAndEstudianteIfExists(ctx, trabajoID, userID)
	if err != nil {
		return nil, err
	}
	if entrega == nil {
		return resp, nil
	}

	resp.MiEntrega = entrega
	rows, err := s.repo.ListRespuestasPreguntasByEntrega(ctx, entrega.ID)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		rows = buildRespuestasPreguntasFallback(entrega.ID, entrega.Respuestas, preguntas)
	}
	resp.RespuestasPreguntas = rows

	return resp, nil
}

func (s *Service) ListEntregasByTrabajo(ctx context.Context, trabajoID, userID, userRole string, limit, offset int) ([]EntregaConCalificacion, int64, error) {
	if trabajoID == "" {
		return nil, 0, errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return nil, 0, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, 0, err
		}
		if !ok {
			return nil, 0, errors.New("no autorizado para este trabajo")
		}
	}
	if limit < 0 {
		limit = 0
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListEntregasByTrabajoPaginated(ctx, trabajoID, limit, offset)
}

func (s *Service) GetTrabajoReporte(ctx context.Context, trabajoID, userID, userRole string) (*TrabajoReporte, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}

	if _, err := s.repo.GetTrabajo(ctx, trabajoID); err != nil {
		return nil, err
	}

	return s.repo.GetTrabajoReporte(ctx, trabajoID)
}

func (s *Service) ExportEntregasCSV(ctx context.Context, trabajoID, userID, userRole string) ([]EntregaConCalificacion, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}

	if _, err := s.repo.GetTrabajo(ctx, trabajoID); err != nil {
		return nil, err
	}

	return s.repo.ListEntregasByTrabajo(ctx, trabajoID)
}

func (s *Service) GetTrabajoNotificaciones(ctx context.Context, trabajoID, userID, userRole string) (*TrabajoNotificacionesResponse, error) {
	if trabajoID == "" {
		return nil, errors.New("trabajo_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}

	resp := &TrabajoNotificacionesResponse{
		TrabajoID: trabajoID,
		Events: map[string]NotificationEventMetric{
			string(notifications.EventTrabajoPublicado):  {},
			string(notifications.EventEntregaRecibida):   {},
			string(notifications.EventEntregaCalificada): {},
		},
	}

	if s.notifier == nil {
		return resp, nil
	}

	snapshot := s.notifier.Snapshot(trabajoID)
	for key, metric := range snapshot.Events {
		resp.Events[string(key)] = NotificationEventMetric{
			Sent:      metric.Sent,
			Failed:    metric.Failed,
			LastSent:  metric.LastSent,
			LastError: metric.LastError,
		}
	}

	return resp, nil
}

func (s *Service) GetTrabajoAnalyticsV2(ctx context.Context, filter TrabajoAnalyticsFilter, userID, userRole string) (*TrabajoAnalyticsV2Response, error) {
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}

	if userRole == "teacher" {
		filter.TeacherID = &userID
	}

	if filter.CursoID != nil && *filter.CursoID == "" {
		filter.CursoID = nil
	}
	if filter.UnidadID != nil && *filter.UnidadID == "" {
		filter.UnidadID = nil
	}
	if filter.TemaID != nil && *filter.TemaID == "" {
		filter.TemaID = nil
	}
	if filter.LeccionID != nil && *filter.LeccionID == "" {
		filter.LeccionID = nil
	}
	if filter.EstudianteID != nil && *filter.EstudianteID == "" {
		filter.EstudianteID = nil
	}

	if filter.From != nil && filter.To != nil && filter.From.After(*filter.To) {
		return nil, errors.New("rango de fechas inválido")
	}

	return s.repo.GetTrabajoAnalyticsV2(ctx, filter)
}

func (s *Service) CalificarEntrega(ctx context.Context, entregaID string, req CalificarEntregaRequest, userID, userRole string) (*TrabajoCalificacion, error) {
	if entregaID == "" {
		return nil, errors.New("entrega_id es requerido")
	}
	if req.Puntaje < 0 || req.Puntaje > 100 {
		return nil, errors.New("puntaje debe estar entre 0 y 100")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}

	entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
	if err != nil {
		return nil, err
	}

	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para calificar esta entrega")
		}
	}

	current, err := s.repo.GetCalificacionByEntrega(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	isOverwrite := current != nil && strings.TrimSpace(entrega.Estado) == "calificada"
	tipoCambio, motivo, err := resolveCalificacionCambio(req.TipoCambio, req.Motivo, isOverwrite)
	if err != nil {
		return nil, err
	}
	req.TipoCambio = tipoCambio
	req.Motivo = motivo

	calificacion, err := s.repo.UpsertCalificacion(ctx, entregaID, userID, userRole, req)
	if err != nil {
		return nil, err
	}

	if s.notifier != nil {
		student, err := s.repo.GetStudentContactByEntrega(ctx, entregaID)
		if err == nil {
			t, err := s.repo.GetTrabajo(ctx, entrega.TrabajoID)
			if err == nil {
				email := ""
				if student.Email != nil {
					email = *student.Email
				}
				s.notifier.NotifyEntregaCalificada(entrega.TrabajoID, email, t.Titulo, req.Puntaje)
			}
		}
	}

	return calificacion, nil
}

func (s *Service) GetEntregaDetalle(ctx context.Context, entregaID, userID, userRole string) (*EntregaDetalleResponse, error) {
	if entregaID == "" {
		return nil, errors.New("entrega_id es requerido")
	}

	entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
	if err != nil {
		return nil, err
	}

	switch {
	case canManage(userRole) && userRole == "teacher":
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	case canManage(userRole):
		// admin/super_admin: permitido
	case userRole == "student":
		isOwner, err := s.repo.IsStudentOwnerOfEntrega(ctx, userID, entregaID)
		if err != nil {
			return nil, err
		}
		if !isOwner {
			return nil, errors.New("no autorizado para esta entrega")
		}
	default:
		return nil, errors.New("no autorizado")
	}

	t, err := s.repo.GetTrabajo(ctx, entrega.TrabajoID)
	if err != nil {
		return nil, err
	}
	preguntas, err := s.repo.ListTrabajoPreguntas(ctx, entrega.TrabajoID)
	if err != nil {
		return nil, err
	}
	if userRole == "student" {
		preguntas = sanitizePreguntasForStudent(preguntas)
	}
	respuestas, err := s.repo.ListRespuestasPreguntasByEntrega(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	if len(respuestas) == 0 {
		respuestas = buildRespuestasPreguntasFallback(entrega.ID, entrega.Respuestas, preguntas)
	}

	calif, err := s.repo.GetCalificacionByEntrega(ctx, entregaID)
	if err != nil {
		return nil, err
	}

	califPreguntas := []TrabajoCalificacionPregunta{}
	if calif != nil {
		califPreguntas, err = s.repo.ListCalificacionesPreguntaByCalificacion(ctx, calif.ID)
		if err != nil {
			return nil, err
		}
	}

	return &EntregaDetalleResponse{
		Trabajo:                *t,
		Entrega:                *entrega,
		Preguntas:              preguntas,
		RespuestasPreguntas:    respuestas,
		Calificacion:           calif,
		CalificacionesPregunta: califPreguntas,
	}, nil
}

func (s *Service) CalificarEntregaPorPregunta(ctx context.Context, entregaID string, req CalificarEntregaPorPreguntaRequest, userID, userRole string) (*EntregaDetalleResponse, error) {
	if entregaID == "" {
		return nil, errors.New("entrega_id es requerido")
	}
	if len(req.Items) == 0 {
		return nil, errors.New("items de calificacion son requeridos")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}

	for _, item := range req.Items {
		if item.PreguntaID == "" {
			return nil, errors.New("pregunta_id es requerido en cada item")
		}
		if item.Puntaje < 0 {
			return nil, errors.New("puntaje por pregunta debe ser >= 0")
		}
	}

	entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
	if err != nil {
		return nil, err
	}

	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para calificar esta entrega")
		}
	}

	current, err := s.repo.GetCalificacionByEntrega(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	isOverwrite := current != nil && strings.TrimSpace(entrega.Estado) == "calificada"
	tipoCambio, motivo, err := resolveCalificacionCambio(req.TipoCambio, req.Motivo, isOverwrite)
	if err != nil {
		return nil, err
	}
	req.TipoCambio = tipoCambio
	req.Motivo = motivo

	if _, err := s.repo.UpsertCalificacionPorPregunta(ctx, entregaID, userID, userRole, req, true); err != nil {
		return nil, err
	}

	detalle, err := s.GetEntregaDetalle(ctx, entregaID, userID, userRole)
	if err != nil {
		return nil, err
	}

	if s.notifier != nil {
		student, err := s.repo.GetStudentContactByEntrega(ctx, entregaID)
		if err == nil {
			email := ""
			if student.Email != nil {
				email = *student.Email
			}
			title := detalle.Trabajo.Titulo
			total := 0.0
			if detalle.Calificacion != nil {
				total = detalle.Calificacion.Puntaje
			}
			s.notifier.NotifyEntregaCalificada(detalle.Trabajo.ID, email, title, total)
		}
	}

	return detalle, nil
}

func (s *Service) AutoCalificarEntregaCerradas(ctx context.Context, entregaID, userID, userRole string) (*EntregaDetalleResponse, error) {
	if strings.TrimSpace(entregaID) == "" {
		return nil, errors.New("entrega_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}

	entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para calificar esta entrega")
		}
	}

	preguntas, err := s.repo.ListTrabajoPreguntas(ctx, entrega.TrabajoID)
	if err != nil {
		return nil, err
	}
	if len(preguntas) == 0 {
		return nil, errors.New("este trabajo no tiene preguntas configuradas")
	}

	respuestas, err := s.repo.ListRespuestasPreguntasByEntrega(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	if len(respuestas) == 0 {
		respuestas = buildRespuestasPreguntasFallback(entrega.ID, entrega.Respuestas, preguntas)
	}

	respuestaByPregunta := make(map[string]TrabajoRespuestaPregunta, len(respuestas))
	for _, row := range respuestas {
		respuestaByPregunta[row.PreguntaID] = row
	}

	current, err := s.repo.GetCalificacionByEntrega(ctx, entregaID)
	if err != nil {
		return nil, err
	}

	itemsByPregunta := map[string]CalificarEntregaPreguntaItem{}
	feedbackGeneral := (*string)(nil)
	if current != nil {
		feedbackGeneral = current.Feedback
		existing, err := s.repo.ListCalificacionesPreguntaByCalificacion(ctx, current.ID)
		if err != nil {
			return nil, err
		}
		for _, item := range existing {
			itemsByPregunta[item.PreguntaID] = CalificarEntregaPreguntaItem{
				PreguntaID: item.PreguntaID,
				Puntaje:    item.Puntaje,
				Feedback:   item.Feedback,
			}
		}
	}

	totalAuto := 0
	for _, pregunta := range preguntas {
		if !isClosedQuestionType(pregunta.Tipo) {
			continue
		}

		correcta := trimOptionalText(pregunta.RespuestaCorrecta)
		if correcta == nil {
			continue
		}

		respuesta := ""
		if row, ok := respuestaByPregunta[pregunta.ID]; ok {
			if row.RespuestaOpcion != nil && strings.TrimSpace(*row.RespuestaOpcion) != "" {
				respuesta = *row.RespuestaOpcion
			} else if row.RespuestaTexto != nil {
				respuesta = *row.RespuestaTexto
			}
		}

		puntaje := 0.0
		if isClosedAnswerCorrect(pregunta, respuesta, *correcta) {
			puntaje = pregunta.PuntajeMaximo
			if puntaje <= 0 {
				puntaje = 1
			}
		}

		var feedback *string
		if puntaje > 0 {
			msg := "Correcta"
			feedback = &msg
		} else {
			msg := "Incorrecta"
			feedback = &msg
		}

		itemsByPregunta[pregunta.ID] = CalificarEntregaPreguntaItem{
			PreguntaID: pregunta.ID,
			Puntaje:    puntaje,
			Feedback:   feedback,
		}
		totalAuto++
	}

	if totalAuto == 0 {
		return nil, errors.New("no hay preguntas cerradas con respuesta_correcta configurada")
	}

	finalItems := make([]CalificarEntregaPreguntaItem, 0, len(itemsByPregunta))
	for _, pregunta := range preguntas {
		item, ok := itemsByPregunta[pregunta.ID]
		if !ok {
			continue
		}
		finalItems = append(finalItems, item)
	}

	missing := 0
	for _, pregunta := range preguntas {
		if _, ok := itemsByPregunta[pregunta.ID]; !ok {
			missing++
		}
	}

	autoReq := CalificarEntregaPorPreguntaRequest{
		Items:        finalItems,
		Feedback:     feedbackGeneral,
		SugerenciaIA: json.RawMessage("{}"),
		TipoCambio:   CalificacionTipoAutoObjetiva,
	}

	isOverwrite := current != nil && strings.TrimSpace(entrega.Estado) == "calificada"
	tipoCambio, motivo, err := resolveCalificacionCambio(autoReq.TipoCambio, autoReq.Motivo, isOverwrite)
	if err != nil {
		return nil, err
	}
	autoReq.TipoCambio = tipoCambio
	autoReq.Motivo = motivo

	marcarCalificada := missing == 0
	if _, err := s.repo.UpsertCalificacionPorPregunta(ctx, entregaID, userID, userRole, autoReq, marcarCalificada); err != nil {
		return nil, err
	}

	detalle, err := s.GetEntregaDetalle(ctx, entregaID, userID, userRole)
	if err != nil {
		return nil, err
	}

	if marcarCalificada && s.notifier != nil {
		student, err := s.repo.GetStudentContactByEntrega(ctx, entregaID)
		if err == nil {
			email := ""
			if student.Email != nil {
				email = *student.Email
			}
			title := detalle.Trabajo.Titulo
			total := 0.0
			if detalle.Calificacion != nil {
				total = detalle.Calificacion.Puntaje
			}
			s.notifier.NotifyEntregaCalificada(detalle.Trabajo.ID, email, title, total)
		}
	}

	return detalle, nil
}

func (s *Service) GetCalificacionHistorial(ctx context.Context, entregaID, userID, userRole string) ([]TrabajoCalificacionHistorial, error) {
	if entregaID == "" {
		return nil, errors.New("entrega_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}

	entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
	if err != nil {
		return nil, err
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para este trabajo")
		}
	}

	return s.repo.ListCalificacionHistorialByEntrega(ctx, entregaID)
}

func resolveCalificacionCambio(tipoRaw string, motivo *string, isOverwrite bool) (string, *string, error) {
	tipo := strings.TrimSpace(tipoRaw)
	if tipo == "" {
		if isOverwrite {
			tipo = CalificacionTipoManualOverride
		} else {
			tipo = CalificacionTipoManual
		}
	}

	switch tipo {
	case CalificacionTipoManual, CalificacionTipoManualOverride, CalificacionTipoAutoObjetiva, CalificacionTipoAutoHeuristica:
		// tipo valido
	default:
		return "", nil, errors.New("tipo_cambio invalido")
	}

	if isOverwrite && tipo == CalificacionTipoManual {
		tipo = CalificacionTipoManualOverride
	}
	if !isOverwrite && tipo == CalificacionTipoManualOverride {
		return "", nil, errors.New("tipo_cambio manual_override solo aplica a sobreescrituras")
	}

	motivoNormalizado := trimOptionalText(motivo)
	if tipo == CalificacionTipoManualOverride && motivoNormalizado == nil {
		return "", nil, errors.New("motivo es obligatorio para sobreescribir una calificacion")
	}

	return tipo, motivoNormalizado, nil
}

func trimOptionalText(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}

	items := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		items = append(items, trimmed)
	}
	return items
}

func normalizeTipoPregunta(value string) string {
	tipo := strings.TrimSpace(value)
	switch tipo {
	case "opcion_multiple", "verdadero_falso", "respuesta_corta", "completar":
		return tipo
	default:
		return ""
	}
}

func isClosedQuestionType(tipo string) bool {
	switch strings.TrimSpace(tipo) {
	case "opcion_multiple", "verdadero_falso":
		return true
	default:
		return false
	}
}

func normalizeRespuestaEsperadaTipo(value *string, tipoPregunta string) *string {
	if value != nil {
		normalized := strings.TrimSpace(*value)
		switch normalized {
		case "abierta", "opciones":
			return &normalized
		default:
			return nil
		}
	}

	defaultValue := "abierta"
	if isClosedQuestionType(tipoPregunta) {
		defaultValue = "opciones"
	}
	return &defaultValue
}

func sanitizePreguntasForStudent(preguntas []TrabajoPregunta) []TrabajoPregunta {
	if len(preguntas) == 0 {
		return preguntas
	}

	items := make([]TrabajoPregunta, 0, len(preguntas))
	for _, pregunta := range preguntas {
		copyPregunta := pregunta
		copyPregunta.RespuestaCorrecta = nil
		items = append(items, copyPregunta)
	}
	return items
}

func isClosedAnswerCorrect(pregunta TrabajoPregunta, respuestaRaw, correctaRaw string) bool {
	respuesta := normalizeComparableAnswer(respuestaRaw)
	if respuesta == "" {
		return false
	}

	options := parseOpcionesPregunta(pregunta.Opciones)
	candidates := strings.Split(correctaRaw, "||")
	for _, candidateRaw := range candidates {
		candidate := normalizeComparableAnswer(candidateRaw)
		if candidate == "" {
			continue
		}

		if candidate == respuesta {
			return true
		}

		if resolved, ok := resolveOptionCandidate(candidate, options); ok && resolved == respuesta {
			return true
		}

		if expectedBool, ok := normalizeBoolAlias(candidate); ok {
			if answerBool, ok := normalizeBoolAlias(respuesta); ok && expectedBool == answerBool {
				return true
			}
		}
	}

	return false
}

func parseOpcionesPregunta(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}

	var options []string
	if err := json.Unmarshal(raw, &options); err != nil {
		return nil
	}
	return normalizeStringSlice(options)
}

func resolveOptionCandidate(candidate string, options []string) (string, bool) {
	if len(options) == 0 {
		return "", false
	}

	if len(candidate) == 1 {
		ch := candidate[0]
		if ch >= 'a' && ch <= 'z' {
			idx := int(ch - 'a')
			if idx >= 0 && idx < len(options) {
				return normalizeComparableAnswer(options[idx]), true
			}
		}
	}

	if numeric, err := strconv.Atoi(candidate); err == nil {
		switch {
		case numeric >= 1 && numeric <= len(options):
			return normalizeComparableAnswer(options[numeric-1]), true
		case numeric >= 0 && numeric < len(options):
			return normalizeComparableAnswer(options[numeric]), true
		}
	}

	return "", false
}

func normalizeBoolAlias(value string) (string, bool) {
	switch normalizeComparableAnswer(value) {
	case "verdadero", "true", "v", "si", "yes", "1":
		return "true", true
	case "falso", "false", "f", "no", "0":
		return "false", true
	default:
		return "", false
	}
}

func normalizeComparableAnswer(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" {
		return ""
	}
	return strings.Join(strings.Fields(trimmed), " ")
}

func buildRespuestasPreguntasFallback(entregaID string, respuestasJSON json.RawMessage, preguntas []TrabajoPregunta) []TrabajoRespuestaPregunta {
	parsed := map[string]any{}
	if len(respuestasJSON) > 0 {
		_ = json.Unmarshal(respuestasJSON, &parsed)
	}

	rows := make([]TrabajoRespuestaPregunta, 0, len(preguntas))
	for idx, pregunta := range preguntas {
		value, ok := parsed[pregunta.ID]
		if !ok {
			continue
		}
		text := ""
		switch v := value.(type) {
		case string:
			text = v
		default:
			bytes, _ := json.Marshal(v)
			text = string(bytes)
		}

		copyText := text
		rows = append(rows, TrabajoRespuestaPregunta{
			EntregaID:      entregaID,
			PreguntaID:     pregunta.ID,
			RespuestaTexto: &copyText,
			Orden:          idx + 1,
		})
	}

	return rows
}

func canManage(role string) bool {
	return role == "teacher" || role == "admin" || role == "super_admin"
}


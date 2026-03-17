package trabajos

import (
	"context"
	"encoding/json"
	"errors"
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
	if userRole == "teacher" {
		entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
		if err != nil {
			return nil, err
		}
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para calificar esta entrega")
		}
	}
	calificacion, err := s.repo.UpsertCalificacion(ctx, entregaID, userID, req)
	if err != nil {
		return nil, err
	}

	if s.notifier != nil {
		entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
		if err == nil {
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
	}

	return calificacion, nil
}

func (s *Service) GetEntregaDetalle(ctx context.Context, entregaID, userID, userRole string) (*EntregaDetalleResponse, error) {
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

	t, err := s.repo.GetTrabajo(ctx, entrega.TrabajoID)
	if err != nil {
		return nil, err
	}
	preguntas, err := s.repo.ListTrabajoPreguntas(ctx, entrega.TrabajoID)
	if err != nil {
		return nil, err
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

	if userRole == "teacher" {
		entrega, err := s.repo.GetEntregaByID(ctx, entregaID)
		if err != nil {
			return nil, err
		}
		ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, entrega.TrabajoID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para calificar esta entrega")
		}
	}

	if _, err := s.repo.UpsertCalificacionPorPregunta(ctx, entregaID, userID, req); err != nil {
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

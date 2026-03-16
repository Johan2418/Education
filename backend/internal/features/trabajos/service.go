package trabajos

import (
	"context"
	"errors"
	"strings"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
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
	return s.repo.UpdateTrabajoEstado(ctx, trabajoID, estado)
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
	return s.repo.UpsertEntrega(ctx, trabajoID, userID, req)
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

func (s *Service) ListEntregasByTrabajo(ctx context.Context, trabajoID, userID, userRole string) ([]EntregaConCalificacion, error) {
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
	return s.repo.ListEntregasByTrabajo(ctx, trabajoID)
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
	return s.repo.UpsertCalificacion(ctx, entregaID, userID, req)
}

func canManage(role string) bool {
	return role == "teacher" || role == "admin" || role == "super_admin"
}

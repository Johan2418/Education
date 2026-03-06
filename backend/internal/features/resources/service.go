package resources

import (
	"context"
	"errors"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ─── Recurso ────────────────────────────────────────────────

func (s *Service) ListRecursos(ctx context.Context) ([]Recurso, error) {
	return s.repo.ListRecursos(ctx)
}

func (s *Service) GetRecurso(ctx context.Context, id string) (*Recurso, error) {
	return s.repo.GetRecurso(ctx, id)
}

func (s *Service) CreateRecurso(ctx context.Context, req RecursoRequest, createdBy string) (*Recurso, error) {
	if req.Titulo == "" {
		return nil, errors.New("el título es obligatorio")
	}
	return s.repo.CreateRecurso(ctx, req, createdBy)
}

func (s *Service) UpdateRecurso(ctx context.Context, id string, req RecursoRequest) (*Recurso, error) {
	return s.repo.UpdateRecurso(ctx, id, req)
}

func (s *Service) DeleteRecurso(ctx context.Context, id string) error {
	return s.repo.DeleteRecurso(ctx, id)
}

// ─── Modelo RA ──────────────────────────────────────────────

func (s *Service) ListModelos(ctx context.Context) ([]ModeloRA, error) {
	return s.repo.ListModelos(ctx)
}

func (s *Service) GetModelo(ctx context.Context, id string) (*ModeloRA, error) {
	return s.repo.GetModelo(ctx, id)
}

func (s *Service) CreateModelo(ctx context.Context, req ModeloRARequest, createdBy string) (*ModeloRA, error) {
	if req.NombreModelo == "" {
		return nil, errors.New("el nombre del modelo es obligatorio")
	}
	return s.repo.CreateModelo(ctx, req, createdBy)
}

func (s *Service) UpdateModelo(ctx context.Context, id string, req ModeloRARequest) (*ModeloRA, error) {
	return s.repo.UpdateModelo(ctx, id, req)
}

func (s *Service) DeleteModelo(ctx context.Context, id string) error {
	return s.repo.DeleteModelo(ctx, id)
}

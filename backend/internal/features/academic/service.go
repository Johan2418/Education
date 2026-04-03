package academic

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

// ─── Curso ──────────────────────────────────────────────────

func (s *Service) ListCursos(ctx context.Context) ([]Curso, error) {
	return s.repo.ListCursos(ctx)
}

func (s *Service) ListCursosByTeacher(ctx context.Context, teacherID string) ([]Curso, error) {
	return s.repo.ListCursosByTeacher(ctx, teacherID)
}

func (s *Service) GetCurso(ctx context.Context, id string) (*Curso, error) {
	return s.repo.GetCurso(ctx, id)
}

func (s *Service) CreateCurso(ctx context.Context, req CursoRequest) (*Curso, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	return s.repo.CreateCurso(ctx, req)
}

func (s *Service) UpdateCurso(ctx context.Context, id string, req CursoRequest) (*Curso, error) {
	return s.repo.UpdateCurso(ctx, id, req)
}

func (s *Service) DeleteCurso(ctx context.Context, id string) error {
	return s.repo.DeleteCurso(ctx, id)
}

// ─── Estudiante-Curso ───────────────────────────────────────

func (s *Service) ListEstudianteCursos(ctx context.Context, estudianteID string) ([]EstudianteCurso, error) {
	return s.repo.ListEstudianteCursos(ctx, estudianteID)
}

func (s *Service) ListEstudiantesByCurso(ctx context.Context, cursoID string) ([]EstudianteCursoDetail, error) {
	return s.repo.ListEstudiantesByCurso(ctx, cursoID)
}

func (s *Service) EnrollStudent(ctx context.Context, req EstudianteCursoRequest) (*EstudianteCurso, error) {
	return s.repo.EnrollStudent(ctx, req)
}

func (s *Service) UnenrollStudent(ctx context.Context, id string) error {
	return s.repo.UnenrollStudent(ctx, id)
}

// ─── Materia ────────────────────────────────────────────────

func (s *Service) ListMaterias(ctx context.Context, cursoID string) ([]Materia, error) {
	return s.repo.ListMaterias(ctx, cursoID)
}

func (s *Service) GetMateria(ctx context.Context, id string) (*Materia, error) {
	return s.repo.GetMateria(ctx, id)
}

func (s *Service) CreateMateria(ctx context.Context, req MateriaRequest, createdBy string) (*Materia, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	if req.CursoID == "" {
		return nil, errRequired("curso_id")
	}
	return s.repo.CreateMateria(ctx, req, createdBy)
}

func (s *Service) UpdateMateria(ctx context.Context, id string, req MateriaRequest) (*Materia, error) {
	return s.repo.UpdateMateria(ctx, id, req)
}

func (s *Service) DeleteMateria(ctx context.Context, id string) error {
	return s.repo.DeleteMateria(ctx, id)
}

// ─── Unidad ─────────────────────────────────────────────────

func (s *Service) ListUnidades(ctx context.Context, materiaID string) ([]Unidad, error) {
	return s.repo.ListUnidades(ctx, materiaID)
}

func (s *Service) GetUnidad(ctx context.Context, id string) (*Unidad, error) {
	return s.repo.GetUnidad(ctx, id)
}

func (s *Service) CreateUnidad(ctx context.Context, req UnidadRequest, createdBy string) (*Unidad, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	return s.repo.CreateUnidad(ctx, req, createdBy)
}

func (s *Service) UpdateUnidad(ctx context.Context, id string, req UnidadRequest) (*Unidad, error) {
	return s.repo.UpdateUnidad(ctx, id, req)
}

func (s *Service) DeleteUnidad(ctx context.Context, id string) error {
	return s.repo.DeleteUnidad(ctx, id)
}

// ─── Tema ───────────────────────────────────────────────────

func (s *Service) ListTemas(ctx context.Context, unidadID string) ([]Tema, error) {
	return s.repo.ListTemas(ctx, unidadID)
}

func (s *Service) GetTema(ctx context.Context, id string) (*Tema, error) {
	return s.repo.GetTema(ctx, id)
}

func (s *Service) CreateTema(ctx context.Context, req TemaRequest, createdBy string) (*Tema, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	return s.repo.CreateTema(ctx, req, createdBy)
}

func (s *Service) UpdateTema(ctx context.Context, id string, req TemaRequest) (*Tema, error) {
	return s.repo.UpdateTema(ctx, id, req)
}

func (s *Service) DeleteTema(ctx context.Context, id string) error {
	return s.repo.DeleteTema(ctx, id)
}

// ─── Lección ────────────────────────────────────────────────

func (s *Service) ListLecciones(ctx context.Context, temaID string) ([]Leccion, error) {
	return s.repo.ListLecciones(ctx, temaID)
}

func (s *Service) ListRecentLecciones(ctx context.Context, userID string, limit int) ([]Leccion, error) {
	if limit <= 0 {
		limit = 6
	}

	if userID != "" {
		items, err := s.repo.ListRecentLeccionesByUser(ctx, userID, limit)
		if err != nil {
			return nil, err
		}
		if len(items) > 0 {
			return items, nil
		}
	}

	return s.repo.ListLatestLecciones(ctx, limit)
}

func (s *Service) GetLeccion(ctx context.Context, id string) (*Leccion, error) {
	return s.repo.GetLeccion(ctx, id)
}

func (s *Service) CreateLeccion(ctx context.Context, req LeccionRequest, createdBy string) (*Leccion, error) {
	if req.Titulo == "" {
		return nil, errRequired("titulo")
	}
	return s.repo.CreateLeccion(ctx, req, createdBy)
}

func (s *Service) UpdateLeccion(ctx context.Context, id string, req LeccionRequest) (*Leccion, error) {
	return s.repo.UpdateLeccion(ctx, id, req)
}

func (s *Service) DeleteLeccion(ctx context.Context, id string) error {
	return s.repo.DeleteLeccion(ctx, id)
}

// ─── Secciones ──────────────────────────────────────────────

func (s *Service) ListSecciones(ctx context.Context, leccionID string) ([]LeccionSeccion, error) {
	return s.repo.ListSecciones(ctx, leccionID)
}

func (s *Service) CreateSeccion(ctx context.Context, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	if err := validateCalificacionSeccion(req); err != nil {
		return nil, err
	}
	return s.repo.CreateSeccion(ctx, req)
}

func (s *Service) UpdateSeccion(ctx context.Context, id string, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	if err := validateCalificacionSeccion(req); err != nil {
		return nil, err
	}
	return s.repo.UpdateSeccion(ctx, id, req)
}

func (s *Service) DeleteSeccion(ctx context.Context, id string) error {
	return s.repo.DeleteSeccion(ctx, id)
}

// ─── Seguimiento ────────────────────────────────────────────

func (s *Service) ListSeguimientos(ctx context.Context, usuarioID string) ([]MateriaSeguimiento, error) {
	return s.repo.ListSeguimientos(ctx, usuarioID)
}

func (s *Service) SeguirMateria(ctx context.Context, usuarioID, materiaID string) (*MateriaSeguimiento, error) {
	return s.repo.SeguirMateria(ctx, usuarioID, materiaID)
}

func (s *Service) DejarDeSeguirMateria(ctx context.Context, usuarioID, materiaID string) error {
	return s.repo.DejarDeSeguirMateria(ctx, usuarioID, materiaID)
}

// ─── helpers ────────────────────────────────────────────────

func errRequired(field string) error {
	return &validationError{field: field}
}

type validationError struct{ field string }

func (e *validationError) Error() string {
	return "El campo '" + e.field + "' es obligatorio"
}

func validateCalificacionSeccion(req LeccionSeccionRequest) error {
	if req.NotaMaxima != nil && *req.NotaMaxima <= 0 {
		return errors.New("nota_maxima debe ser > 0")
	}
	if req.PesoCalif != nil && *req.PesoCalif < 0 {
		return errors.New("peso_calificacion debe ser >= 0")
	}
	return nil
}

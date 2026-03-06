package evaluations

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

// ═══════════════════════════════════════════════════════════════
// PRUEBA
// ═══════════════════════════════════════════════════════════════

func (s *Service) ListPruebasByLeccion(ctx context.Context, leccionID string) ([]Prueba, error) {
	return s.repo.ListPruebasByLeccion(ctx, leccionID)
}

func (s *Service) GetPrueba(ctx context.Context, id string) (*Prueba, error) {
	return s.repo.GetPrueba(ctx, id)
}

func (s *Service) GetPruebaCompleta(ctx context.Context, id string) (*PruebaCompleta, error) {
	return s.repo.GetPruebaCompleta(ctx, id)
}

func (s *Service) CreatePrueba(ctx context.Context, req PruebaRequest, createdBy string) (*Prueba, error) {
	if req.LeccionID == nil || req.Titulo == "" {
		return nil, errors.New("leccion_id y titulo son requeridos")
	}
	return s.repo.CreatePrueba(ctx, req, createdBy)
}

func (s *Service) UpdatePrueba(ctx context.Context, id string, req PruebaRequest) (*Prueba, error) {
	return s.repo.UpdatePrueba(ctx, id, req)
}

func (s *Service) DeletePrueba(ctx context.Context, id string) error {
	return s.repo.DeletePrueba(ctx, id)
}

// ═══════════════════════════════════════════════════════════════
// PREGUNTA
// ═══════════════════════════════════════════════════════════════

func (s *Service) ListPreguntas(ctx context.Context, pruebaID string) ([]PreguntaConRespuestas, error) {
	return s.repo.ListPreguntas(ctx, pruebaID)
}

func (s *Service) CreatePregunta(ctx context.Context, req PreguntaRequest) (*Pregunta, error) {
	if req.PruebaID == "" || req.Texto == "" || req.Tipo == "" {
		return nil, errors.New("prueba_id, texto y tipo son requeridos")
	}
	return s.repo.CreatePregunta(ctx, req)
}

func (s *Service) UpdatePregunta(ctx context.Context, id string, req PreguntaRequest) (*Pregunta, error) {
	return s.repo.UpdatePregunta(ctx, id, req)
}

func (s *Service) DeletePregunta(ctx context.Context, id string) error {
	return s.repo.DeletePregunta(ctx, id)
}

// ═══════════════════════════════════════════════════════════════
// RESPUESTA
// ═══════════════════════════════════════════════════════════════

func (s *Service) CreateRespuesta(ctx context.Context, req RespuestaRequest) (*Respuesta, error) {
	if req.PreguntaID == "" || req.Texto == "" {
		return nil, errors.New("pregunta_id y texto son requeridos")
	}
	return s.repo.CreateRespuesta(ctx, req)
}

func (s *Service) UpdateRespuesta(ctx context.Context, id string, req RespuestaRequest) (*Respuesta, error) {
	return s.repo.UpdateRespuesta(ctx, id, req)
}

func (s *Service) DeleteRespuesta(ctx context.Context, id string) error {
	return s.repo.DeleteRespuesta(ctx, id)
}

// ═══════════════════════════════════════════════════════════════
// RESULTADO PRUEBA
// ═══════════════════════════════════════════════════════════════

func (s *Service) SubmitResultado(ctx context.Context, req ResultadoPruebaRequest, usuarioID string) (*ResultadoPrueba, error) {
	if req.PruebaID == "" {
		return nil, errors.New("prueba_id es requerido")
	}
	return s.repo.CreateResultado(ctx, req, usuarioID)
}

func (s *Service) ListResultadosByPrueba(ctx context.Context, pruebaID string) ([]ResultadoPrueba, error) {
	return s.repo.ListResultadosByPrueba(ctx, pruebaID)
}

func (s *Service) ListMisResultados(ctx context.Context, usuarioID, pruebaID string) ([]ResultadoPrueba, error) {
	return s.repo.ListResultadosByUsuario(ctx, usuarioID, pruebaID)
}

func (s *Service) GetBestResultado(ctx context.Context, usuarioID, pruebaID string) (*ResultadoPrueba, error) {
	return s.repo.GetBestResultado(ctx, usuarioID, pruebaID)
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO
// ═══════════════════════════════════════════════════════════════

func (s *Service) UpsertProgreso(ctx context.Context, usuarioID string, req ProgresoRequest) (*Progreso, error) {
	if req.LeccionID == "" {
		return nil, errors.New("leccion_id es requerido")
	}
	return s.repo.UpsertProgreso(ctx, usuarioID, req)
}

func (s *Service) ListMisProgresos(ctx context.Context, usuarioID string) ([]Progreso, error) {
	return s.repo.ListProgresosByUsuario(ctx, usuarioID)
}

func (s *Service) GetProgreso(ctx context.Context, usuarioID, leccionID string) (*Progreso, error) {
	return s.repo.GetProgreso(ctx, usuarioID, leccionID)
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO SECCION
// ═══════════════════════════════════════════════════════════════

func (s *Service) UpsertProgresoSeccion(ctx context.Context, userID string, req ProgresoSeccionRequest) (*ProgresoSeccion, error) {
	if req.LeccionSeccionID == "" {
		return nil, errors.New("leccion_seccion_id es requerido")
	}
	return s.repo.UpsertProgresoSeccion(ctx, userID, req)
}

func (s *Service) ListProgresoSeccionesByLeccion(ctx context.Context, userID, leccionID string) ([]ProgresoSeccion, error) {
	return s.repo.ListProgresoSeccionesByLeccion(ctx, userID, leccionID)
}

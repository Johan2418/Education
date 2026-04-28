package evaluations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"gorm.io/gorm"
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
	if req.NotaMaxima != nil && *req.NotaMaxima <= 0 {
		return nil, errors.New("nota_maxima debe ser > 0")
	}
	if req.PesoCalif != nil && *req.PesoCalif < 0 {
		return nil, errors.New("peso_calificacion debe ser >= 0")
	}
	if req.PuntajeMinimo != nil && (*req.PuntajeMinimo < 0 || *req.PuntajeMinimo > 100) {
		return nil, errors.New("puntaje_minimo debe estar entre 0 y 100")
	}
	return s.repo.CreatePrueba(ctx, req, createdBy)
}

func (s *Service) UpdatePrueba(ctx context.Context, id string, req PruebaRequest) (*Prueba, error) {
	if req.NotaMaxima != nil && *req.NotaMaxima <= 0 {
		return nil, errors.New("nota_maxima debe ser > 0")
	}
	if req.PesoCalif != nil && *req.PesoCalif < 0 {
		return nil, errors.New("peso_calificacion debe ser >= 0")
	}
	if req.PuntajeMinimo != nil && (*req.PuntajeMinimo < 0 || *req.PuntajeMinimo > 100) {
		return nil, errors.New("puntaje_minimo debe estar entre 0 y 100")
	}
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
	if req.PuntajeMaximo != nil && *req.PuntajeMaximo <= 0 {
		return nil, errors.New("puntaje_maximo debe ser > 0")
	}
	return s.repo.CreatePregunta(ctx, req)
}

func (s *Service) UpdatePregunta(ctx context.Context, id string, req PreguntaRequest) (*Pregunta, error) {
	if req.PuntajeMaximo != nil && *req.PuntajeMaximo <= 0 {
		return nil, errors.New("puntaje_maximo debe ser > 0")
	}
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

	canonical := req
	if canonical.LegacyPuntaje != nil {
		canonical.PuntajeObtenido = *canonical.LegacyPuntaje
	}
	if len(canonical.Respuestas) == 0 && len(canonical.LegacyRespuestas) > 0 {
		canonical.Respuestas = canonical.LegacyRespuestas
	}
	if canonical.PuntajeObtenido < 0 || canonical.PuntajeObtenido > 100 {
		return nil, errors.New("puntaje_obtenido debe estar entre 0 y 100")
	}
	if len(canonical.Respuestas) == 0 {
		canonical.Respuestas = json.RawMessage("{}")
	}

	pruebaCompleta, err := s.repo.GetPruebaCompleta(ctx, canonical.PruebaID)
	if err != nil {
		return nil, err
	}

	if autoPuntaje, calculado, err := calcularPuntajeObjetivo(pruebaCompleta.Preguntas, canonical.Respuestas); err != nil {
		return nil, err
	} else if calculado {
		canonical.PuntajeObtenido = autoPuntaje
	}

	canonical.Aprobado = canonical.PuntajeObtenido >= pruebaCompleta.PuntajeMinimo

	resultado, err := s.repo.CreateResultado(ctx, canonical, usuarioID)
	if err != nil {
		return nil, err
	}

	if pruebaCompleta.LeccionID != nil && strings.TrimSpace(*pruebaCompleta.LeccionID) != "" {
		leccionID := strings.TrimSpace(*pruebaCompleta.LeccionID)
		reqProgreso := ProgresoRequest{LeccionID: leccionID}

		existing, progresoErr := s.repo.GetProgreso(ctx, usuarioID, leccionID)
		if progresoErr != nil && !errors.Is(progresoErr, gorm.ErrRecordNotFound) {
			return nil, progresoErr
		}

		completado := canonical.Aprobado
		if existing != nil && existing.Completado {
			completado = true
		}
		reqProgreso.Completado = &completado

		mejorPuntaje := canonical.PuntajeObtenido
		if existing != nil && existing.Puntaje != nil && *existing.Puntaje > mejorPuntaje {
			mejorPuntaje = *existing.Puntaje
		}
		reqProgreso.Puntaje = &mejorPuntaje

		if _, err := s.repo.UpsertProgreso(ctx, usuarioID, reqProgreso); err != nil {
			return nil, err
		}
	}

	return resultado, nil
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
	if req.LeccionSeccionID == "" && req.SeccionID != "" {
		req.LeccionSeccionID = req.SeccionID
	}
	if req.LeccionSeccionID == "" {
		return nil, errors.New("leccion_seccion_id es requerido")
	}
	return s.repo.UpsertProgresoSeccion(ctx, userID, req)
}

func (s *Service) ListProgresoSeccionesByLeccion(ctx context.Context, userID, leccionID string) ([]ProgresoSeccion, error) {
	return s.repo.ListProgresoSeccionesByLeccion(ctx, userID, leccionID)
}

func calcularPuntajeObjetivo(preguntas []PreguntaConRespuestas, respuestasJSON json.RawMessage) (float64, bool, error) {
	respuestas := map[string]any{}
	if len(respuestasJSON) > 0 {
		if err := json.Unmarshal(respuestasJSON, &respuestas); err != nil {
			return 0, false, errors.New("respuestas inválidas")
		}
	}

	totalMaximo := 0.0
	totalObtenido := 0.0

	for _, pregunta := range preguntas {
		if !esPreguntaObjetiva(pregunta.Tipo) {
			continue
		}

		maximoPregunta := puntajePreguntaMaximo(pregunta.PuntajeMaximo)
		totalMaximo += maximoPregunta

		answerRaw, ok := respuestas[pregunta.ID]
		if !ok {
			continue
		}
		if esRespuestaCorrecta(answerRaw, pregunta.Respuestas) {
			totalObtenido += maximoPregunta
		}
	}

	if totalMaximo <= 0 {
		return 0, false, nil
	}

	porcentaje := (totalObtenido / totalMaximo) * 100
	return math.Round(porcentaje*100) / 100, true, nil
}

func esPreguntaObjetiva(tipo string) bool {
	return tipo == "opcion_multiple" || tipo == "verdadero_falso"
}

func puntajePreguntaMaximo(v float64) float64 {
	if v > 0 {
		return v
	}
	return 1
}

func esRespuestaCorrecta(answerRaw any, respuestas []Respuesta) bool {
	if len(respuestas) == 0 {
		return false
	}

	correctIDs := map[string]struct{}{}
	correctTextos := map[string]struct{}{}
	for _, respuesta := range respuestas {
		if !respuesta.EsCorrecta {
			continue
		}
		if respuesta.ID != "" {
			correctIDs[respuesta.ID] = struct{}{}
		}
		texto := normalizeEvaluationAnswer(respuesta.Texto)
		if texto != "" {
			correctTextos[texto] = struct{}{}
		}
	}

	answer := normalizeEvaluationAnswer(fmt.Sprint(answerRaw))
	if answer == "" {
		return false
	}
	if _, ok := correctIDs[answer]; ok {
		return true
	}
	_, ok := correctTextos[answer]
	return ok
}

func normalizeEvaluationAnswer(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

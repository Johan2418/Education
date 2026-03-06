package evaluations

import (
	"net/http"

	"github.com/arcanea/backend/internal/middleware"
	"github.com/arcanea/backend/internal/shared"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListPruebas(w http.ResponseWriter, r *http.Request) {
	leccionID := chi.URLParam(r, "leccionId")
	items, err := h.svc.ListPruebasByLeccion(r.Context(), leccionID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetPrueba(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pruebaId")
	item, err := h.svc.GetPrueba(r.Context(), id)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "prueba no encontrada")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetPruebaCompleta(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pruebaId")
	item, err := h.svc.GetPruebaCompleta(r.Context(), id)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "prueba no encontrada")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreatePrueba(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req PruebaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.CreatePrueba(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdatePrueba(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pruebaId")
	var req PruebaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.UpdatePrueba(r.Context(), id, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeletePrueba(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pruebaId")
	if err := h.svc.DeletePrueba(r.Context(), id); err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.MessageOK(w, "prueba eliminada")
}

// ═══════════════════════════════════════════════════════════════
// PREGUNTA
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListPreguntas(w http.ResponseWriter, r *http.Request) {
	pruebaID := chi.URLParam(r, "pruebaId")
	items, err := h.svc.ListPreguntas(r.Context(), pruebaID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CreatePregunta(w http.ResponseWriter, r *http.Request) {
	var req PreguntaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.CreatePregunta(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdatePregunta(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "preguntaId")
	var req PreguntaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.UpdatePregunta(r.Context(), id, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeletePregunta(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "preguntaId")
	if err := h.svc.DeletePregunta(r.Context(), id); err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.MessageOK(w, "pregunta eliminada")
}

// ═══════════════════════════════════════════════════════════════
// RESPUESTA
// ═══════════════════════════════════════════════════════════════

func (h *Handler) CreateRespuesta(w http.ResponseWriter, r *http.Request) {
	var req RespuestaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.CreateRespuesta(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateRespuesta(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "respuestaId")
	var req RespuestaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.UpdateRespuesta(r.Context(), id, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteRespuesta(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "respuestaId")
	if err := h.svc.DeleteRespuesta(r.Context(), id); err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.MessageOK(w, "respuesta eliminada")
}

// ═══════════════════════════════════════════════════════════════
// RESULTADO PRUEBA
// ═══════════════════════════════════════════════════════════════

func (h *Handler) SubmitResultado(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ResultadoPruebaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.SubmitResultado(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) ListResultadosByPrueba(w http.ResponseWriter, r *http.Request) {
	pruebaID := chi.URLParam(r, "pruebaId")
	items, err := h.svc.ListResultadosByPrueba(r.Context(), pruebaID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) ListMisResultados(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	pruebaID := chi.URLParam(r, "pruebaId")
	items, err := h.svc.ListMisResultados(r.Context(), claims.Subject, pruebaID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetBestResultado(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	pruebaID := chi.URLParam(r, "pruebaId")
	item, err := h.svc.GetBestResultado(r.Context(), claims.Subject, pruebaID)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "sin resultados")
		return
	}
	shared.Success(w, item)
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO
// ═══════════════════════════════════════════════════════════════

func (h *Handler) UpsertProgreso(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ProgresoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.UpsertProgreso(r.Context(), claims.Subject, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListMisProgresos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListMisProgresos(r.Context(), claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetProgreso(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	leccionID := chi.URLParam(r, "leccionId")
	item, err := h.svc.GetProgreso(r.Context(), claims.Subject, leccionID)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "progreso no encontrado")
		return
	}
	shared.Success(w, item)
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO SECCION
// ═══════════════════════════════════════════════════════════════

func (h *Handler) UpsertProgresoSeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ProgresoSeccionRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := h.svc.UpsertProgresoSeccion(r.Context(), claims.Subject, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListProgresoSecciones(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	leccionID := chi.URLParam(r, "leccionId")
	items, err := h.svc.ListProgresoSeccionesByLeccion(r.Context(), claims.Subject, leccionID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	shared.Success(w, items)
}

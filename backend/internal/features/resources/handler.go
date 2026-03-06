package resources

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/arcanea/backend/internal/middleware"
	"github.com/arcanea/backend/internal/shared"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ═══════════════════════════════════════════════════════════════
// RECURSOS
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListRecursos(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListRecursos(r.Context())
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando recursos")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetRecurso(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetRecurso(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Recurso no encontrado")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateRecurso(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req RecursoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateRecurso(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateRecurso(w http.ResponseWriter, r *http.Request) {
	var req RecursoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateRecurso(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando recurso")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteRecurso(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteRecurso(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando recurso")
		return
	}
	shared.MessageOK(w, "Recurso eliminado")
}

// ═══════════════════════════════════════════════════════════════
// MODELOS RA
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListModelos(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListModelos(r.Context())
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando modelos")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetModelo(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetModelo(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Modelo no encontrado")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateModelo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ModeloRARequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateModelo(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateModelo(w http.ResponseWriter, r *http.Request) {
	var req ModeloRARequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateModelo(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando modelo")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteModelo(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteModelo(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando modelo")
		return
	}
	shared.MessageOK(w, "Modelo eliminado")
}

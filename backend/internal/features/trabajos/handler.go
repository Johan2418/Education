package trabajos

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

func (h *Handler) CreateTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateTrabajoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateTrabajo(r.Context(), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) ListTrabajosByLeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListTrabajosByLeccion(r.Context(), chi.URLParam(r, "leccionId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) PublicarTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.PublicarTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CerrarTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.CerrarTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListMisTrabajos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListMisTrabajos(r.Context(), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) UpsertEntrega(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateEntregaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpsertEntrega(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetMiEntrega(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetMiEntrega(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) UpdateEntregaByID(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateEntregaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateEntregaByID(r.Context(), chi.URLParam(r, "entregaId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListEntregasByTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListEntregasByTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CalificarEntrega(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CalificarEntregaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CalificarEntrega(r.Context(), chi.URLParam(r, "entregaId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

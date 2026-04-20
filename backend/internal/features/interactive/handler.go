package interactive

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/arcanea/backend/internal/middleware"
	"github.com/arcanea/backend/internal/shared"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func getPathParam(r *http.Request, keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(chi.URLParam(r, key)); v != "" {
			return v
		}
	}
	return ""
}

func (h *Handler) ListActividadesByLeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListActividadesByLeccion(r.Context(), getPathParam(r, "leccionId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetActividad(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetActividad(r.Context(), getPathParam(r, "actividadId", "id"), claims.Subject, claims.UserRole)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			shared.Error(w, http.StatusNotFound, "actividad no encontrada")
			return
		}
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateActividad(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ActividadInteractivaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "datos inválidos")
		return
	}
	item, err := h.svc.CreateActividad(r.Context(), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateActividad(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ActividadInteractivaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "datos inválidos")
		return
	}
	item, err := h.svc.UpdateActividad(r.Context(), getPathParam(r, "actividadId", "id"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteActividad(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if err := h.svc.DeleteActividad(r.Context(), getPathParam(r, "actividadId", "id"), claims.Subject, claims.UserRole); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status = http.StatusNotFound
		}
		shared.Error(w, status, err.Error())
		return
	}
	shared.MessageOK(w, "actividad interactiva eliminada")
}

func (h *Handler) GetMiIntento(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetMiIntento(r.Context(), getPathParam(r, "actividadId"), claims.Subject, claims.UserRole)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			shared.Error(w, http.StatusNotFound, "intento no encontrado")
			return
		}
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) UpsertIntento(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req UpsertIntentoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "datos inválidos")
		return
	}
	item, err := h.svc.UpsertIntento(r.Context(), getPathParam(r, "actividadId"), claims.Subject, claims.UserRole, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListIntentosByActividad(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListIntentosByActividad(r.Context(), getPathParam(r, "actividadId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

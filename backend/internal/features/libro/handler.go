package libro

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

func (h *Handler) GetEstado(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetEstado(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) ExtractLibro(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ExtractLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.ExtractLibro(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) StartExtractLibroAsync(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ExtractLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.StartExtractLibroAsync(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetExtractLibroJobStatus(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetExtractLibroJob(
		r.Context(),
		chi.URLParam(r, "trabajoId"),
		chi.URLParam(r, "jobId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) RevisarLibro(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req RevisionLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.RevisarLibro(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) ConfirmarLibro(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ConfirmarLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.ConfirmarLibro(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetObservability(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetObservability(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

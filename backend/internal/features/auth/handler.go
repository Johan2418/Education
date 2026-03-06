package auth

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

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	resp, err := h.svc.Register(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	shared.Created(w, resp)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	resp, err := h.svc.Login(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusUnauthorized, err.Error())
		return
	}

	shared.Success(w, resp)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	user, err := h.svc.Me(r.Context(), claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Usuario no encontrado")
		return
	}
	shared.Success(w, user)
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req UpdateProfileRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	user, err := h.svc.UpdateProfile(r.Context(), claims.Subject, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando perfil")
		return
	}
	shared.Success(w, user)
}

func (h *Handler) CreateAdmin(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateAdminRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	user, err := h.svc.CreateAdmin(r.Context(), req, claims.UserRole, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Created(w, user)
}

func (h *Handler) ChangeRole(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ChangeRoleRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	user, err := h.svc.ChangeRole(r.Context(), req, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, user)
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.svc.ListUsers(r.Context())
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando usuarios")
		return
	}
	shared.Success(w, users)
}

func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.svc.GetUser(r.Context(), id)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Usuario no encontrado")
		return
	}
	shared.Success(w, user)
}

func (h *Handler) ApproveRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.svc.ApproveRoleRequest(r.Context(), id)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, user)
}

func (h *Handler) RejectRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.RejectRoleRequest(r.Context(), id); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.MessageOK(w, "Solicitud de rol rechazada")
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteUser(r.Context(), id); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando usuario")
		return
	}
	shared.MessageOK(w, "Usuario eliminado")
}

func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		shared.Error(w, http.StatusBadRequest, "Token requerido")
		return
	}

	if err := h.svc.VerifyEmail(r.Context(), token); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	shared.MessageOK(w, "Cuenta verificada exitosamente")
}

func (h *Handler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req ResendVerificationRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	if err := h.svc.ResendVerification(r.Context(), req.Email); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	shared.MessageOK(w, "Correo de verificación reenviado")
}

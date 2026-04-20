package resources

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/arcanea/backend/internal/middleware"
	"github.com/arcanea/backend/internal/shared"
)

type Handler struct {
	svc *Service
}

func getPathParam(r *http.Request, keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(chi.URLParam(r, key)); v != "" {
			return v
		}
	}
	return ""
}

func parseOptionalBool(raw string) (*bool, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return nil, nil
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return nil, errors.New("parámetro booleano inválido")
	}
	return &v, nil
}

func statusFromServiceErr(err error) int {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return http.StatusNotFound
	}
	errText := strings.ToLower(err.Error())
	if strings.Contains(errText, "no autorizado") {
		return http.StatusForbidden
	}
	return http.StatusBadRequest
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
	item, err := h.svc.GetRecurso(r.Context(), getPathParam(r, "recursoId", "id"))
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
	item, err := h.svc.UpdateRecurso(r.Context(), getPathParam(r, "recursoId", "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando recurso")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteRecurso(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteRecurso(r.Context(), getPathParam(r, "recursoId", "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando recurso")
		return
	}
	shared.MessageOK(w, "Recurso eliminado")
}

func (h *Handler) ListRecursosPersonales(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	activo, err := parseOptionalBool(r.URL.Query().Get("activo"))
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	items, svcErr := h.svc.ListRecursosPersonales(r.Context(), claims.Subject, claims.UserRole, ListRecursosPersonalesQuery{
		Q:      strings.TrimSpace(r.URL.Query().Get("q")),
		Tipo:   strings.TrimSpace(r.URL.Query().Get("tipo")),
		Activo: activo,
	})
	if svcErr != nil {
		shared.Error(w, statusFromServiceErr(svcErr), svcErr.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetRecursoPersonal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	item, err := h.svc.GetRecursoPersonal(r.Context(), getPathParam(r, "recursoPersonalId", "id"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateRecursoPersonal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	var req RecursoPersonalRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.CreateRecursoPersonal(r.Context(), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateRecursoPersonal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	var req RecursoPersonalRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.UpdateRecursoPersonal(r.Context(), getPathParam(r, "recursoPersonalId", "id"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteRecursoPersonal(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.DeleteRecursoPersonal(r.Context(), getPathParam(r, "recursoPersonalId", "id"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal eliminado")
}

func (h *Handler) ListMateriaRecursosPersonales(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	items, err := h.svc.ListMateriaRecursosPersonales(r.Context(), getPathParam(r, "materiaId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) AttachRecursoPersonalToMateria(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.AttachRecursoPersonalToMateria(
		r.Context(),
		getPathParam(r, "materiaId"),
		getPathParam(r, "recursoPersonalId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal acoplado a la materia")
}

func (h *Handler) DetachRecursoPersonalFromMateria(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.DetachRecursoPersonalFromMateria(
		r.Context(),
		getPathParam(r, "materiaId"),
		getPathParam(r, "recursoPersonalId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal desacoplado de la materia")
}

func (h *Handler) ListSeccionRecursosPersonales(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	items, err := h.svc.ListSeccionRecursosPersonales(r.Context(), getPathParam(r, "seccionId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) AttachRecursoPersonalToSeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.AttachRecursoPersonalToSeccion(
		r.Context(),
		getPathParam(r, "seccionId"),
		getPathParam(r, "recursoPersonalId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal acoplado a la sección")
}

func (h *Handler) DetachRecursoPersonalFromSeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.DetachRecursoPersonalFromSeccion(
		r.Context(),
		getPathParam(r, "seccionId"),
		getPathParam(r, "recursoPersonalId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal desacoplado de la sección")
}

func (h *Handler) ListTrabajoRecursosPersonales(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	items, err := h.svc.ListTrabajoRecursosPersonales(r.Context(), getPathParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) AttachRecursoPersonalToTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.AttachRecursoPersonalToTrabajo(
		r.Context(),
		getPathParam(r, "trabajoId"),
		getPathParam(r, "recursoPersonalId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal acoplado al trabajo")
}

func (h *Handler) DetachRecursoPersonalFromTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	err := h.svc.DetachRecursoPersonalFromTrabajo(
		r.Context(),
		getPathParam(r, "trabajoId"),
		getPathParam(r, "recursoPersonalId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, statusFromServiceErr(err), err.Error())
		return
	}
	shared.MessageOK(w, "Recurso personal desacoplado del trabajo")
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
	item, err := h.svc.GetModelo(r.Context(), getPathParam(r, "modeloId", "id"))
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
	item, err := h.svc.UpdateModelo(r.Context(), getPathParam(r, "modeloId", "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando modelo")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteModelo(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteModelo(r.Context(), getPathParam(r, "modeloId", "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando modelo")
		return
	}
	shared.MessageOK(w, "Modelo eliminado")
}

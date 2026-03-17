package bulkimport

import (
	"net/http"
	"strings"

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

// MapColumns handles AI-based column mapping for both admin and teacher.
func (h *Handler) MapColumns(w http.ResponseWriter, r *http.Request) {
	var req ColumnMappingRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	if len(req.Headers) == 0 {
		shared.Error(w, http.StatusBadRequest, "Se requieren encabezados de columnas")
		return
	}

	resp, err := h.svc.MapColumns(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error al mapear columnas: "+err.Error())
		return
	}

	shared.Success(w, resp)
}

// AdminBulkImport creates student accounts from mapped Excel data.
func (h *Handler) AdminBulkImport(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims.UserRole != "admin" && claims.UserRole != "super_admin" {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	var req AdminBulkImportRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	if len(req.Rows) == 0 {
		shared.Error(w, http.StatusBadRequest, "No hay filas para importar")
		return
	}

	resp, err := h.svc.AdminBulkImport(r.Context(), req, claims.Subject)
	if err != nil {
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "curso no encontrado") || strings.Contains(errMsg, "mapeo") || strings.Contains(errMsg, "filas") {
			shared.Error(w, http.StatusBadRequest, "Error en importación: "+err.Error())
			return
		}
		shared.Error(w, http.StatusInternalServerError, "Error en importación: "+err.Error())
		return
	}

	shared.Success(w, resp)
}

// TeacherBulkImport enrolls students in the teacher's course from mapped Excel data.
func (h *Handler) TeacherBulkImport(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	cursoID := chi.URLParam(r, "cursoId")

	if claims.UserRole != "teacher" && claims.UserRole != "admin" && claims.UserRole != "super_admin" {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	var req TeacherBulkImportRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	if len(req.Rows) == 0 {
		shared.Error(w, http.StatusBadRequest, "No hay filas para importar")
		return
	}

	resp, err := h.svc.TeacherBulkImport(r.Context(), req, cursoID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error en importación: "+err.Error())
		return
	}

	shared.Success(w, resp)
}

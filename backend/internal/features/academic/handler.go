package academic

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
// CURSOS
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListCursos(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListCursos(r.Context())
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando cursos")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetCurso(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetCurso(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Curso no encontrado")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateCurso(w http.ResponseWriter, r *http.Request) {
	var req CursoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateCurso(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateCurso(w http.ResponseWriter, r *http.Request) {
	var req CursoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateCurso(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando curso")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteCurso(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteCurso(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando curso")
		return
	}
	shared.MessageOK(w, "Curso eliminado")
}

// ═══════════════════════════════════════════════════════════════
// ESTUDIANTE-CURSO
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListEstudianteCursos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	estudianteID := r.URL.Query().Get("estudiante_id")
	if estudianteID == "" {
		estudianteID = claims.Subject
	}
	items, err := h.svc.ListEstudianteCursos(r.Context(), estudianteID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando inscripciones")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) EnrollStudent(w http.ResponseWriter, r *http.Request) {
	var req EstudianteCursoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.EnrollStudent(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UnenrollStudent(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.UnenrollStudent(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error desinscribiendo")
		return
	}
	shared.MessageOK(w, "Desinscrito exitosamente")
}

// ═══════════════════════════════════════════════════════════════
// MATERIAS
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListMaterias(w http.ResponseWriter, r *http.Request) {
	cursoID := chi.URLParam(r, "cursoId")
	items, err := h.svc.ListMaterias(r.Context(), cursoID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando materias")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetMateria(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetMateria(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Materia no encontrada")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateMateria(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req MateriaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateMateria(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateMateria(w http.ResponseWriter, r *http.Request) {
	var req MateriaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateMateria(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando materia")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteMateria(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteMateria(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando materia")
		return
	}
	shared.MessageOK(w, "Materia eliminada")
}

// ═══════════════════════════════════════════════════════════════
// UNIDADES
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListUnidades(w http.ResponseWriter, r *http.Request) {
	materiaID := chi.URLParam(r, "materiaId")
	items, err := h.svc.ListUnidades(r.Context(), materiaID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando unidades")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetUnidad(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetUnidad(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Unidad no encontrada")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateUnidad(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req UnidadRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateUnidad(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateUnidad(w http.ResponseWriter, r *http.Request) {
	var req UnidadRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateUnidad(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando unidad")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteUnidad(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteUnidad(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando unidad")
		return
	}
	shared.MessageOK(w, "Unidad eliminada")
}

// ═══════════════════════════════════════════════════════════════
// TEMAS
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListTemas(w http.ResponseWriter, r *http.Request) {
	unidadID := chi.URLParam(r, "unidadId")
	items, err := h.svc.ListTemas(r.Context(), unidadID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando temas")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetTema(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetTema(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Tema no encontrado")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateTema(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req TemaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateTema(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateTema(w http.ResponseWriter, r *http.Request) {
	var req TemaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateTema(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando tema")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteTema(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteTema(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando tema")
		return
	}
	shared.MessageOK(w, "Tema eliminado")
}

// ═══════════════════════════════════════════════════════════════
// LECCIONES
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListLecciones(w http.ResponseWriter, r *http.Request) {
	temaID := chi.URLParam(r, "temaId")
	items, err := h.svc.ListLecciones(r.Context(), temaID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando lecciones")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetLeccion(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.GetLeccion(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Lección no encontrada")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CreateLeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req LeccionRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateLeccion(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateLeccion(w http.ResponseWriter, r *http.Request) {
	var req LeccionRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateLeccion(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando lección")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteLeccion(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteLeccion(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando lección")
		return
	}
	shared.MessageOK(w, "Lección eliminada")
}

// ═══════════════════════════════════════════════════════════════
// SECCIONES
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListSecciones(w http.ResponseWriter, r *http.Request) {
	leccionID := chi.URLParam(r, "leccionId")
	items, err := h.svc.ListSecciones(r.Context(), leccionID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando secciones")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CreateSeccion(w http.ResponseWriter, r *http.Request) {
	var req LeccionSeccionRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateSeccion(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateSeccion(w http.ResponseWriter, r *http.Request) {
	var req LeccionSeccionRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateSeccion(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando sección")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteSeccion(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteSeccion(r.Context(), chi.URLParam(r, "id")); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando sección")
		return
	}
	shared.MessageOK(w, "Sección eliminada")
}

// ═══════════════════════════════════════════════════════════════
// SEGUIMIENTO
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListSeguimientos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListSeguimientos(r.Context(), claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando seguimientos")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) SeguirMateria(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	materiaID := chi.URLParam(r, "materiaId")
	item, err := h.svc.SeguirMateria(r.Context(), claims.Subject, materiaID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) DejarDeSeguirMateria(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	materiaID := chi.URLParam(r, "materiaId")
	if err := h.svc.DejarDeSeguirMateria(r.Context(), claims.Subject, materiaID); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error dejando de seguir")
		return
	}
	shared.MessageOK(w, "Dejaste de seguir la materia")
}

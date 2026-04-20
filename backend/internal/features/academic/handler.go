package academic

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	jwtpkg "github.com/arcanea/backend/internal/jwt"
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
	claims := middleware.GetClaims(r.Context())

	var items []Curso
	var err error

	if claims != nil && claims.UserRole == "teacher" {
		items, err = h.svc.ListCursosByTeacher(r.Context(), claims.Subject)
	} else {
		items, err = h.svc.ListCursos(r.Context())
	}

	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando cursos")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetCurso(w http.ResponseWriter, r *http.Request) {
	cursoID := getCursoIDFromURL(r)
	if cursoID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de curso inválido")
		return
	}

	item, err := h.svc.GetCurso(r.Context(), cursoID)
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
		if msg, ok := mapCursoError(err); ok {
			shared.Error(w, http.StatusBadRequest, msg)
			return
		}
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
	cursoID := getCursoIDFromURL(r)
	if cursoID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de curso inválido")
		return
	}

	item, err := h.svc.UpdateCurso(r.Context(), cursoID, req)
	if err != nil {
		if msg, ok := mapCursoError(err); ok {
			shared.Error(w, http.StatusBadRequest, msg)
			return
		}
		shared.Error(w, http.StatusInternalServerError, "Error actualizando curso")
		return
	}
	shared.Success(w, item)
}

func mapCursoError(err error) (string, bool) {
	if err == nil {
		return "", false
	}

	errMsg := strings.ToLower(err.Error())

	if strings.Contains(errMsg, "uq_curso_teacher") || (strings.Contains(errMsg, "teacher_id") && strings.Contains(errMsg, "unique")) {
		return "El profesor seleccionado ya está asignado a otro curso", true
	}

	if strings.Contains(errMsg, "curso_teacher_id_fkey") || (strings.Contains(errMsg, "teacher_id") && strings.Contains(errMsg, "foreign key")) {
		return "El profesor seleccionado no existe", true
	}

	if strings.Contains(errMsg, "internal.curso_nombre_key") || strings.Contains(errMsg, "column nombre") || strings.Contains(errMsg, "nombre") && strings.Contains(errMsg, "unique") {
		return "Ya existe un curso con ese nombre", true
	}

	return "", false
}

func (h *Handler) DeleteCurso(w http.ResponseWriter, r *http.Request) {
	cursoID := getCursoIDFromURL(r)
	if cursoID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de curso inválido")
		return
	}

	if err := h.svc.DeleteCurso(r.Context(), cursoID); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando curso")
		return
	}
	shared.MessageOK(w, "Curso eliminado")
}

func getCursoIDFromURL(r *http.Request) string {
	if id := strings.TrimSpace(chi.URLParam(r, "cursoId")); id != "" {
		return id
	}
	return strings.TrimSpace(chi.URLParam(r, "id"))
}

func getPathID(r *http.Request, keys ...string) string {
	for _, key := range keys {
		if id := strings.TrimSpace(chi.URLParam(r, key)); id != "" {
			return id
		}
	}
	return ""
}

// ═══════════════════════════════════════════════════════════════
// ESTUDIANTE-CURSO
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListEstudianteCursos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	cursoID := chi.URLParam(r, "cursoId")

	// Teachers can only list students from courses where they teach at least one materia.
	if claims.UserRole == "teacher" {
		ok, err := h.svc.IsTeacherAssignedToCurso(r.Context(), claims.Subject, cursoID)
		if err != nil {
			shared.Error(w, http.StatusInternalServerError, "Error validando permisos")
			return
		}
		if !ok {
			shared.Error(w, http.StatusForbidden, "No autorizado para este curso")
			return
		}
	}

	items, err := h.svc.ListEstudiantesByCurso(r.Context(), cursoID)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando inscripciones")
		return
	}
	shared.Success(w, items)
}

func (h *Handler) EnrollStudent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	cursoID := chi.URLParam(r, "cursoId")

	// Teachers can only enroll on courses where they teach at least one materia.
	if claims.UserRole == "teacher" {
		ok, err := h.svc.IsTeacherAssignedToCurso(r.Context(), claims.Subject, cursoID)
		if err != nil {
			shared.Error(w, http.StatusInternalServerError, "Error validando permisos")
			return
		}
		if !ok {
			shared.Error(w, http.StatusForbidden, "No autorizado para este curso")
			return
		}
	} else if claims.UserRole != "admin" && claims.UserRole != "super_admin" {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	var req EstudianteCursoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	req.CursoID = cursoID // always use URL param

	item, err := h.svc.EnrollStudent(r.Context(), req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UnenrollStudent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	cursoID := chi.URLParam(r, "cursoId")

	// Teachers can only unenroll on courses where they teach at least one materia.
	if claims.UserRole == "teacher" {
		ok, err := h.svc.IsTeacherAssignedToCurso(r.Context(), claims.Subject, cursoID)
		if err != nil {
			shared.Error(w, http.StatusInternalServerError, "Error validando permisos")
			return
		}
		if !ok {
			shared.Error(w, http.StatusForbidden, "No autorizado para este curso")
			return
		}
	} else if claims.UserRole != "admin" && claims.UserRole != "super_admin" {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	if err := h.svc.UnenrollStudent(r.Context(), chi.URLParam(r, "estudianteId")); err != nil {
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
	anioEscolar := strings.TrimSpace(r.URL.Query().Get("anio_escolar"))
	var anioPtr *string
	if anioEscolar != "" {
		anioPtr = &anioEscolar
	}

	items, err := h.svc.ListMaterias(r.Context(), cursoID, anioPtr)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) GetMateria(w http.ResponseWriter, r *http.Request) {
	materiaID := getPathID(r, "materiaId", "id")
	if materiaID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de materia inválido")
		return
	}

	item, err := h.svc.GetMateria(r.Context(), materiaID)
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
	materiaID := getPathID(r, "materiaId", "id")
	if materiaID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de materia inválido")
		return
	}

	item, err := h.svc.UpdateMateria(r.Context(), materiaID, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando materia")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteMateria(w http.ResponseWriter, r *http.Request) {
	materiaID := getPathID(r, "materiaId", "id")
	if materiaID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de materia inválido")
		return
	}

	if err := h.svc.DeleteMateria(r.Context(), materiaID); err != nil {
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
	unidadID := getPathID(r, "unidadId", "id")
	if unidadID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de unidad inválido")
		return
	}

	item, err := h.svc.GetUnidad(r.Context(), unidadID)
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
	unidadID := getPathID(r, "unidadId", "id")
	if unidadID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de unidad inválido")
		return
	}

	item, err := h.svc.UpdateUnidad(r.Context(), unidadID, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando unidad")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteUnidad(w http.ResponseWriter, r *http.Request) {
	unidadID := getPathID(r, "unidadId", "id")
	if unidadID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de unidad inválido")
		return
	}

	if err := h.svc.DeleteUnidad(r.Context(), unidadID); err != nil {
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
	temaID := getPathID(r, "temaId", "id")
	if temaID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de tema inválido")
		return
	}

	item, err := h.svc.GetTema(r.Context(), temaID)
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
	temaID := getPathID(r, "temaId", "id")
	if temaID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de tema inválido")
		return
	}

	item, err := h.svc.UpdateTema(r.Context(), temaID, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando tema")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteTema(w http.ResponseWriter, r *http.Request) {
	temaID := getPathID(r, "temaId", "id")
	if temaID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de tema inválido")
		return
	}

	if err := h.svc.DeleteTema(r.Context(), temaID); err != nil {
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

func (h *Handler) ListRecentLecciones(w http.ResponseWriter, r *http.Request) {
	limit := 6
	rawLimit := strings.TrimSpace(r.URL.Query().Get("limit"))
	if rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 {
			shared.Error(w, http.StatusBadRequest, "limit inválido")
			return
		}
		if parsed > 20 {
			parsed = 20
		}
		limit = parsed
	}

	claims := middleware.GetClaims(r.Context())
	userID := ""
	if claims != nil {
		userID = strings.TrimSpace(claims.Subject)
	}

	items, err := h.svc.ListRecentLecciones(r.Context(), userID, limit)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error listando lecciones recientes")
		return
	}

	shared.Success(w, items)
}

func (h *Handler) GetLeccion(w http.ResponseWriter, r *http.Request) {
	leccionID := getPathID(r, "leccionId", "id")
	if leccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de lección inválido")
		return
	}

	item, err := h.svc.GetLeccion(r.Context(), leccionID)
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
	leccionID := getPathID(r, "leccionId", "id")
	if leccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de lección inválido")
		return
	}

	item, err := h.svc.UpdateLeccion(r.Context(), leccionID, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando lección")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteLeccion(w http.ResponseWriter, r *http.Request) {
	leccionID := getPathID(r, "leccionId", "id")
	if leccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de lección inválido")
		return
	}

	if err := h.svc.DeleteLeccion(r.Context(), leccionID); err != nil {
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
	seccionID := getPathID(r, "seccionId", "id")
	if seccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de sección inválido")
		return
	}

	item, err := h.svc.UpdateSeccion(r.Context(), seccionID, req)
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error actualizando sección")
		return
	}
	shared.Success(w, item)
}

func (h *Handler) PatchSeccionLifecycle(w http.ResponseWriter, r *http.Request) {
	seccionID := getPathID(r, "seccionId", "id")
	if seccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de sección inválido")
		return
	}

	var req LeccionSeccionLifecyclePatchRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.PatchSeccionLifecycle(r.Context(), seccionID, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	shared.Success(w, item)
}

func (h *Handler) DeleteSeccion(w http.ResponseWriter, r *http.Request) {
	seccionID := getPathID(r, "seccionId", "id")
	if seccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de sección inválido")
		return
	}

	if err := h.svc.DeleteSeccion(r.Context(), seccionID); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando sección")
		return
	}
	shared.MessageOK(w, "Sección eliminada")
}

// ═══════════════════════════════════════════════════════════════
// FOROS
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListForosByLeccion(w http.ResponseWriter, r *http.Request) {
	leccionID := chi.URLParam(r, "leccionId")
	items, err := h.svc.ListForosByLeccion(r.Context(), leccionID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CreateForo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ForoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateForo(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) UpdateForo(w http.ResponseWriter, r *http.Request) {
	foroID := getPathID(r, "foroId", "id")
	if foroID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de foro inválido")
		return
	}
	var req ForoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateForo(r.Context(), foroID, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteForo(w http.ResponseWriter, r *http.Request) {
	foroID := getPathID(r, "foroId", "id")
	if foroID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de foro inválido")
		return
	}
	if err := h.svc.DeleteForo(r.Context(), foroID); err != nil {
		shared.Error(w, http.StatusInternalServerError, "Error eliminando foro")
		return
	}
	shared.MessageOK(w, "Foro eliminado")
}

func (h *Handler) ListForoHilos(w http.ResponseWriter, r *http.Request) {
	foroID := getPathID(r, "foroId", "id")
	items, err := h.svc.ListForoHilos(r.Context(), foroID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CreateForoHilo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	foroID := getPathID(r, "foroId", "id")
	var req ForoHiloRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateForoHilo(r.Context(), foroID, req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) ListForoMensajes(w http.ResponseWriter, r *http.Request) {
	hiloID := getPathID(r, "hiloId", "id")
	items, err := h.svc.ListForoMensajes(r.Context(), hiloID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CreateForoMensaje(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	hiloID := getPathID(r, "hiloId", "id")
	var req ForoMensajeRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateForoMensaje(r.Context(), hiloID, req, claims.Subject)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

// ═══════════════════════════════════════════════════════════════
// VIDEO PROGRESO
// ═══════════════════════════════════════════════════════════════

func (h *Handler) UpsertVideoProgreso(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req UpsertVideoProgresoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpsertVideoProgreso(r.Context(), claims.Subject, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListVideoProgresoByLeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	leccionID := chi.URLParam(r, "leccionId")
	items, err := h.svc.ListVideoProgresoByLeccion(r.Context(), claims.Subject, leccionID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

// ═══════════════════════════════════════════════════════════════
// GATING PDF
// ═══════════════════════════════════════════════════════════════

func (h *Handler) UpsertSeccionGatingPDF(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	seccionID := getPathID(r, "seccionId", "id")
	if seccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de sección inválido")
		return
	}
	var req UpsertSeccionGatingPDFRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpsertSeccionGatingPDF(r.Context(), seccionID, claims.Subject, req)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetSeccionGatingPDF(w http.ResponseWriter, r *http.Request) {
	seccionID := getPathID(r, "seccionId", "id")
	if seccionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de sección inválido")
		return
	}
	item, err := h.svc.GetSeccionGatingPDF(r.Context(), seccionID)
	if err != nil {
		shared.Error(w, http.StatusNotFound, "Configuración de gating no encontrada")
		return
	}
	shared.Success(w, item)
}

// ═══════════════════════════════════════════════════════════════
// DOCENTE-MATERIA + HORARIOS
// ═══════════════════════════════════════════════════════════════

func (h *Handler) ListMisCursosDocente(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	docenteID, ok := resolveDocenteTarget(claims, r)
	if !ok {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	items, err := h.svc.ListMisCursosDocente(r.Context(), docenteID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) ListHorariosDocente(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	docenteID, ok := resolveDocenteTarget(claims, r)
	if !ok {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	items, err := h.svc.ListHorariosDocente(r.Context(), docenteID)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) ListDocenteMateriaAsignaciones(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil || !isAdminRole(claims.UserRole) {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	filter := DocenteMateriaAsignacionFilter{SoloActivas: true}

	if raw := strings.TrimSpace(r.URL.Query().Get("solo_activas")); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			shared.Error(w, http.StatusBadRequest, "solo_activas inválido")
			return
		}
		filter.SoloActivas = parsed
	}

	if value := strings.TrimSpace(r.URL.Query().Get("docente_id")); value != "" {
		filter.DocenteID = &value
	}
	if value := strings.TrimSpace(r.URL.Query().Get("curso_id")); value != "" {
		filter.CursoID = &value
	}
	if value := strings.TrimSpace(r.URL.Query().Get("materia_id")); value != "" {
		filter.MateriaID = &value
	}
	if value := strings.TrimSpace(r.URL.Query().Get("anio_escolar")); value != "" {
		filter.AnioEscolar = &value
	}

	items, err := h.svc.ListDocenteMateriaAsignaciones(r.Context(), filter)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) CreateDocenteMateriaAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil || !isAdminRole(claims.UserRole) {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	var req DocenteMateriaAsignacionCreateRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.CreateDocenteMateriaAsignacion(r.Context(), req, claims.Subject)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) AsignarMaestrosCursoAnio(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil || !isAdminRole(claims.UserRole) {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	cursoID := getPathID(r, "cursoId", "id")
	if cursoID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de curso inválido")
		return
	}

	var req CursoAnioAsignarMaestrosRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	result, err := h.svc.AsignarMaestrosCursoAnio(r.Context(), cursoID, req, claims.Subject)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}

	shared.Success(w, result)
}

func (h *Handler) UpdateDocenteMateriaAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil || !isAdminRole(claims.UserRole) {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	asignacionID := getPathID(r, "asignacionId", "id")
	if asignacionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de asignación inválido")
		return
	}

	var req DocenteMateriaAsignacionUpdateRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.UpdateDocenteMateriaAsignacion(r.Context(), asignacionID, req)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteDocenteMateriaAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil || !isAdminRole(claims.UserRole) {
		shared.Error(w, http.StatusForbidden, "No autorizado")
		return
	}

	asignacionID := getPathID(r, "asignacionId", "id")
	if asignacionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de asignación inválido")
		return
	}

	if err := h.svc.DeleteDocenteMateriaAsignacion(r.Context(), asignacionID); err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}

	shared.MessageOK(w, "Asignación eliminada")
}

func (h *Handler) ListHorariosByAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	asignacionID := getPathID(r, "asignacionId", "id")
	if asignacionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de asignación inválido")
		return
	}

	items, err := h.svc.ListHorariosByAsignacion(r.Context(), claims.UserRole, claims.Subject, asignacionID)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}

	shared.Success(w, items)
}

func (h *Handler) CreateHorarioAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	asignacionID := getPathID(r, "asignacionId", "id")
	if asignacionID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de asignación inválido")
		return
	}

	var req DocenteMateriaHorarioRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.CreateHorarioAsignacion(r.Context(), claims.UserRole, claims.Subject, asignacionID, req)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}

	shared.Created(w, item)
}

func (h *Handler) UpdateHorarioAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	horarioID := getPathID(r, "horarioId", "id")
	if horarioID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de horario inválido")
		return
	}

	var req DocenteMateriaHorarioUpdateRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}

	item, err := h.svc.UpdateHorarioAsignacion(r.Context(), claims.UserRole, claims.Subject, horarioID, req)
	if err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}

	shared.Success(w, item)
}

func (h *Handler) DeleteHorarioAsignacion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if claims == nil {
		shared.Error(w, http.StatusUnauthorized, "No autenticado")
		return
	}

	horarioID := getPathID(r, "horarioId", "id")
	if horarioID == "" {
		shared.Error(w, http.StatusBadRequest, "ID de horario inválido")
		return
	}

	if err := h.svc.DeleteHorarioAsignacion(r.Context(), claims.UserRole, claims.Subject, horarioID); err != nil {
		shared.Error(w, mapAcademicStatus(err), err.Error())
		return
	}

	shared.MessageOK(w, "Horario eliminado")
}

func resolveDocenteTarget(claims *jwtpkg.Claims, r *http.Request) (string, bool) {
	if claims == nil {
		return "", false
	}
	if claims.UserRole == "teacher" {
		return strings.TrimSpace(claims.Subject), true
	}
	if isAdminRole(claims.UserRole) {
		docenteID := strings.TrimSpace(r.URL.Query().Get("docente_id"))
		if docenteID == "" {
			return "", false
		}
		return docenteID, true
	}
	return "", false
}

func isAdminRole(role string) bool {
	return role == "admin" || role == "super_admin"
}

func mapAcademicStatus(err error) int {
	if err == nil {
		return http.StatusOK
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "record not found") {
		return http.StatusNotFound
	}
	if strings.Contains(msg, "no autorizado") {
		return http.StatusForbidden
	}
	if strings.Contains(msg, "conflicto horario") {
		return http.StatusConflict
	}
	return http.StatusBadRequest
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

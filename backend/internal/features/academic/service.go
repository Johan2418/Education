package academic

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

type Service struct {
	repo *Repository
}

const (
	defaultPesoContenidosPct       = 35.0
	defaultPesoLeccionesPct        = 35.0
	defaultPesoTrabajosPct         = 30.0
	defaultPuntajeTotal            = 10.0
	defaultPuntajeMinimoAprobacion = 6.0
)

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ─── Curso ──────────────────────────────────────────────────

func (s *Service) ListCursos(ctx context.Context) ([]Curso, error) {
	return s.repo.ListCursos(ctx)
}

func (s *Service) ListCursosByTeacher(ctx context.Context, teacherID string) ([]Curso, error) {
	return s.repo.ListCursosByTeacher(ctx, teacherID)
}

func (s *Service) GetCurso(ctx context.Context, id string) (*Curso, error) {
	return s.repo.GetCurso(ctx, id)
}

func (s *Service) CreateCurso(ctx context.Context, req CursoRequest) (*Curso, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	return s.repo.CreateCurso(ctx, req)
}

func (s *Service) UpdateCurso(ctx context.Context, id string, req CursoRequest) (*Curso, error) {
	return s.repo.UpdateCurso(ctx, id, req)
}

func (s *Service) DeleteCurso(ctx context.Context, id string) error {
	return s.repo.DeleteCurso(ctx, id)
}

// ─── Estudiante-Curso ───────────────────────────────────────

func (s *Service) ListEstudianteCursos(ctx context.Context, estudianteID string) ([]EstudianteCurso, error) {
	return s.repo.ListEstudianteCursos(ctx, estudianteID)
}

func (s *Service) ListEstudiantesByCurso(ctx context.Context, cursoID string) ([]EstudianteCursoDetail, error) {
	return s.repo.ListEstudiantesByCurso(ctx, cursoID)
}

func (s *Service) EnrollStudent(ctx context.Context, req EstudianteCursoRequest) (*EstudianteCurso, error) {
	req.EstudianteID = strings.TrimSpace(req.EstudianteID)
	req.CursoID = strings.TrimSpace(req.CursoID)
	if req.EstudianteID == "" {
		return nil, errRequired("estudiante_id")
	}
	if req.CursoID == "" {
		return nil, errRequired("curso_id")
	}

	if req.AnioEscolar != nil && strings.TrimSpace(*req.AnioEscolar) != "" {
		normalized, err := normalizeAnioEscolar(*req.AnioEscolar)
		if err != nil {
			return nil, err
		}
		req.AnioEscolar = &normalized
	} else {
		activeYear, err := s.repo.GetAnioEscolarActivo(ctx)
		if err != nil {
			return nil, err
		}
		activeYear = strings.TrimSpace(activeYear)
		req.AnioEscolar = &activeYear
	}

	return s.repo.EnrollStudent(ctx, req)
}

func (s *Service) UnenrollStudent(ctx context.Context, id string) error {
	return s.repo.UnenrollStudent(ctx, id)
}

// ─── Materia ────────────────────────────────────────────────

func (s *Service) ListMaterias(ctx context.Context, cursoID string, anioEscolar *string) ([]Materia, error) {
	cursoID = strings.TrimSpace(cursoID)
	if cursoID == "" {
		return nil, errRequired("curso_id")
	}

	if anioEscolar != nil && strings.TrimSpace(*anioEscolar) != "" {
		normalized, err := normalizeAnioEscolar(*anioEscolar)
		if err != nil {
			return nil, err
		}
		return s.repo.ListMaterias(ctx, cursoID, &normalized)
	}

	activeYear, err := s.repo.GetAnioEscolarActivo(ctx)
	if err != nil {
		return nil, err
	}
	activeYear = strings.TrimSpace(activeYear)
	if activeYear == "" {
		return s.repo.ListMaterias(ctx, cursoID, nil)
	}

	return s.repo.ListMaterias(ctx, cursoID, &activeYear)
}

func (s *Service) ListMateriasByEstudiante(ctx context.Context, estudianteID string) ([]Materia, error) {
	estudianteID = strings.TrimSpace(estudianteID)
	if estudianteID == "" {
		return nil, errRequired("estudiante_id")
	}
	return s.repo.ListMateriasByEstudiante(ctx, estudianteID)
}

func (s *Service) GetMateria(ctx context.Context, id string) (*Materia, error) {
	return s.repo.GetMateria(ctx, id)
}

func (s *Service) CreateMateria(ctx context.Context, req MateriaRequest, createdBy string) (*Materia, error) {
	req.Nombre = strings.TrimSpace(req.Nombre)
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	req.CursoID = strings.TrimSpace(req.CursoID)
	if req.CursoID == "" {
		return nil, errRequired("curso_id")
	}

	if req.AnioEscolar != nil && strings.TrimSpace(*req.AnioEscolar) != "" {
		normalized, err := normalizeAnioEscolar(*req.AnioEscolar)
		if err != nil {
			return nil, err
		}
		req.AnioEscolar = &normalized
	} else {
		activeYear, err := s.repo.GetAnioEscolarActivo(ctx)
		if err != nil {
			return nil, err
		}
		activeYear = strings.TrimSpace(activeYear)
		req.AnioEscolar = &activeYear
	}

	if err := applyMateriaConfigDefaultsForCreate(&req); err != nil {
		return nil, err
	}

	return s.repo.CreateMateria(ctx, req, createdBy)
}

func (s *Service) UpdateMateria(ctx context.Context, id string, req MateriaRequest) (*Materia, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, errRequired("materia_id")
	}

	if req.AnioEscolar != nil && strings.TrimSpace(*req.AnioEscolar) != "" {
		normalized, err := normalizeAnioEscolar(*req.AnioEscolar)
		if err != nil {
			return nil, err
		}
		req.AnioEscolar = &normalized
	}

	current, err := s.repo.GetMateria(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := applyMateriaConfigDefaultsForUpdate(current, &req); err != nil {
		return nil, err
	}

	return s.repo.UpdateMateria(ctx, id, req)
}

func (s *Service) DeleteMateria(ctx context.Context, id string) error {
	return s.repo.DeleteMateria(ctx, id)
}

func (s *Service) GetMateriaCalificaciones(ctx context.Context, materiaID, actorID, actorRole string) (*MateriaCalificacionesResponse, error) {
	materiaID = strings.TrimSpace(materiaID)
	if materiaID == "" {
		return nil, errRequired("materia_id")
	}

	switch actorRole {
	case "admin", "super_admin":
		// autorizado
	case "teacher":
		ok, err := s.repo.IsTeacherAssignedToMateria(ctx, strings.TrimSpace(actorID), materiaID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta materia")
		}
	default:
		return nil, errors.New("no autorizado")
	}

	materia, err := s.repo.GetMateria(ctx, materiaID)
	if err != nil {
		return nil, err
	}

	rows, err := s.repo.ListMateriaCalificacionBaseRows(ctx, materiaID)
	if err != nil {
		return nil, err
	}

	items := make([]MateriaCalificacionAlumno, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildMateriaCalificacionAlumno(*materia, row))
	}

	return &MateriaCalificacionesResponse{
		MateriaID:               materia.ID,
		MateriaNombre:           materia.Nombre,
		CursoID:                 materia.CursoID,
		AnioEscolar:             materia.AnioEscolar,
		PesoContenidosPct:       materia.PesoContenidosPct,
		PesoLeccionesPct:        materia.PesoLeccionesPct,
		PesoTrabajosPct:         materia.PesoTrabajosPct,
		PuntajeTotal:            materia.PuntajeTotal,
		PuntajeMinimoAprobacion: materia.PuntajeMinimoAprobacion,
		Items:                   items,
	}, nil
}

func (s *Service) ListMisCalificacionesMateriasEstudiante(ctx context.Context, estudianteID string) ([]MateriaCalificacionEstudianteResponse, error) {
	estudianteID = strings.TrimSpace(estudianteID)
	if estudianteID == "" {
		return nil, errRequired("estudiante_id")
	}

	materias, err := s.repo.ListMateriasByEstudiante(ctx, estudianteID)
	if err != nil {
		return nil, err
	}

	items := make([]MateriaCalificacionEstudianteResponse, 0, len(materias))
	for _, materia := range materias {
		row, err := s.repo.GetMateriaCalificacionBaseRow(ctx, materia.ID, estudianteID)
		if err != nil {
			return nil, err
		}

		base := materiaCalificacionBaseRow{
			EstudianteID: estudianteID,
		}
		if row != nil {
			base = *row
		}

		calculo := buildMateriaCalificacionAlumno(materia, base)
		items = append(items, MateriaCalificacionEstudianteResponse{
			MateriaID:               materia.ID,
			MateriaNombre:           materia.Nombre,
			CursoID:                 materia.CursoID,
			AnioEscolar:             materia.AnioEscolar,
			PesoContenidosPct:       materia.PesoContenidosPct,
			PesoLeccionesPct:        materia.PesoLeccionesPct,
			PesoTrabajosPct:         materia.PesoTrabajosPct,
			PuntajeTotal:            materia.PuntajeTotal,
			PuntajeMinimoAprobacion: materia.PuntajeMinimoAprobacion,
			PromedioContenidos10:    calculo.PromedioContenidos10,
			PromedioLecciones10:     calculo.PromedioLecciones10,
			PromedioTrabajos10:      calculo.PromedioTrabajos10,
			PuntosContenidos:        calculo.PuntosContenidos,
			PuntosLecciones:         calculo.PuntosLecciones,
			PuntosTrabajos:          calculo.PuntosTrabajos,
			NotaFinal:               calculo.NotaFinal,
			EstadoFinal:             calculo.EstadoFinal,
			CumpleMinimo:            calculo.CumpleMinimo,
			ComponentesCompletos:    calculo.ComponentesCompletos,
			ComponentesCalificados:  calculo.ComponentesCalificados,
			ComponentesRequeridos:   calculo.ComponentesRequeridos,
		})
	}

	return items, nil
}

// ─── Unidad ─────────────────────────────────────────────────

func (s *Service) ListUnidades(ctx context.Context, materiaID string) ([]Unidad, error) {
	return s.repo.ListUnidades(ctx, materiaID)
}

func (s *Service) GetUnidad(ctx context.Context, id string) (*Unidad, error) {
	return s.repo.GetUnidad(ctx, id)
}

func (s *Service) CreateUnidad(ctx context.Context, req UnidadRequest, createdBy string) (*Unidad, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	return s.repo.CreateUnidad(ctx, req, createdBy)
}

func (s *Service) UpdateUnidad(ctx context.Context, id string, req UnidadRequest) (*Unidad, error) {
	return s.repo.UpdateUnidad(ctx, id, req)
}

func (s *Service) DeleteUnidad(ctx context.Context, id string) error {
	return s.repo.DeleteUnidad(ctx, id)
}

// ─── Tema ───────────────────────────────────────────────────

func (s *Service) ListTemas(ctx context.Context, unidadID string) ([]Tema, error) {
	return s.repo.ListTemas(ctx, unidadID)
}

func (s *Service) GetTema(ctx context.Context, id string) (*Tema, error) {
	return s.repo.GetTema(ctx, id)
}

func (s *Service) CreateTema(ctx context.Context, req TemaRequest, createdBy string) (*Tema, error) {
	if req.Nombre == "" {
		return nil, errRequired("nombre")
	}
	usarSolo := true
	if req.UsarSoloCalificacionLeccion != nil {
		usarSolo = *req.UsarSoloCalificacionLeccion
	}
	pesoLeccion := 100.0
	if req.PesoCalificacionLeccion != nil {
		pesoLeccion = *req.PesoCalificacionLeccion
	}
	pesoContenido := 0.0
	if req.PesoCalificacionContenido != nil {
		pesoContenido = *req.PesoCalificacionContenido
	}
	puntajeMinimo := 60.0
	if req.PuntajeMinimoAprobacion != nil {
		puntajeMinimo = *req.PuntajeMinimoAprobacion
	}
	if err := validateTemaCalificacionConfig(usarSolo, pesoLeccion, pesoContenido, puntajeMinimo); err != nil {
		return nil, err
	}
	if usarSolo {
		pesoLeccion = 100
		pesoContenido = 0
	}
	req.UsarSoloCalificacionLeccion = &usarSolo
	req.PesoCalificacionLeccion = &pesoLeccion
	req.PesoCalificacionContenido = &pesoContenido
	req.PuntajeMinimoAprobacion = &puntajeMinimo
	return s.repo.CreateTema(ctx, req, createdBy)
}

func (s *Service) UpdateTema(ctx context.Context, id string, req TemaRequest) (*Tema, error) {
	existing, err := s.repo.GetTema(ctx, id)
	if err != nil {
		return nil, err
	}

	usarSolo := existing.UsarSoloCalificacionLeccion
	if req.UsarSoloCalificacionLeccion != nil {
		usarSolo = *req.UsarSoloCalificacionLeccion
	}
	pesoLeccion := existing.PesoCalificacionLeccion
	if req.PesoCalificacionLeccion != nil {
		pesoLeccion = *req.PesoCalificacionLeccion
	}
	pesoContenido := existing.PesoCalificacionContenido
	if req.PesoCalificacionContenido != nil {
		pesoContenido = *req.PesoCalificacionContenido
	}
	puntajeMinimo := existing.PuntajeMinimoAprobacion
	if req.PuntajeMinimoAprobacion != nil {
		puntajeMinimo = *req.PuntajeMinimoAprobacion
	}
	if err := validateTemaCalificacionConfig(usarSolo, pesoLeccion, pesoContenido, puntajeMinimo); err != nil {
		return nil, err
	}
	if usarSolo {
		pesoLeccion = 100
		pesoContenido = 0
	}
	req.UsarSoloCalificacionLeccion = &usarSolo
	req.PesoCalificacionLeccion = &pesoLeccion
	req.PesoCalificacionContenido = &pesoContenido
	req.PuntajeMinimoAprobacion = &puntajeMinimo
	return s.repo.UpdateTema(ctx, id, req)
}

func (s *Service) DeleteTema(ctx context.Context, id string) error {
	return s.repo.DeleteTema(ctx, id)
}

// ─── Lección ────────────────────────────────────────────────

func (s *Service) ListLecciones(ctx context.Context, temaID string) ([]Leccion, error) {
	return s.repo.ListLecciones(ctx, temaID)
}

func (s *Service) ListRecentLecciones(ctx context.Context, userID string, limit int) ([]Leccion, error) {
	if limit <= 0 {
		limit = 6
	}

	if userID != "" {
		items, err := s.repo.ListRecentLeccionesByUser(ctx, userID, limit)
		if err != nil {
			return nil, err
		}
		if len(items) > 0 {
			return items, nil
		}
	}

	return s.repo.ListLatestLecciones(ctx, limit)
}

func (s *Service) ListRecentContenido(ctx context.Context, userRole, userID string, limit int) ([]ContenidoReciente, error) {
	if limit <= 0 {
		limit = 6
	}
	role := strings.ToLower(strings.TrimSpace(userRole))

	switch role {
	case "student":
		return s.repo.ListRecentContenidoForStudent(ctx, userID, limit)
	case "teacher":
		return s.repo.ListRecentContenidoForTeacher(ctx, limit)
	case "admin", "super_admin":
		return s.repo.ListRecentContenidoGlobal(ctx, limit)
	default:
		return []ContenidoReciente{}, nil
	}
}

func (s *Service) GetLeccion(ctx context.Context, id string) (*Leccion, error) {
	return s.repo.GetLeccion(ctx, id)
}

func (s *Service) CreateLeccion(ctx context.Context, req LeccionRequest, createdBy string) (*Leccion, error) {
	if req.Titulo == "" {
		return nil, errRequired("titulo")
	}
	return s.repo.CreateLeccion(ctx, req, createdBy)
}

func (s *Service) UpdateLeccion(ctx context.Context, id string, req LeccionRequest) (*Leccion, error) {
	return s.repo.UpdateLeccion(ctx, id, req)
}

func (s *Service) DeleteLeccion(ctx context.Context, id string) error {
	return s.repo.DeleteLeccion(ctx, id)
}

// ─── Secciones ──────────────────────────────────────────────

func (s *Service) ListSecciones(ctx context.Context, leccionID string) ([]LeccionSeccion, error) {
	return s.repo.ListSecciones(ctx, leccionID)
}

func (s *Service) CreateSeccion(ctx context.Context, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	if err := validateCalificacionSeccion(req); err != nil {
		return nil, err
	}
	return s.repo.CreateSeccion(ctx, req)
}

func (s *Service) UpdateSeccion(ctx context.Context, id string, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	if err := validateCalificacionSeccion(req); err != nil {
		return nil, err
	}
	return s.repo.UpdateSeccion(ctx, id, req)
}

func (s *Service) PatchSeccionLifecycle(ctx context.Context, id string, req LeccionSeccionLifecyclePatchRequest) (*LeccionSeccion, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errRequired("seccion_id")
	}

	current, err := s.repo.GetSeccion(ctx, id)
	if err != nil {
		return nil, err
	}

	if err := validateSeccionLifecyclePatch(current, req); err != nil {
		return nil, err
	}

	return s.repo.PatchSeccionLifecycle(ctx, id, req)
}

func (s *Service) DeleteSeccion(ctx context.Context, id string) error {
	return s.repo.DeleteSeccion(ctx, id)
}

// ─── Foros ──────────────────────────────────────────────────

func (s *Service) ListForosByLeccion(ctx context.Context, leccionID string) ([]Foro, error) {
	if strings.TrimSpace(leccionID) == "" {
		return nil, errRequired("leccion_id")
	}
	return s.repo.ListForosByLeccion(ctx, leccionID)
}

func (s *Service) CreateForo(ctx context.Context, req ForoRequest, createdBy string) (*Foro, error) {
	if strings.TrimSpace(req.LeccionID) == "" {
		return nil, errRequired("leccion_id")
	}
	if strings.TrimSpace(req.Titulo) == "" {
		return nil, errRequired("titulo")
	}
	return s.repo.CreateForo(ctx, req, createdBy)
}

func (s *Service) UpdateForo(ctx context.Context, id string, req ForoRequest) (*Foro, error) {
	if req.Titulo != "" && strings.TrimSpace(req.Titulo) == "" {
		return nil, errRequired("titulo")
	}
	return s.repo.UpdateForo(ctx, id, req)
}

func (s *Service) DeleteForo(ctx context.Context, id string) error {
	return s.repo.DeleteForo(ctx, id)
}

func (s *Service) ListForoHilos(ctx context.Context, foroID string) ([]ForoHilo, error) {
	if strings.TrimSpace(foroID) == "" {
		return nil, errRequired("foro_id")
	}
	return s.repo.ListForoHilos(ctx, foroID)
}

func (s *Service) CreateForoHilo(ctx context.Context, foroID string, req ForoHiloRequest, createdBy string) (*ForoHilo, error) {
	if strings.TrimSpace(foroID) == "" {
		return nil, errRequired("foro_id")
	}
	if strings.TrimSpace(req.Titulo) == "" {
		return nil, errRequired("titulo")
	}
	if !hasForoPayload(req.Contenido, req.ImagenURL) {
		return nil, errors.New("contenido o imagen_url es requerido")
	}
	return s.repo.CreateForoHilo(ctx, foroID, req, createdBy)
}

func (s *Service) ListForoMensajes(ctx context.Context, hiloID string) ([]ForoMensaje, error) {
	if strings.TrimSpace(hiloID) == "" {
		return nil, errRequired("hilo_id")
	}
	return s.repo.ListForoMensajes(ctx, hiloID)
}

func (s *Service) CreateForoMensaje(ctx context.Context, hiloID string, req ForoMensajeRequest, createdBy string) (*ForoMensaje, error) {
	if strings.TrimSpace(hiloID) == "" {
		return nil, errRequired("hilo_id")
	}
	if !hasForoPayload(req.Contenido, req.ImagenURL) {
		return nil, errors.New("contenido o imagen_url es requerido")
	}
	return s.repo.CreateForoMensaje(ctx, hiloID, req, createdBy)
}

// ─── Video progreso ────────────────────────────────────────

func (s *Service) UpsertVideoProgreso(ctx context.Context, userID string, req UpsertVideoProgresoRequest) (*LeccionVideoProgreso, error) {
	if strings.TrimSpace(req.LeccionSeccionID) == "" {
		return nil, errRequired("leccion_seccion_id")
	}
	if strings.TrimSpace(req.YouTubeVideoID) == "" {
		return nil, errRequired("youtube_video_id")
	}
	if req.WatchedSeconds != nil && *req.WatchedSeconds < 0 {
		return nil, errors.New("watched_seconds debe ser >= 0")
	}
	if req.TotalSeconds != nil && *req.TotalSeconds < 0 {
		return nil, errors.New("total_seconds debe ser >= 0")
	}

	porcentaje := 0.0
	if req.PorcentajeVisto != nil {
		porcentaje = *req.PorcentajeVisto
	} else if req.TotalSeconds != nil && *req.TotalSeconds > 0 && req.WatchedSeconds != nil {
		porcentaje = (float64(*req.WatchedSeconds) / float64(*req.TotalSeconds)) * 100
	}
	if porcentaje < 0 || porcentaje > 100 {
		return nil, errors.New("porcentaje_visto debe estar entre 0 y 100")
	}
	req.PorcentajeVisto = &porcentaje

	completado := porcentaje >= 90
	return s.repo.UpsertVideoProgreso(ctx, userID, req, completado)
}

func (s *Service) ListVideoProgresoByLeccion(ctx context.Context, userID, leccionID string) ([]LeccionVideoProgreso, error) {
	if strings.TrimSpace(leccionID) == "" {
		return nil, errRequired("leccion_id")
	}
	return s.repo.ListVideoProgresoByLeccion(ctx, userID, leccionID)
}

// ─── Gating PDF ─────────────────────────────────────────────

func (s *Service) UpsertSeccionGatingPDF(ctx context.Context, seccionID, actorID string, req UpsertSeccionGatingPDFRequest) (*LeccionSeccionGatingPDF, error) {
	if strings.TrimSpace(seccionID) == "" {
		return nil, errRequired("seccion_id")
	}
	if req.PuntajeMinimo != nil && (*req.PuntajeMinimo < 0 || *req.PuntajeMinimo > 100) {
		return nil, errors.New("puntaje_minimo debe estar entre 0 y 100")
	}
	if req.CheckpointSegundos != nil && *req.CheckpointSegundos <= 0 {
		return nil, errors.New("checkpoint_segundos debe ser mayor a 0")
	}
	if req.Habilitado != nil && *req.Habilitado && req.SeccionPreguntasID == nil {
		return nil, errors.New("seccion_preguntas_id es requerido cuando habilitado=true")
	}
	return s.repo.UpsertSeccionGatingPDF(ctx, seccionID, actorID, req)
}

func (s *Service) GetSeccionGatingPDF(ctx context.Context, seccionID string) (*LeccionSeccionGatingPDF, error) {
	if strings.TrimSpace(seccionID) == "" {
		return nil, errRequired("seccion_id")
	}
	return s.repo.GetSeccionGatingPDF(ctx, seccionID)
}

// ─── Seguimiento ────────────────────────────────────────────

func (s *Service) ListSeguimientos(ctx context.Context, usuarioID string) ([]MateriaSeguimiento, error) {
	return s.repo.ListSeguimientos(ctx, usuarioID)
}

func (s *Service) SeguirMateria(ctx context.Context, usuarioID, materiaID string) (*MateriaSeguimiento, error) {
	return s.repo.SeguirMateria(ctx, usuarioID, materiaID)
}

func (s *Service) DejarDeSeguirMateria(ctx context.Context, usuarioID, materiaID string) error {
	return s.repo.DejarDeSeguirMateria(ctx, usuarioID, materiaID)
}

// ─── Docente-Materia Asignaciones ─────────────────────────

func (s *Service) IsTeacherAssignedToCurso(ctx context.Context, teacherID, cursoID string) (bool, error) {
	return s.repo.IsTeacherAssignedToCurso(ctx, teacherID, cursoID)
}

func (s *Service) ListMisCursosDocente(ctx context.Context, docenteID string) ([]MisCursoDocente, error) {
	if strings.TrimSpace(docenteID) == "" {
		return nil, errRequired("docente_id")
	}
	return s.repo.ListMisCursosDocente(ctx, strings.TrimSpace(docenteID))
}

func (s *Service) ListDocenteMateriaAsignaciones(ctx context.Context, filter DocenteMateriaAsignacionFilter) ([]DocenteMateriaAsignacion, error) {
	if filter.AnioEscolar != nil {
		normalized, err := normalizeAnioEscolar(*filter.AnioEscolar)
		if err != nil {
			return nil, err
		}
		filter.AnioEscolar = &normalized
	}
	return s.repo.ListDocenteMateriaAsignaciones(ctx, filter)
}

func (s *Service) CreateDocenteMateriaAsignacion(ctx context.Context, req DocenteMateriaAsignacionCreateRequest, actorID string) (*DocenteMateriaAsignacion, error) {
	if strings.TrimSpace(req.DocenteID) == "" {
		return nil, errRequired("docente_id")
	}
	if strings.TrimSpace(req.MateriaID) == "" {
		return nil, errRequired("materia_id")
	}
	anio, err := normalizeAnioEscolar(req.AnioEscolar)
	if err != nil {
		return nil, err
	}

	ok, err := s.repo.IsTeacherProfile(ctx, strings.TrimSpace(req.DocenteID))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("el usuario seleccionado no es un profesor")
	}

	req.DocenteID = strings.TrimSpace(req.DocenteID)
	req.MateriaID = strings.TrimSpace(req.MateriaID)
	req.AnioEscolar = anio

	return s.repo.CreateDocenteMateriaAsignacion(ctx, req, actorID)
}

func (s *Service) AsignarMaestrosCursoAnio(ctx context.Context, cursoID string, req CursoAnioAsignarMaestrosRequest, actorID string) (*CursoAnioAsignarMaestrosResult, error) {
	cursoID = strings.TrimSpace(cursoID)
	if cursoID == "" {
		return nil, errRequired("curso_id")
	}
	if strings.TrimSpace(actorID) == "" {
		return nil, errRequired("actor_id")
	}
	if _, err := s.repo.GetCurso(ctx, cursoID); err != nil {
		return nil, err
	}

	destino, err := normalizeAnioEscolar(req.AnioEscolarDestino)
	if err != nil {
		return nil, err
	}

	origen := ""
	if req.AnioEscolarOrigen != nil && strings.TrimSpace(*req.AnioEscolarOrigen) != "" {
		origen, err = normalizeAnioEscolar(*req.AnioEscolarOrigen)
		if err != nil {
			return nil, err
		}
	} else {
		origen, err = previousAcademicYear(destino)
		if err != nil {
			return nil, err
		}
	}

	if origen == destino {
		return nil, errors.New("anio_escolar_origen y anio_escolar_destino deben ser diferentes")
	}
	if len(req.Asignaciones) == 0 {
		return nil, errRequired("asignaciones")
	}

	sourceMaterias, err := s.repo.ListMaterias(ctx, cursoID, &origen)
	if err != nil {
		return nil, err
	}
	if len(sourceMaterias) == 0 {
		return nil, fmt.Errorf("no hay materias del curso para el anio escolar %s", origen)
	}

	sourceByID := make(map[string]Materia, len(sourceMaterias))
	for _, materia := range sourceMaterias {
		sourceByID[materia.ID] = materia
	}

	assignmentBySource := make(map[string]CursoAnioMateriaDocenteInput, len(req.Asignaciones))
	teachersToValidate := map[string]struct{}{}
	for _, input := range req.Asignaciones {
		sourceID := strings.TrimSpace(input.MateriaOrigenID)
		if sourceID == "" {
			return nil, errRequired("materia_origen_id")
		}
		docenteID := strings.TrimSpace(input.DocenteID)
		if docenteID == "" {
			return nil, errRequired("docente_id")
		}
		if _, exists := sourceByID[sourceID]; !exists {
			return nil, fmt.Errorf("la materia_origen_id %s no pertenece al curso en el anio %s", sourceID, origen)
		}
		if _, exists := assignmentBySource[sourceID]; exists {
			return nil, fmt.Errorf("materia_origen_id repetida en asignaciones: %s", sourceID)
		}

		input.MateriaOrigenID = sourceID
		input.DocenteID = docenteID
		assignmentBySource[sourceID] = input
		teachersToValidate[docenteID] = struct{}{}
	}

	if len(assignmentBySource) != len(sourceMaterias) {
		return nil, errors.New("debe asignar un docente para cada materia del anio origen")
	}

	for _, materia := range sourceMaterias {
		if _, ok := assignmentBySource[materia.ID]; !ok {
			return nil, fmt.Errorf("falta asignar docente para la materia %s", materia.Nombre)
		}
	}

	for docenteID := range teachersToValidate {
		ok, err := s.repo.IsTeacherProfile(ctx, docenteID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("el usuario %s no es un profesor", docenteID)
		}
	}

	result := &CursoAnioAsignarMaestrosResult{
		CursoID:            cursoID,
		AnioEscolarOrigen:  origen,
		AnioEscolarDestino: destino,
		MateriasOrigen:     len(sourceMaterias),
		Detalle:            make([]CursoAnioAsignarMaestrosDetalle, 0, len(sourceMaterias)),
	}

	err = s.repo.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, source := range sourceMaterias {
			input := assignmentBySource[source.ID]
			activo := true
			if input.Activo != nil {
				activo = *input.Activo
			}

			destMateria := Materia{}
			err := tx.
				Where("curso_id = ? AND nombre = ? AND anio_escolar = ?", cursoID, source.Nombre, destino).
				First(&destMateria).Error
			if err != nil {
				if !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}

				destMateria = Materia{
					CursoID:      cursoID,
					AnioEscolar:  destino,
					Nombre:       source.Nombre,
					Descripcion:  source.Descripcion,
					ThumbnailURL: source.ThumbnailURL,
					Color:        source.Color,
					Orden:        source.Orden,
					Activo:       source.Activo,
					CreatedBy:    &actorID,
				}

				if err := tx.Create(&destMateria).Error; err != nil {
					return err
				}
				result.MateriasClonadas++
			} else {
				result.MateriasExistentes++
			}

			existing := DocenteMateriaAsignacion{}
			err = tx.
				Where("materia_id = ? AND curso_id = ? AND anio_escolar = ?", destMateria.ID, cursoID, destino).
				First(&existing).Error
			if err != nil {
				if !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}

				item := DocenteMateriaAsignacion{
					DocenteID:   input.DocenteID,
					MateriaID:   destMateria.ID,
					CursoID:     cursoID,
					AnioEscolar: destino,
					Activo:      activo,
					CreatedBy:   &actorID,
				}
				if err := tx.Create(&item).Error; err != nil {
					return err
				}

				result.AsignacionesCreadas++
				result.Detalle = append(result.Detalle, CursoAnioAsignarMaestrosDetalle{
					MateriaOrigenID:  source.ID,
					MateriaDestinoID: destMateria.ID,
					MateriaNombre:    source.Nombre,
					DocenteID:        input.DocenteID,
					Accion:           "creada",
				})
				continue
			}

			if existing.DocenteID == input.DocenteID && existing.Activo == activo {
				result.AsignacionesSinCambios++
				result.Detalle = append(result.Detalle, CursoAnioAsignarMaestrosDetalle{
					MateriaOrigenID:  source.ID,
					MateriaDestinoID: destMateria.ID,
					MateriaNombre:    source.Nombre,
					DocenteID:        input.DocenteID,
					Accion:           "sin_cambios",
				})
				continue
			}

			if err := tx.Model(&DocenteMateriaAsignacion{}).
				Where("id = ?", existing.ID).
				Updates(map[string]interface{}{
					"docente_id": input.DocenteID,
					"activo":     activo,
				}).Error; err != nil {
				return err
			}

			result.AsignacionesActualizadas++
			result.Detalle = append(result.Detalle, CursoAnioAsignarMaestrosDetalle{
				MateriaOrigenID:  source.ID,
				MateriaDestinoID: destMateria.ID,
				MateriaNombre:    source.Nombre,
				DocenteID:        input.DocenteID,
				Accion:           "actualizada",
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

func (s *Service) UpdateDocenteMateriaAsignacion(ctx context.Context, id string, req DocenteMateriaAsignacionUpdateRequest) (*DocenteMateriaAsignacion, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errRequired("asignacion_id")
	}

	if req.DocenteID != nil {
		docenteID := strings.TrimSpace(*req.DocenteID)
		if docenteID == "" {
			return nil, errRequired("docente_id")
		}
		ok, err := s.repo.IsTeacherProfile(ctx, docenteID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("el usuario seleccionado no es un profesor")
		}
		req.DocenteID = &docenteID
	}

	if req.AnioEscolar != nil {
		normalized, err := normalizeAnioEscolar(*req.AnioEscolar)
		if err != nil {
			return nil, err
		}
		req.AnioEscolar = &normalized
	}

	return s.repo.UpdateDocenteMateriaAsignacion(ctx, strings.TrimSpace(id), req)
}

func (s *Service) DeleteDocenteMateriaAsignacion(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return errRequired("asignacion_id")
	}
	return s.repo.DeleteDocenteMateriaAsignacion(ctx, strings.TrimSpace(id))
}

func (s *Service) GetDocenteMateriaAsignacion(ctx context.Context, id string) (*DocenteMateriaAsignacion, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errRequired("asignacion_id")
	}
	return s.repo.GetDocenteMateriaAsignacion(ctx, strings.TrimSpace(id))
}

// ─── Docente-Materia Horarios ─────────────────────────────

func (s *Service) ListHorariosDocente(ctx context.Context, docenteID string) ([]DocenteMateriaHorarioDetalle, error) {
	if strings.TrimSpace(docenteID) == "" {
		return nil, errRequired("docente_id")
	}
	return s.repo.ListHorariosDocente(ctx, strings.TrimSpace(docenteID))
}

func (s *Service) ListHorariosByAsignacion(ctx context.Context, actorRole, actorID, asignacionID string) ([]DocenteMateriaHorarioDetalle, error) {
	asignacion, err := s.ensureAsignacionAccess(ctx, actorRole, actorID, asignacionID)
	if err != nil {
		return nil, err
	}
	return s.repo.ListHorariosByAsignacion(ctx, asignacion.ID)
}

func (s *Service) CreateHorarioAsignacion(ctx context.Context, actorRole, actorID, asignacionID string, req DocenteMateriaHorarioRequest) (*DocenteMateriaHorario, error) {
	asignacion, err := s.ensureAsignacionAccess(ctx, actorRole, actorID, asignacionID)
	if err != nil {
		return nil, err
	}

	dia, horaInicio, horaFin, err := normalizeHorarioInput(req.DiaSemana, req.HoraInicio, req.HoraFin)
	if err != nil {
		return nil, err
	}
	req.DiaSemana = dia
	req.HoraInicio = horaInicio
	req.HoraFin = horaFin

	conflict, err := s.repo.FindHorarioConflictoDocente(ctx, asignacion.DocenteID, asignacion.AnioEscolar, dia, horaInicio, horaFin, nil)
	if err != nil {
		return nil, err
	}
	if conflict != nil {
		return nil, fmt.Errorf("conflicto horario con %s (%s) %s-%s", conflict.MateriaNombre, conflict.CursoNombre, conflict.HoraInicio, conflict.HoraFin)
	}

	return s.repo.CreateHorarioAsignacion(ctx, asignacion.ID, req, actorID)
}

func (s *Service) UpdateHorarioAsignacion(ctx context.Context, actorRole, actorID, horarioID string, req DocenteMateriaHorarioUpdateRequest) (*DocenteMateriaHorario, error) {
	horario, err := s.repo.GetHorarioAsignacion(ctx, strings.TrimSpace(horarioID))
	if err != nil {
		return nil, err
	}

	asignacion, err := s.ensureAsignacionAccess(ctx, actorRole, actorID, horario.AsignacionID)
	if err != nil {
		return nil, err
	}

	diaSemana := horario.DiaSemana
	horaInicio := strings.TrimSpace(horario.HoraInicio)
	horaFin := strings.TrimSpace(horario.HoraFin)

	if req.DiaSemana != nil {
		diaSemana = *req.DiaSemana
	}
	if req.HoraInicio != nil {
		horaInicio = strings.TrimSpace(*req.HoraInicio)
	}
	if req.HoraFin != nil {
		horaFin = strings.TrimSpace(*req.HoraFin)
	}

	dia, inicioNorm, finNorm, err := normalizeHorarioInput(diaSemana, horaInicio, horaFin)
	if err != nil {
		return nil, err
	}
	req.DiaSemana = &dia
	req.HoraInicio = &inicioNorm
	req.HoraFin = &finNorm

	conflict, err := s.repo.FindHorarioConflictoDocente(ctx, asignacion.DocenteID, asignacion.AnioEscolar, dia, inicioNorm, finNorm, &horario.ID)
	if err != nil {
		return nil, err
	}
	if conflict != nil {
		return nil, fmt.Errorf("conflicto horario con %s (%s) %s-%s", conflict.MateriaNombre, conflict.CursoNombre, conflict.HoraInicio, conflict.HoraFin)
	}

	return s.repo.UpdateHorarioAsignacion(ctx, horario.ID, req)
}

func (s *Service) DeleteHorarioAsignacion(ctx context.Context, actorRole, actorID, horarioID string) error {
	horario, err := s.repo.GetHorarioAsignacion(ctx, strings.TrimSpace(horarioID))
	if err != nil {
		return err
	}
	_, err = s.ensureAsignacionAccess(ctx, actorRole, actorID, horario.AsignacionID)
	if err != nil {
		return err
	}
	return s.repo.DeleteHorarioAsignacion(ctx, horario.ID)
}

func (s *Service) ensureAsignacionAccess(ctx context.Context, actorRole, actorID, asignacionID string) (*DocenteMateriaAsignacion, error) {
	if strings.TrimSpace(asignacionID) == "" {
		return nil, errRequired("asignacion_id")
	}
	asignacion, err := s.repo.GetDocenteMateriaAsignacion(ctx, strings.TrimSpace(asignacionID))
	if err != nil {
		return nil, err
	}

	if actorRole == "teacher" && strings.TrimSpace(actorID) != strings.TrimSpace(asignacion.DocenteID) {
		return nil, errors.New("no autorizado para gestionar este horario")
	}

	if actorRole != "teacher" && actorRole != "admin" && actorRole != "super_admin" {
		return nil, errors.New("no autorizado")
	}

	return asignacion, nil
}

// ─── helpers ────────────────────────────────────────────────

func applyMateriaConfigDefaultsForCreate(req *MateriaRequest) error {
	if req == nil {
		return errors.New("configuracion de materia invalida")
	}

	pesoContenidos := defaultPesoContenidosPct
	pesoLecciones := defaultPesoLeccionesPct
	pesoTrabajos := defaultPesoTrabajosPct
	puntajeTotal := defaultPuntajeTotal
	puntajeMinimo := defaultPuntajeMinimoAprobacion

	if req.PesoContenidosPct != nil {
		pesoContenidos = *req.PesoContenidosPct
	}
	if req.PesoLeccionesPct != nil {
		pesoLecciones = *req.PesoLeccionesPct
	}
	if req.PesoTrabajosPct != nil {
		pesoTrabajos = *req.PesoTrabajosPct
	}
	if req.PuntajeTotal != nil {
		puntajeTotal = *req.PuntajeTotal
	}
	if req.PuntajeMinimoAprobacion != nil {
		puntajeMinimo = *req.PuntajeMinimoAprobacion
	}

	if err := validateMateriaConfig(pesoContenidos, pesoLecciones, pesoTrabajos, puntajeTotal, puntajeMinimo); err != nil {
		return err
	}

	req.PesoContenidosPct = &pesoContenidos
	req.PesoLeccionesPct = &pesoLecciones
	req.PesoTrabajosPct = &pesoTrabajos
	req.PuntajeTotal = &puntajeTotal
	req.PuntajeMinimoAprobacion = &puntajeMinimo
	return nil
}

func applyMateriaConfigDefaultsForUpdate(current *Materia, req *MateriaRequest) error {
	if current == nil || req == nil {
		return errors.New("configuracion de materia invalida")
	}

	pesoContenidos := current.PesoContenidosPct
	pesoLecciones := current.PesoLeccionesPct
	pesoTrabajos := current.PesoTrabajosPct
	puntajeTotal := current.PuntajeTotal
	puntajeMinimo := current.PuntajeMinimoAprobacion

	if req.PesoContenidosPct != nil {
		pesoContenidos = *req.PesoContenidosPct
	}
	if req.PesoLeccionesPct != nil {
		pesoLecciones = *req.PesoLeccionesPct
	}
	if req.PesoTrabajosPct != nil {
		pesoTrabajos = *req.PesoTrabajosPct
	}
	if req.PuntajeTotal != nil {
		puntajeTotal = *req.PuntajeTotal
	}
	if req.PuntajeMinimoAprobacion != nil {
		puntajeMinimo = *req.PuntajeMinimoAprobacion
	}

	if err := validateMateriaConfig(pesoContenidos, pesoLecciones, pesoTrabajos, puntajeTotal, puntajeMinimo); err != nil {
		return err
	}

	req.PesoContenidosPct = &pesoContenidos
	req.PesoLeccionesPct = &pesoLecciones
	req.PesoTrabajosPct = &pesoTrabajos
	req.PuntajeTotal = &puntajeTotal
	req.PuntajeMinimoAprobacion = &puntajeMinimo
	return nil
}

func validateMateriaConfig(pesoContenidos, pesoLecciones, pesoTrabajos, puntajeTotal, puntajeMinimo float64) error {
	if pesoContenidos < 0 || pesoContenidos > 100 {
		return errors.New("peso_contenidos_pct debe estar entre 0 y 100")
	}
	if pesoLecciones < 0 || pesoLecciones > 100 {
		return errors.New("peso_lecciones_pct debe estar entre 0 y 100")
	}
	if pesoTrabajos < 0 || pesoTrabajos > 100 {
		return errors.New("peso_trabajos_pct debe estar entre 0 y 100")
	}
	totalPesos := pesoContenidos + pesoLecciones + pesoTrabajos
	if absFloat(totalPesos-100) > 0.0001 {
		return errors.New("la suma de ponderaciones debe ser exactamente 100")
	}
	if puntajeTotal <= 0 {
		return errors.New("puntaje_total debe ser mayor a 0")
	}
	if puntajeMinimo < 0 || puntajeMinimo > puntajeTotal {
		return errors.New("puntaje_minimo_aprobacion debe estar entre 0 y puntaje_total")
	}
	return nil
}

func validateTemaCalificacionConfig(usarSolo bool, pesoLeccion, pesoContenido, puntajeMinimo float64) error {
	if pesoLeccion < 0 || pesoLeccion > 100 {
		return errors.New("peso_calificacion_leccion debe estar entre 0 y 100")
	}
	if pesoContenido < 0 || pesoContenido > 100 {
		return errors.New("peso_calificacion_contenido debe estar entre 0 y 100")
	}
	if puntajeMinimo < 0 || puntajeMinimo > 100 {
		return errors.New("puntaje_minimo_aprobacion debe estar entre 0 y 100")
	}
	if usarSolo {
		return nil
	}
	if math.Abs((pesoLeccion+pesoContenido)-100) > 0.01 {
		return errors.New("la suma de peso_calificacion_leccion y peso_calificacion_contenido debe ser 100")
	}
	return nil
}

func buildMateriaCalificacionAlumno(materia Materia, row materiaCalificacionBaseRow) MateriaCalificacionAlumno {
	puntosContenidos, contenidosCalificado := computeWeightedPoints(row.PromedioContenidos10, materia.PesoContenidosPct)
	puntosLecciones, leccionesCalificado := computeWeightedPoints(row.PromedioLecciones10, materia.PesoLeccionesPct)
	puntosTrabajos, trabajosCalificado := computeWeightedPoints(row.PromedioTrabajos10, materia.PesoTrabajosPct)

	componentesRequeridos := 0
	componentesCalificados := 0
	if materia.PesoContenidosPct > 0 {
		componentesRequeridos++
		if contenidosCalificado {
			componentesCalificados++
		}
	}
	if materia.PesoLeccionesPct > 0 {
		componentesRequeridos++
		if leccionesCalificado {
			componentesCalificados++
		}
	}
	if materia.PesoTrabajosPct > 0 {
		componentesRequeridos++
		if trabajosCalificado {
			componentesCalificados++
		}
	}

	notaFinal := round2(puntosContenidos + puntosLecciones + puntosTrabajos)
	completa := componentesCalificados == componentesRequeridos
	cumpleMinimo := notaFinal >= materia.PuntajeMinimoAprobacion

	estado := "sin_calificar"
	switch {
	case componentesCalificados == 0:
		estado = "sin_calificar"
	case !completa:
		estado = "materia_no_completada"
	case cumpleMinimo:
		estado = "aprobada"
	default:
		estado = "reprobada"
	}

	return MateriaCalificacionAlumno{
		EstudianteID:           row.EstudianteID,
		EstudianteNombre:       row.EstudianteNombre,
		EstudianteEmail:        row.EstudianteEmail,
		PromedioContenidos10:   row.PromedioContenidos10,
		PromedioLecciones10:    row.PromedioLecciones10,
		PromedioTrabajos10:     row.PromedioTrabajos10,
		PuntosContenidos:       puntosContenidos,
		PuntosLecciones:        puntosLecciones,
		PuntosTrabajos:         puntosTrabajos,
		NotaFinal:              notaFinal,
		EstadoFinal:            estado,
		CumpleMinimo:           cumpleMinimo,
		ComponentesCompletos:   completa,
		ComponentesCalificados: componentesCalificados,
		ComponentesRequeridos:  componentesRequeridos,
	}
}

func computeWeightedPoints(promedio10 *float64, pesoPct float64) (float64, bool) {
	if pesoPct <= 0 {
		return 0, true
	}
	if promedio10 == nil {
		return 0, false
	}
	return round2(*promedio10 * pesoPct / 100.0), true
}

func round2(value float64) float64 {
	if value >= 0 {
		return float64(int(value*100+0.5)) / 100
	}
	return float64(int(value*100-0.5)) / 100
}

func absFloat(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}

func errRequired(field string) error {
	return &validationError{field: field}
}

type validationError struct{ field string }

func (e *validationError) Error() string {
	return "El campo '" + e.field + "' es obligatorio"
}

func validateCalificacionSeccion(req LeccionSeccionRequest) error {
	if req.NotaMaxima != nil && *req.NotaMaxima <= 0 {
		return errors.New("nota_maxima debe ser > 0")
	}
	if req.PesoCalif != nil && *req.PesoCalif < 0 {
		return errors.New("peso_calificacion debe ser >= 0")
	}
	if req.VisibleDesde != nil && req.VisibleHasta != nil && req.VisibleHasta.Before(*req.VisibleDesde) {
		return errors.New("visible_hasta debe ser >= visible_desde")
	}
	if req.EstadoPublicacion != nil {
		switch *req.EstadoPublicacion {
		case "borrador", "programado", "publicado", "despublicado":
			// valid enum values
		default:
			return errors.New("estado_publicacion invalido")
		}
		if *req.EstadoPublicacion == "programado" && req.ProgramadoPara == nil {
			return errors.New("programado_para es requerido cuando estado_publicacion=programado")
		}
	}
	return nil
}

func validateSeccionLifecyclePatch(current *LeccionSeccion, req LeccionSeccionLifecyclePatchRequest) error {
	estado := current.EstadoPublicacion
	if req.EstadoPublicacion.Set {
		if req.EstadoPublicacion.Value == nil {
			return errors.New("estado_publicacion es requerido cuando se incluye")
		}
		next := strings.TrimSpace(*req.EstadoPublicacion.Value)
		switch next {
		case "borrador", "programado", "publicado", "despublicado":
			estado = next
		default:
			return errors.New("estado_publicacion invalido")
		}
	}

	if req.Visible.Set && req.Visible.Value == nil {
		return errors.New("visible es requerido cuando se incluye")
	}

	programadoPara := current.ProgramadoPara
	if req.ProgramadoPara.Set {
		programadoPara = req.ProgramadoPara.Value
	}
	if estado == "programado" && programadoPara == nil {
		return errors.New("programado_para es requerido cuando estado_publicacion=programado")
	}

	visibleDesde := current.VisibleDesde
	if req.VisibleDesde.Set {
		visibleDesde = req.VisibleDesde.Value
	}
	visibleHasta := current.VisibleHasta
	if req.VisibleHasta.Set {
		visibleHasta = req.VisibleHasta.Value
	}

	if visibleDesde != nil && visibleHasta != nil && visibleHasta.Before(*visibleDesde) {
		return errors.New("visible_hasta debe ser >= visible_desde")
	}

	return nil
}

func hasForoPayload(contenido *string, imagenURL *string) bool {
	if contenido != nil && strings.TrimSpace(*contenido) != "" {
		return true
	}
	if imagenURL != nil && strings.TrimSpace(*imagenURL) != "" {
		return true
	}
	return false
}

func normalizeAnioEscolar(value string) (string, error) {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return "", errRequired("anio_escolar")
	}
	matched, err := regexp.MatchString(`^\d{4}-\d{4}$`, normalized)
	if err != nil {
		return "", err
	}
	if !matched {
		return "", errors.New("anio_escolar debe tener formato YYYY-YYYY")
	}
	return normalized, nil
}

func previousAcademicYear(value string) (string, error) {
	normalized, err := normalizeAnioEscolar(value)
	if err != nil {
		return "", err
	}

	parts := strings.Split(normalized, "-")
	if len(parts) != 2 {
		return "", errors.New("anio_escolar invalido")
	}
	start, err := strconv.Atoi(parts[0])
	if err != nil {
		return "", err
	}
	end, err := strconv.Atoi(parts[1])
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("%04d-%04d", start-1, end-1), nil
}

func normalizeHora(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("hora requerida")
	}
	layouts := []string{"15:04", "15:04:05"}
	for _, layout := range layouts {
		parsed, err := time.Parse(layout, trimmed)
		if err == nil {
			return parsed.Format("15:04:05"), nil
		}
	}
	return "", errors.New("hora invalida, use HH:MM o HH:MM:SS")
}

func normalizeHorarioInput(diaSemana int, horaInicio, horaFin string) (int, string, string, error) {
	if diaSemana < 1 || diaSemana > 7 {
		return 0, "", "", errors.New("dia_semana debe estar entre 1 y 7")
	}

	inicio, err := normalizeHora(horaInicio)
	if err != nil {
		return 0, "", "", fmt.Errorf("hora_inicio: %w", err)
	}
	fin, err := normalizeHora(horaFin)
	if err != nil {
		return 0, "", "", fmt.Errorf("hora_fin: %w", err)
	}

	tInicio, _ := time.Parse("15:04:05", inicio)
	tFin, _ := time.Parse("15:04:05", fin)
	if !tFin.After(tInicio) {
		return 0, "", "", errors.New("hora_fin debe ser mayor que hora_inicio")
	}

	return diaSemana, inicio, fin, nil
}

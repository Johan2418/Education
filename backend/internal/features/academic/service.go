package academic

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
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
		PesoPruebasPct:          materia.PesoLeccionesPct,
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
			PesoPruebasPct:          materia.PesoLeccionesPct,
			PesoTrabajosPct:         materia.PesoTrabajosPct,
			PuntajeTotal:            materia.PuntajeTotal,
			PuntajeMinimoAprobacion: materia.PuntajeMinimoAprobacion,
			PromedioContenidos10:    calculo.PromedioContenidos10,
			PromedioLecciones10:     calculo.PromedioLecciones10,
			PromedioPruebas10:       calculo.PromedioLecciones10,
			PromedioTrabajos10:      calculo.PromedioTrabajos10,
			PuntosContenidos:        calculo.PuntosContenidos,
			PuntosLecciones:         calculo.PuntosLecciones,
			PuntosPruebas:           calculo.PuntosLecciones,
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

func (s *Service) ListMisCalificacionesDetalleEstudiante(ctx context.Context, estudianteID string, rawFilter StudentGradeDetailFilters) (*StudentGradeDetailResponse, error) {
	estudianteID = strings.TrimSpace(estudianteID)
	if estudianteID == "" {
		return nil, errRequired("estudiante_id")
	}

	filter, err := normalizeStudentGradeDetailFilters(rawFilter)
	if err != nil {
		return nil, err
	}

	rows, err := s.repo.ListStudentGradeDetailRows(ctx, estudianteID, filter)
	if err != nil {
		return nil, err
	}

	total := len(rows)
	start := filter.Offset
	if start > total {
		start = total
	}
	end := start + filter.Limit
	if end > total {
		end = total
	}
	paged := rows[start:end]
	aggregates := buildStudentGradeAggregates(rows)

	return &StudentGradeDetailResponse{
		Items:      paged,
		Total:      total,
		Limit:      filter.Limit,
		Offset:     filter.Offset,
		Aggregates: aggregates,
	}, nil
}

func (s *Service) ListCalificacionesDetalleDocente(ctx context.Context, actorID, actorRole string, rawFilter TeacherGradeDetailFilters) (*TeacherGradeDetailResponse, error) {
	role := strings.ToLower(strings.TrimSpace(actorRole))
	filter, err := normalizeTeacherGradeDetailFilters(rawFilter)
	if err != nil {
		return nil, err
	}

	empty := &TeacherGradeDetailResponse{
		Items:  []TeacherGradeDetailItem{},
		Total:  0,
		Limit:  filter.Limit,
		Offset: filter.Offset,
		Aggregates: TeacherGradeAggregates{
			Total:              0,
			PromedioGeneral10:  0,
			PromedioGeneral100: 0,
			PorTipo:            []TeacherGradeTypeAggregate{},
			PorCurso:           []TeacherGradeCursoAggregate{},
			PorMateria:         []TeacherGradeMateriaAggregate{},
			PorEstudiante:      []TeacherGradeEstudianteAggregate{},
			PorUnidad:          []TeacherGradeUnidadAggregate{},
			PorTema:            []TeacherGradeTemaAggregate{},
		},
	}

	studentFilter := StudentGradeDetailFilters{
		MateriaID: filter.MateriaID,
		Tipo:      filter.Tipo,
		UnidadID:  filter.UnidadID,
		TemaID:    filter.TemaID,
		Estado:    filter.Estado,
		Desde:     filter.Desde,
		Hasta:     filter.Hasta,
		Q:         filter.Q,
		Limit:     200,
		Offset:    0,
	}

	allowedCourseNames := map[string]string{}
	allowedMateriaCourse := map[string]string{}
	allowedMateriaName := map[string]string{}
	visibleStudents := map[string]EstudianteCursoDetail{}
	allRows := make([]TeacherGradeDetailItem, 0)

	loadStudentsByCourse := func(courseIDs []string) error {
		for _, rawCourseID := range courseIDs {
			courseID := strings.TrimSpace(rawCourseID)
			if courseID == "" {
				continue
			}
			enrolled, err := s.repo.ListEstudiantesByCurso(ctx, courseID)
			if err != nil {
				return err
			}
			for _, student := range enrolled {
				if strings.TrimSpace(student.EstudianteID) == "" {
					continue
				}
				visibleStudents[student.EstudianteID] = student
			}
		}
		return nil
	}

	switch role {
	case "teacher":
		teacherID := strings.TrimSpace(actorID)
		if teacherID == "" {
			return nil, errRequired("docente_id")
		}

		assignments, err := s.repo.ListMisCursosDocente(ctx, teacherID)
		if err != nil {
			return nil, err
		}
		if len(assignments) == 0 {
			return empty, nil
		}

		courseSet := map[string]struct{}{}
		for _, item := range assignments {
			materiaID := strings.TrimSpace(item.MateriaID)
			cursoID := strings.TrimSpace(item.CursoID)
			if materiaID == "" || cursoID == "" {
				continue
			}
			allowedMateriaCourse[materiaID] = cursoID
			allowedMateriaName[materiaID] = strings.TrimSpace(item.MateriaNombre)
			if _, exists := allowedCourseNames[cursoID]; !exists {
				allowedCourseNames[cursoID] = strings.TrimSpace(item.CursoNombre)
			}
			courseSet[cursoID] = struct{}{}
		}

		if len(allowedMateriaCourse) == 0 {
			return empty, nil
		}

		if filter.MateriaID != nil {
			if _, ok := allowedMateriaCourse[strings.TrimSpace(*filter.MateriaID)]; !ok {
				return nil, errors.New("no autorizado para esta materia")
			}
		}
		if filter.CursoID != nil {
			if _, ok := allowedCourseNames[strings.TrimSpace(*filter.CursoID)]; !ok {
				return nil, errors.New("no autorizado para este curso")
			}
		}

		courseIDs := make([]string, 0, len(courseSet))
		for courseID := range courseSet {
			if filter.CursoID != nil && courseID != strings.TrimSpace(*filter.CursoID) {
				continue
			}
			courseIDs = append(courseIDs, courseID)
		}
		if len(courseIDs) == 0 {
			return empty, nil
		}
		if err := loadStudentsByCourse(courseIDs); err != nil {
			return nil, err
		}

	case "admin", "super_admin":
		if filter.MateriaID != nil {
			materia, err := s.repo.GetMateria(ctx, strings.TrimSpace(*filter.MateriaID))
			if err != nil {
				return nil, err
			}
			cursoID := strings.TrimSpace(materia.CursoID)
			allowedMateriaCourse[materia.ID] = cursoID
			allowedMateriaName[materia.ID] = strings.TrimSpace(materia.Nombre)
			if _, exists := allowedCourseNames[cursoID]; !exists {
				curso, err := s.repo.GetCurso(ctx, cursoID)
				if err == nil {
					allowedCourseNames[cursoID] = strings.TrimSpace(curso.Nombre)
				}
			}
		}

		courseIDs := make([]string, 0)
		if filter.CursoID != nil {
			courseID := strings.TrimSpace(*filter.CursoID)
			course, err := s.repo.GetCurso(ctx, courseID)
			if err != nil {
				return nil, err
			}
			allowedCourseNames[courseID] = strings.TrimSpace(course.Nombre)
			courseIDs = append(courseIDs, courseID)
		} else if len(allowedMateriaCourse) > 0 {
			set := map[string]struct{}{}
			for _, courseID := range allowedMateriaCourse {
				set[courseID] = struct{}{}
			}
			for courseID := range set {
				courseIDs = append(courseIDs, courseID)
				if _, exists := allowedCourseNames[courseID]; !exists {
					course, err := s.repo.GetCurso(ctx, courseID)
					if err == nil {
						allowedCourseNames[courseID] = strings.TrimSpace(course.Nombre)
					}
				}
			}
		} else {
			courses, err := s.repo.ListCursos(ctx)
			if err != nil {
				return nil, err
			}
			for _, course := range courses {
				courseID := strings.TrimSpace(course.ID)
				if courseID == "" {
					continue
				}
				courseIDs = append(courseIDs, courseID)
				allowedCourseNames[courseID] = strings.TrimSpace(course.Nombre)
			}
		}

		if len(courseIDs) == 0 {
			return empty, nil
		}

		if len(allowedMateriaCourse) == 0 {
			for _, courseID := range courseIDs {
				materias, err := s.repo.ListMaterias(ctx, courseID, nil)
				if err != nil {
					return nil, err
				}
				for _, materia := range materias {
					materiaID := strings.TrimSpace(materia.ID)
					if materiaID == "" {
						continue
					}
					allowedMateriaCourse[materiaID] = courseID
					allowedMateriaName[materiaID] = strings.TrimSpace(materia.Nombre)
				}
			}
		}

		if err := loadStudentsByCourse(courseIDs); err != nil {
			return nil, err
		}

	default:
		return nil, errors.New("no autorizado")
	}

	if filter.EstudianteID != nil {
		studentID := strings.TrimSpace(*filter.EstudianteID)
		student, ok := visibleStudents[studentID]
		if !ok {
			return nil, errors.New("no autorizado para este estudiante")
		}
		visibleStudents = map[string]EstudianteCursoDetail{studentID: student}
	}

	if len(visibleStudents) == 0 {
		return empty, nil
	}

	studentIDs := make([]string, 0, len(visibleStudents))
	for studentID := range visibleStudents {
		studentIDs = append(studentIDs, studentID)
	}
	sort.Strings(studentIDs)

	for _, studentID := range studentIDs {
		rows, err := s.repo.ListStudentGradeDetailRows(ctx, studentID, studentFilter)
		if err != nil {
			return nil, err
		}

		student := visibleStudents[studentID]
		displayName := ""
		if student.DisplayName != nil {
			displayName = *student.DisplayName
		}
		studentName := strings.TrimSpace(firstNonEmpty(displayName, student.Email, student.EstudianteID))
		studentEmail := strings.TrimSpace(student.Email)

		for _, row := range rows {
			materiaID := ""
			if row.MateriaID != nil {
				materiaID = strings.TrimSpace(*row.MateriaID)
			}
			if materiaID == "" {
				continue
			}

			cursoID, ok := allowedMateriaCourse[materiaID]
			if !ok {
				// Skip records outside the teacher/admin visible scope.
				continue
			}
			if filter.CursoID != nil && cursoID != strings.TrimSpace(*filter.CursoID) {
				continue
			}

			cursoNombre := strings.TrimSpace(allowedCourseNames[cursoID])
			if cursoNombre == "" {
				curso, err := s.repo.GetCurso(ctx, cursoID)
				if err == nil && curso != nil {
					cursoNombre = strings.TrimSpace(curso.Nombre)
					allowedCourseNames[cursoID] = cursoNombre
				}
			}

			materiaNombre := ""
			if row.Materia != nil {
				materiaNombre = strings.TrimSpace(*row.Materia)
			}
			if materiaNombre == "" {
				materiaNombre = strings.TrimSpace(allowedMateriaName[materiaID])
			}

			cursoIDCopy := cursoID
			cursoNombreCopy := cursoNombre
			materiaIDCopy := materiaID
			materiaNombreCopy := materiaNombre

			allRows = append(allRows, TeacherGradeDetailItem{
				ID:              row.ID,
				Tipo:            row.Tipo,
				Estado:          row.Estado,
				Fecha:           row.Fecha,
				Titulo:          row.Titulo,
				CursoID:         &cursoIDCopy,
				Curso:           &cursoNombreCopy,
				MateriaID:       &materiaIDCopy,
				Materia:         &materiaNombreCopy,
				UnidadID:        row.UnidadID,
				Unidad:          row.Unidad,
				TemaID:          row.TemaID,
				Tema:            row.Tema,
				EstudianteID:    studentID,
				Estudiante:      studentName,
				EstudianteEmail: studentEmail,
				Referencia:      row.Referencia,
				Puntaje100:      row.Puntaje100,
				Nota10:          row.Nota10,
			})
		}
	}

	if len(allRows) == 0 {
		return empty, nil
	}

	sort.Slice(allRows, func(i, j int) bool {
		if allRows[i].Fecha.Equal(allRows[j].Fecha) {
			if allRows[i].Estudiante == allRows[j].Estudiante {
				if allRows[i].Tipo == allRows[j].Tipo {
					return strings.ToLower(allRows[i].Titulo) < strings.ToLower(allRows[j].Titulo)
				}
				return allRows[i].Tipo < allRows[j].Tipo
			}
			return strings.ToLower(allRows[i].Estudiante) < strings.ToLower(allRows[j].Estudiante)
		}
		return allRows[i].Fecha.After(allRows[j].Fecha)
	})

	total := len(allRows)
	start := filter.Offset
	if start > total {
		start = total
	}
	end := start + filter.Limit
	if end > total {
		end = total
	}

	return &TeacherGradeDetailResponse{
		Items:      allRows[start:end],
		Total:      total,
		Limit:      filter.Limit,
		Offset:     filter.Offset,
		Aggregates: buildTeacherGradeAggregates(allRows),
	}, nil
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
		PromedioPruebas10:      row.PromedioLecciones10,
		PromedioTrabajos10:     row.PromedioTrabajos10,
		PuntosContenidos:       puntosContenidos,
		PuntosLecciones:        puntosLecciones,
		PuntosPruebas:          puntosLecciones,
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

type studentGradeScoreBucket struct {
	total  int
	sum10  float64
	sum100 float64
}

func (b *studentGradeScoreBucket) add(item StudentGradeDetailItem) {
	b.total++
	b.sum10 += item.Nota10
	b.sum100 += item.Puntaje100
}

func (b *studentGradeScoreBucket) avg10() float64 {
	if b.total == 0 {
		return 0
	}
	return round2(b.sum10 / float64(b.total))
}

func (b *studentGradeScoreBucket) avg100() float64 {
	if b.total == 0 {
		return 0
	}
	return round2(b.sum100 / float64(b.total))
}

func buildStudentGradeAggregates(items []StudentGradeDetailItem) StudentGradeAggregates {
	totalBucket := &studentGradeScoreBucket{}
	typeBuckets := map[string]*studentGradeScoreBucket{
		"contenido": {},
		"prueba":    {},
		"tarea":     {},
	}

	type namedBucket struct {
		id   string
		name string
		*studentGradeScoreBucket
	}

	materiaBuckets := map[string]*namedBucket{}
	unidadBuckets := map[string]*namedBucket{}
	temaBuckets := map[string]*namedBucket{}

	for _, item := range items {
		totalBucket.add(item)
		if bucket, ok := typeBuckets[item.Tipo]; ok {
			bucket.add(item)
		}

		if item.MateriaID != nil && strings.TrimSpace(*item.MateriaID) != "" {
			key := strings.TrimSpace(*item.MateriaID)
			if _, exists := materiaBuckets[key]; !exists {
				materiaName := key
				if item.Materia != nil && strings.TrimSpace(*item.Materia) != "" {
					materiaName = strings.TrimSpace(*item.Materia)
				}
				materiaBuckets[key] = &namedBucket{
					id:                      key,
					name:                    materiaName,
					studentGradeScoreBucket: &studentGradeScoreBucket{},
				}
			}
			materiaBuckets[key].add(item)
		}

		if item.UnidadID != nil && strings.TrimSpace(*item.UnidadID) != "" {
			key := strings.TrimSpace(*item.UnidadID)
			if _, exists := unidadBuckets[key]; !exists {
				unidadName := key
				if item.Unidad != nil && strings.TrimSpace(*item.Unidad) != "" {
					unidadName = strings.TrimSpace(*item.Unidad)
				}
				unidadBuckets[key] = &namedBucket{
					id:                      key,
					name:                    unidadName,
					studentGradeScoreBucket: &studentGradeScoreBucket{},
				}
			}
			unidadBuckets[key].add(item)
		}

		if item.TemaID != nil && strings.TrimSpace(*item.TemaID) != "" {
			key := strings.TrimSpace(*item.TemaID)
			if _, exists := temaBuckets[key]; !exists {
				temaName := key
				if item.Tema != nil && strings.TrimSpace(*item.Tema) != "" {
					temaName = strings.TrimSpace(*item.Tema)
				}
				temaBuckets[key] = &namedBucket{
					id:                      key,
					name:                    temaName,
					studentGradeScoreBucket: &studentGradeScoreBucket{},
				}
			}
			temaBuckets[key].add(item)
		}
	}

	porTipo := []StudentGradeTypeAggregate{
		{
			Tipo:        "contenido",
			Total:       typeBuckets["contenido"].total,
			Promedio10:  typeBuckets["contenido"].avg10(),
			Promedio100: typeBuckets["contenido"].avg100(),
		},
		{
			Tipo:        "prueba",
			Total:       typeBuckets["prueba"].total,
			Promedio10:  typeBuckets["prueba"].avg10(),
			Promedio100: typeBuckets["prueba"].avg100(),
		},
		{
			Tipo:        "tarea",
			Total:       typeBuckets["tarea"].total,
			Promedio10:  typeBuckets["tarea"].avg10(),
			Promedio100: typeBuckets["tarea"].avg100(),
		},
	}

	porMateria := make([]StudentGradeMateriaAggregate, 0, len(materiaBuckets))
	for _, bucket := range materiaBuckets {
		porMateria = append(porMateria, StudentGradeMateriaAggregate{
			MateriaID:   bucket.id,
			Materia:     bucket.name,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porMateria, func(i, j int) bool {
		return strings.ToLower(porMateria[i].Materia) < strings.ToLower(porMateria[j].Materia)
	})

	porUnidad := make([]StudentGradeUnidadAggregate, 0, len(unidadBuckets))
	for _, bucket := range unidadBuckets {
		porUnidad = append(porUnidad, StudentGradeUnidadAggregate{
			UnidadID:    bucket.id,
			Unidad:      bucket.name,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porUnidad, func(i, j int) bool {
		return strings.ToLower(porUnidad[i].Unidad) < strings.ToLower(porUnidad[j].Unidad)
	})

	porTema := make([]StudentGradeTemaAggregate, 0, len(temaBuckets))
	for _, bucket := range temaBuckets {
		porTema = append(porTema, StudentGradeTemaAggregate{
			TemaID:      bucket.id,
			Tema:        bucket.name,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porTema, func(i, j int) bool {
		return strings.ToLower(porTema[i].Tema) < strings.ToLower(porTema[j].Tema)
	})

	return StudentGradeAggregates{
		Total:              totalBucket.total,
		PromedioGeneral10:  totalBucket.avg10(),
		PromedioGeneral100: totalBucket.avg100(),
		PorTipo:            porTipo,
		PorMateria:         porMateria,
		PorUnidad:          porUnidad,
		PorTema:            porTema,
	}
}

type teacherGradeScoreBucket struct {
	total  int
	sum10  float64
	sum100 float64
}

func (b *teacherGradeScoreBucket) add(item TeacherGradeDetailItem) {
	b.total++
	b.sum10 += item.Nota10
	b.sum100 += item.Puntaje100
}

func (b *teacherGradeScoreBucket) avg10() float64 {
	if b.total == 0 {
		return 0
	}
	return round2(b.sum10 / float64(b.total))
}

func (b *teacherGradeScoreBucket) avg100() float64 {
	if b.total == 0 {
		return 0
	}
	return round2(b.sum100 / float64(b.total))
}

func buildTeacherGradeAggregates(items []TeacherGradeDetailItem) TeacherGradeAggregates {
	totalBucket := &teacherGradeScoreBucket{}
	typeBuckets := map[string]*teacherGradeScoreBucket{
		"contenido": {},
		"prueba":    {},
		"tarea":     {},
	}

	type namedBucket struct {
		id   string
		name string
		*teacherGradeScoreBucket
	}
	type namedMateriaBucket struct {
		id       string
		name     string
		course   string
		courseID string
		*teacherGradeScoreBucket
	}
	type namedStudentBucket struct {
		id    string
		name  string
		email string
		*teacherGradeScoreBucket
	}

	cursoBuckets := map[string]*namedBucket{}
	materiaBuckets := map[string]*namedMateriaBucket{}
	studentBuckets := map[string]*namedStudentBucket{}
	unidadBuckets := map[string]*namedBucket{}
	temaBuckets := map[string]*namedBucket{}

	for _, item := range items {
		totalBucket.add(item)
		if bucket, ok := typeBuckets[item.Tipo]; ok {
			bucket.add(item)
		}

		if item.CursoID != nil && strings.TrimSpace(*item.CursoID) != "" {
			key := strings.TrimSpace(*item.CursoID)
			if _, exists := cursoBuckets[key]; !exists {
				courseName := key
				if item.Curso != nil && strings.TrimSpace(*item.Curso) != "" {
					courseName = strings.TrimSpace(*item.Curso)
				}
				cursoBuckets[key] = &namedBucket{
					id:                      key,
					name:                    courseName,
					teacherGradeScoreBucket: &teacherGradeScoreBucket{},
				}
			}
			cursoBuckets[key].add(item)
		}

		if item.MateriaID != nil && strings.TrimSpace(*item.MateriaID) != "" {
			key := strings.TrimSpace(*item.MateriaID)
			if _, exists := materiaBuckets[key]; !exists {
				materiaName := key
				if item.Materia != nil && strings.TrimSpace(*item.Materia) != "" {
					materiaName = strings.TrimSpace(*item.Materia)
				}
				courseName := ""
				if item.Curso != nil {
					courseName = strings.TrimSpace(*item.Curso)
				}
				courseID := ""
				if item.CursoID != nil {
					courseID = strings.TrimSpace(*item.CursoID)
				}
				materiaBuckets[key] = &namedMateriaBucket{
					id:                      key,
					name:                    materiaName,
					course:                  courseName,
					courseID:                courseID,
					teacherGradeScoreBucket: &teacherGradeScoreBucket{},
				}
			}
			materiaBuckets[key].add(item)
		}

		if strings.TrimSpace(item.EstudianteID) != "" {
			key := strings.TrimSpace(item.EstudianteID)
			if _, exists := studentBuckets[key]; !exists {
				studentBuckets[key] = &namedStudentBucket{
					id:                      key,
					name:                    strings.TrimSpace(item.Estudiante),
					email:                   strings.TrimSpace(item.EstudianteEmail),
					teacherGradeScoreBucket: &teacherGradeScoreBucket{},
				}
			}
			studentBuckets[key].add(item)
		}

		if item.UnidadID != nil && strings.TrimSpace(*item.UnidadID) != "" {
			key := strings.TrimSpace(*item.UnidadID)
			if _, exists := unidadBuckets[key]; !exists {
				unidadName := key
				if item.Unidad != nil && strings.TrimSpace(*item.Unidad) != "" {
					unidadName = strings.TrimSpace(*item.Unidad)
				}
				unidadBuckets[key] = &namedBucket{
					id:                      key,
					name:                    unidadName,
					teacherGradeScoreBucket: &teacherGradeScoreBucket{},
				}
			}
			unidadBuckets[key].add(item)
		}

		if item.TemaID != nil && strings.TrimSpace(*item.TemaID) != "" {
			key := strings.TrimSpace(*item.TemaID)
			if _, exists := temaBuckets[key]; !exists {
				temaName := key
				if item.Tema != nil && strings.TrimSpace(*item.Tema) != "" {
					temaName = strings.TrimSpace(*item.Tema)
				}
				temaBuckets[key] = &namedBucket{
					id:                      key,
					name:                    temaName,
					teacherGradeScoreBucket: &teacherGradeScoreBucket{},
				}
			}
			temaBuckets[key].add(item)
		}
	}

	porTipo := []TeacherGradeTypeAggregate{
		{
			Tipo:        "contenido",
			Total:       typeBuckets["contenido"].total,
			Promedio10:  typeBuckets["contenido"].avg10(),
			Promedio100: typeBuckets["contenido"].avg100(),
		},
		{
			Tipo:        "prueba",
			Total:       typeBuckets["prueba"].total,
			Promedio10:  typeBuckets["prueba"].avg10(),
			Promedio100: typeBuckets["prueba"].avg100(),
		},
		{
			Tipo:        "tarea",
			Total:       typeBuckets["tarea"].total,
			Promedio10:  typeBuckets["tarea"].avg10(),
			Promedio100: typeBuckets["tarea"].avg100(),
		},
	}

	porCurso := make([]TeacherGradeCursoAggregate, 0, len(cursoBuckets))
	for _, bucket := range cursoBuckets {
		porCurso = append(porCurso, TeacherGradeCursoAggregate{
			CursoID:     bucket.id,
			Curso:       bucket.name,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porCurso, func(i, j int) bool {
		return strings.ToLower(porCurso[i].Curso) < strings.ToLower(porCurso[j].Curso)
	})

	porMateria := make([]TeacherGradeMateriaAggregate, 0, len(materiaBuckets))
	for _, bucket := range materiaBuckets {
		porMateria = append(porMateria, TeacherGradeMateriaAggregate{
			MateriaID:   bucket.id,
			Materia:     bucket.name,
			CursoID:     bucket.courseID,
			Curso:       bucket.course,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porMateria, func(i, j int) bool {
		if strings.ToLower(porMateria[i].Curso) == strings.ToLower(porMateria[j].Curso) {
			return strings.ToLower(porMateria[i].Materia) < strings.ToLower(porMateria[j].Materia)
		}
		return strings.ToLower(porMateria[i].Curso) < strings.ToLower(porMateria[j].Curso)
	})

	porEstudiante := make([]TeacherGradeEstudianteAggregate, 0, len(studentBuckets))
	for _, bucket := range studentBuckets {
		porEstudiante = append(porEstudiante, TeacherGradeEstudianteAggregate{
			EstudianteID:    bucket.id,
			Estudiante:      bucket.name,
			EstudianteEmail: bucket.email,
			Total:           bucket.total,
			Promedio10:      bucket.avg10(),
			Promedio100:     bucket.avg100(),
		})
	}
	sort.Slice(porEstudiante, func(i, j int) bool {
		return strings.ToLower(porEstudiante[i].Estudiante) < strings.ToLower(porEstudiante[j].Estudiante)
	})

	porUnidad := make([]TeacherGradeUnidadAggregate, 0, len(unidadBuckets))
	for _, bucket := range unidadBuckets {
		porUnidad = append(porUnidad, TeacherGradeUnidadAggregate{
			UnidadID:    bucket.id,
			Unidad:      bucket.name,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porUnidad, func(i, j int) bool {
		return strings.ToLower(porUnidad[i].Unidad) < strings.ToLower(porUnidad[j].Unidad)
	})

	porTema := make([]TeacherGradeTemaAggregate, 0, len(temaBuckets))
	for _, bucket := range temaBuckets {
		porTema = append(porTema, TeacherGradeTemaAggregate{
			TemaID:      bucket.id,
			Tema:        bucket.name,
			Total:       bucket.total,
			Promedio10:  bucket.avg10(),
			Promedio100: bucket.avg100(),
		})
	}
	sort.Slice(porTema, func(i, j int) bool {
		return strings.ToLower(porTema[i].Tema) < strings.ToLower(porTema[j].Tema)
	})

	return TeacherGradeAggregates{
		Total:              totalBucket.total,
		PromedioGeneral10:  totalBucket.avg10(),
		PromedioGeneral100: totalBucket.avg100(),
		PorTipo:            porTipo,
		PorCurso:           porCurso,
		PorMateria:         porMateria,
		PorEstudiante:      porEstudiante,
		PorUnidad:          porUnidad,
		PorTema:            porTema,
	}
}

func normalizeStudentGradeDetailFilters(filter StudentGradeDetailFilters) (StudentGradeDetailFilters, error) {
	normalized := filter

	normalized.MateriaID = normalizeOptionalString(filter.MateriaID)
	normalized.UnidadID = normalizeOptionalString(filter.UnidadID)
	normalized.TemaID = normalizeOptionalString(filter.TemaID)
	normalized.Q = normalizeOptionalString(filter.Q)

	if filter.Tipo != nil {
		tipo := strings.ToLower(strings.TrimSpace(*filter.Tipo))
		switch tipo {
		case "contenido", "prueba", "tarea":
			normalized.Tipo = &tipo
		default:
			return StudentGradeDetailFilters{}, errors.New("tipo invalido: use contenido, prueba o tarea")
		}
	} else {
		normalized.Tipo = nil
	}

	if filter.Estado == nil {
		defaultEstado := "calificada"
		normalized.Estado = &defaultEstado
	} else {
		estado := strings.ToLower(strings.TrimSpace(*filter.Estado))
		switch estado {
		case "", "calificada":
			estado = "calificada"
			normalized.Estado = &estado
		case "sin_calificar":
			normalized.Estado = &estado
		case "todos":
			normalized.Estado = nil
		default:
			return StudentGradeDetailFilters{}, errors.New("estado invalido: use calificada, sin_calificar o todos")
		}
	}

	if normalized.Limit <= 0 {
		normalized.Limit = 50
	}
	if normalized.Limit > 200 {
		normalized.Limit = 200
	}
	if normalized.Offset < 0 {
		normalized.Offset = 0
	}

	if normalized.Desde != nil && normalized.Hasta != nil && normalized.Desde.After(*normalized.Hasta) {
		return StudentGradeDetailFilters{}, errors.New("rango de fechas invalido")
	}

	return normalized, nil
}

func normalizeTeacherGradeDetailFilters(filter TeacherGradeDetailFilters) (TeacherGradeDetailFilters, error) {
	normalized := filter

	normalized.CursoID = normalizeOptionalString(filter.CursoID)
	normalized.MateriaID = normalizeOptionalString(filter.MateriaID)
	normalized.EstudianteID = normalizeOptionalString(filter.EstudianteID)
	normalized.UnidadID = normalizeOptionalString(filter.UnidadID)
	normalized.TemaID = normalizeOptionalString(filter.TemaID)
	normalized.Q = normalizeOptionalString(filter.Q)

	if filter.Tipo != nil {
		tipo := strings.ToLower(strings.TrimSpace(*filter.Tipo))
		switch tipo {
		case "contenido", "prueba", "tarea":
			normalized.Tipo = &tipo
		default:
			return TeacherGradeDetailFilters{}, errors.New("tipo invalido: use contenido, prueba o tarea")
		}
	} else {
		normalized.Tipo = nil
	}

	if filter.Estado == nil {
		defaultEstado := "calificada"
		normalized.Estado = &defaultEstado
	} else {
		estado := strings.ToLower(strings.TrimSpace(*filter.Estado))
		switch estado {
		case "", "calificada":
			estado = "calificada"
			normalized.Estado = &estado
		case "sin_calificar":
			normalized.Estado = &estado
		case "todos":
			normalized.Estado = nil
		default:
			return TeacherGradeDetailFilters{}, errors.New("estado invalido: use calificada, sin_calificar o todos")
		}
	}

	if normalized.Limit <= 0 {
		normalized.Limit = 50
	}
	if normalized.Limit > 200 {
		normalized.Limit = 200
	}
	if normalized.Offset < 0 {
		normalized.Offset = 0
	}

	if normalized.Desde != nil && normalized.Hasta != nil && normalized.Desde.After(*normalized.Hasta) {
		return TeacherGradeDetailFilters{}, errors.New("rango de fechas invalido")
	}

	return normalized, nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
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

package academic

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ═══════════════════════════════════════════════════════════════
// CURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListCursos(ctx context.Context) ([]Curso, error) {
	var items []Curso
	err := r.db.WithContext(ctx).Order("orden, nombre").Find(&items).Error
	return items, err
}

func (r *Repository) ListCursosByTeacher(ctx context.Context, teacherID string) ([]Curso, error) {
	anioActivo, err := r.GetAnioEscolarActivo(ctx)
	if err != nil {
		return nil, err
	}

	var items []Curso
	err = r.db.WithContext(ctx).
		Table("internal.curso c").
		Select("DISTINCT c.*").
		Joins("JOIN internal.docente_materia_asignacion dma ON dma.curso_id = c.id").
		Where("dma.docente_id = ? AND dma.anio_escolar = ? AND dma.activo = TRUE", teacherID, anioActivo).
		Order("c.orden, c.nombre").
		Scan(&items).Error
	if err != nil && !isMissingRelationError(err, "internal.docente_materia_asignacion") {
		return nil, err
	}

	if len(items) > 0 {
		return items, nil
	}

	// Backward-compatible fallback while legacy data converges to materia assignments.
	err = r.db.WithContext(ctx).Where("teacher_id = ?", teacherID).Order("orden, nombre").Find(&items).Error
	return items, err
}

func (r *Repository) GetCurso(ctx context.Context, id string) (*Curso, error) {
	var c Curso
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) CreateCurso(ctx context.Context, req CursoRequest) (*Curso, error) {
	c := Curso{
		Nombre:      req.Nombre,
		Descripcion: req.Descripcion,
		TeacherID:   req.TeacherID,
	}
	if req.Orden != nil {
		c.Orden = *req.Orden
	}
	if req.Activo != nil {
		c.Activo = *req.Activo
	} else {
		c.Activo = true
	}
	if err := r.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) UpdateCurso(ctx context.Context, id string, req CursoRequest) (*Curso, error) {
	updates := map[string]interface{}{}
	if req.Nombre != "" {
		updates["nombre"] = req.Nombre
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.TeacherID != nil {
		if *req.TeacherID == "" {
			updates["teacher_id"] = nil
		} else {
			updates["teacher_id"] = *req.TeacherID
		}
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Curso{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetCurso(ctx, id)
}

func (r *Repository) DeleteCurso(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Curso{}).Error
}

// ═══════════════════════════════════════════════════════════════
// ESTUDIANTE_CURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListEstudianteCursos(ctx context.Context, estudianteID string) ([]EstudianteCurso, error) {
	var items []EstudianteCurso
	err := r.db.WithContext(ctx).Where("estudiante_id = ?", estudianteID).Find(&items).Error
	return items, err
}

func (r *Repository) ListEstudiantesByCurso(ctx context.Context, cursoID string) ([]EstudianteCursoDetail, error) {
	var items []EstudianteCursoDetail
	err := r.db.WithContext(ctx).
		Table("internal.estudiante_curso ec").
		Select("ec.id, ec.estudiante_id, ec.curso_id, ec.anio_escolar, p.display_name, p.email, ec.created_at").
		Joins("JOIN internal.profiles p ON p.id = ec.estudiante_id").
		Where("ec.curso_id = ?", cursoID).
		Order("p.display_name, p.email").
		Scan(&items).Error
	return items, err
}

func (r *Repository) EnrollStudent(ctx context.Context, req EstudianteCursoRequest) (*EstudianteCurso, error) {
	ec := EstudianteCurso{
		EstudianteID: req.EstudianteID,
		CursoID:      req.CursoID,
		AnioEscolar:  req.AnioEscolar,
	}
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "estudiante_id"}, {Name: "curso_id"}, {Name: "anio_escolar"}},
			DoNothing: true,
		}).
		Create(&ec).Error
	if err != nil {
		return nil, err
	}
	return &ec, nil
}

func (r *Repository) UnenrollStudent(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&EstudianteCurso{}).Error
}

// ═══════════════════════════════════════════════════════════════
// MATERIA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListMaterias(ctx context.Context, cursoID string, anioEscolar *string) ([]Materia, error) {
	var items []Materia
	query := r.db.WithContext(ctx).Where("curso_id = ?", cursoID)
	if anioEscolar != nil && strings.TrimSpace(*anioEscolar) != "" {
		query = query.Where("anio_escolar = ?", strings.TrimSpace(*anioEscolar))
	}
	err := query.Order("orden, nombre").Find(&items).Error
	return items, err
}

func (r *Repository) GetMateria(ctx context.Context, id string) (*Materia, error) {
	var m Materia
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) CreateMateria(ctx context.Context, req MateriaRequest, createdBy string) (*Materia, error) {
	anio := defaultAcademicYear()
	if req.AnioEscolar != nil && strings.TrimSpace(*req.AnioEscolar) != "" {
		anio = strings.TrimSpace(*req.AnioEscolar)
	}

	m := Materia{
		CursoID:      req.CursoID,
		AnioEscolar:  anio,
		Nombre:       req.Nombre,
		Descripcion:  req.Descripcion,
		ThumbnailURL: req.ThumbnailURL,
		Color:        req.Color,
		CreatedBy:    &createdBy,
	}
	if req.Orden != nil {
		m.Orden = *req.Orden
	}
	if req.Activo != nil {
		m.Activo = *req.Activo
	} else {
		m.Activo = true
	}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) UpdateMateria(ctx context.Context, id string, req MateriaRequest) (*Materia, error) {
	updates := map[string]interface{}{}
	if req.CursoID != "" {
		updates["curso_id"] = req.CursoID
	}
	if req.AnioEscolar != nil {
		updates["anio_escolar"] = strings.TrimSpace(*req.AnioEscolar)
	}
	if req.Nombre != "" {
		updates["nombre"] = req.Nombre
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.ThumbnailURL != nil {
		updates["thumbnail_url"] = *req.ThumbnailURL
	}
	if req.Color != nil {
		updates["color"] = *req.Color
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Materia{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetMateria(ctx, id)
}

func (r *Repository) DeleteMateria(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Materia{}).Error
}

// ═══════════════════════════════════════════════════════════════
// UNIDAD
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListUnidades(ctx context.Context, materiaID string) ([]Unidad, error) {
	var items []Unidad
	err := r.db.WithContext(ctx).Where("materia_id = ?", materiaID).Order("orden, nombre").Find(&items).Error
	return items, err
}

func (r *Repository) GetUnidad(ctx context.Context, id string) (*Unidad, error) {
	var u Unidad
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) CreateUnidad(ctx context.Context, req UnidadRequest, createdBy string) (*Unidad, error) {
	u := Unidad{
		MateriaID:   req.MateriaID,
		Nombre:      req.Nombre,
		Descripcion: req.Descripcion,
		CreatedBy:   &createdBy,
	}
	if req.Orden != nil {
		u.Orden = *req.Orden
	}
	if req.Activo != nil {
		u.Activo = *req.Activo
	} else {
		u.Activo = true
	}
	if err := r.db.WithContext(ctx).Create(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) UpdateUnidad(ctx context.Context, id string, req UnidadRequest) (*Unidad, error) {
	updates := map[string]interface{}{}
	if req.Nombre != "" {
		updates["nombre"] = req.Nombre
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Unidad{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetUnidad(ctx, id)
}

func (r *Repository) DeleteUnidad(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Unidad{}).Error
}

// ═══════════════════════════════════════════════════════════════
// TEMA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListTemas(ctx context.Context, unidadID string) ([]Tema, error) {
	var items []Tema
	err := r.db.WithContext(ctx).Where("unidad_id = ?", unidadID).Order("orden, nombre").Find(&items).Error
	return items, err
}

func (r *Repository) GetTema(ctx context.Context, id string) (*Tema, error) {
	var t Tema
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) CreateTema(ctx context.Context, req TemaRequest, createdBy string) (*Tema, error) {
	t := Tema{
		UnidadID:    req.UnidadID,
		Nombre:      req.Nombre,
		Descripcion: req.Descripcion,
		CreatedBy:   &createdBy,
	}
	if req.Orden != nil {
		t.Orden = *req.Orden
	}
	if req.Activo != nil {
		t.Activo = *req.Activo
	} else {
		t.Activo = true
	}
	if err := r.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) UpdateTema(ctx context.Context, id string, req TemaRequest) (*Tema, error) {
	updates := map[string]interface{}{}
	if req.Nombre != "" {
		updates["nombre"] = req.Nombre
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Tema{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetTema(ctx, id)
}

func (r *Repository) DeleteTema(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Tema{}).Error
}

// ═══════════════════════════════════════════════════════════════
// LECCION
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListLecciones(ctx context.Context, temaID string) ([]Leccion, error) {
	var items []Leccion
	err := r.db.WithContext(ctx).Where("tema_id = ?", temaID).Order("orden, titulo").Find(&items).Error
	return items, err
}

func (r *Repository) ListRecentLeccionesByUser(ctx context.Context, userID string, limit int) ([]Leccion, error) {
	if strings.TrimSpace(userID) == "" {
		return []Leccion{}, nil
	}
	if limit <= 0 {
		limit = 6
	}

	var items []Leccion
	err := r.db.WithContext(ctx).
		Table("internal.progreso p").
		Select("l.*").
		Joins("JOIN internal.leccion l ON l.id = p.leccion_id").
		Where("p.usuario_id = ?", userID).
		Order("COALESCE(p.fecha_ultimo_acceso, p.updated_at, p.created_at) DESC").
		Limit(limit).
		Scan(&items).Error

	return items, err
}

func (r *Repository) ListLatestLecciones(ctx context.Context, limit int) ([]Leccion, error) {
	if limit <= 0 {
		limit = 6
	}

	var items []Leccion
	err := r.db.WithContext(ctx).
		Order("created_at DESC").
		Limit(limit).
		Find(&items).Error

	return items, err
}

func (r *Repository) GetLeccion(ctx context.Context, id string) (*Leccion, error) {
	if strings.TrimSpace(id) == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var l Leccion
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&l).Error; err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) CreateLeccion(ctx context.Context, req LeccionRequest, createdBy string) (*Leccion, error) {
	l := Leccion{
		TemaID:       req.TemaID,
		Titulo:       req.Titulo,
		Descripcion:  req.Descripcion,
		ThumbnailURL: req.ThumbnailURL,
		CreatedBy:    &createdBy,
	}
	if req.Orden != nil {
		l.Orden = *req.Orden
	}
	if req.Activo != nil {
		l.Activo = *req.Activo
	} else {
		l.Activo = true
	}
	if err := r.db.WithContext(ctx).Create(&l).Error; err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) UpdateLeccion(ctx context.Context, id string, req LeccionRequest) (*Leccion, error) {
	updates := map[string]interface{}{}
	if req.Titulo != "" {
		updates["titulo"] = req.Titulo
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.ThumbnailURL != nil {
		updates["thumbnail_url"] = *req.ThumbnailURL
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Leccion{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetLeccion(ctx, id)
}

func (r *Repository) DeleteLeccion(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Leccion{}).Error
}

// ═══════════════════════════════════════════════════════════════
// LECCION SECCION
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListSecciones(ctx context.Context, leccionID string) ([]LeccionSeccion, error) {
	var items []LeccionSeccion
	err := r.db.WithContext(ctx).Where("leccion_id = ?", leccionID).Order("orden").Find(&items).Error
	return items, err
}

func (r *Repository) GetSeccion(ctx context.Context, id string) (*LeccionSeccion, error) {
	var s LeccionSeccion
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&s).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) CreateSeccion(ctx context.Context, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	s := LeccionSeccion{
		LeccionID:              req.LeccionID,
		Tipo:                   req.Tipo,
		RecursoID:              req.RecursoID,
		TrabajoID:              req.TrabajoID,
		PruebaID:               req.PruebaID,
		ForoID:                 req.ForoID,
		ModeloID:               req.ModeloID,
		ActividadInteractivaID: req.ActividadInteractivaID,
		PublicadoDesde:         req.PublicadoDesde,
		ProgramadoPara:         req.ProgramadoPara,
		VisibleDesde:           req.VisibleDesde,
		VisibleHasta:           req.VisibleHasta,
		AnioEscolar:            req.AnioEscolar,
		EstadoPublicacion:      "borrador",
		Visible:                true,
	}
	if req.EstadoPublicacion != nil && *req.EstadoPublicacion != "" {
		s.EstadoPublicacion = *req.EstadoPublicacion
	}
	if req.Visible != nil {
		s.Visible = *req.Visible
	}
	if req.NotaMaxima != nil {
		s.NotaMaxima = *req.NotaMaxima
	} else {
		s.NotaMaxima = 10
	}
	if req.PesoCalif != nil {
		s.PesoCalif = *req.PesoCalif
	} else {
		s.PesoCalif = 1
	}
	if req.Calificable != nil {
		s.Calificable = *req.Calificable
	} else {
		s.Calificable = req.Tipo == "prueba"
	}
	if req.Orden != nil {
		s.Orden = *req.Orden
	}
	if req.EsObligatorio != nil {
		s.EsObligatorio = *req.EsObligatorio
	} else {
		s.EsObligatorio = true
	}
	if req.Requisitos != nil {
		s.Requisitos = pq.StringArray(req.Requisitos)
	}
	if err := r.db.WithContext(ctx).Create(&s).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) UpdateSeccion(ctx context.Context, id string, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	updates := map[string]interface{}{}
	if req.Tipo != "" {
		updates["tipo"] = gorm.Expr("?::internal.tipo_seccion", req.Tipo)
	}
	// These nullable fields are always sent (allow setting to null)
	updates["recurso_id"] = req.RecursoID
	updates["trabajo_id"] = req.TrabajoID
	updates["prueba_id"] = req.PruebaID
	updates["foro_id"] = req.ForoID
	updates["modelo_id"] = req.ModeloID
	updates["actividad_interactiva_id"] = req.ActividadInteractivaID
	updates["publicado_desde"] = req.PublicadoDesde
	updates["programado_para"] = req.ProgramadoPara
	updates["visible_desde"] = req.VisibleDesde
	updates["visible_hasta"] = req.VisibleHasta
	updates["anio_escolar"] = req.AnioEscolar
	if req.EstadoPublicacion != nil {
		updates["estado_publicacion"] = gorm.Expr("?::internal.estado_publicacion_seccion", *req.EstadoPublicacion)
	}
	if req.Visible != nil {
		updates["visible"] = *req.Visible
	}
	if req.NotaMaxima != nil {
		updates["nota_maxima"] = *req.NotaMaxima
	}
	if req.PesoCalif != nil {
		updates["peso_calificacion"] = *req.PesoCalif
	}
	if req.Calificable != nil {
		updates["calificable"] = *req.Calificable
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if req.EsObligatorio != nil {
		updates["es_obligatorio"] = *req.EsObligatorio
	}
	if req.Requisitos != nil {
		updates["requisitos"] = pq.StringArray(req.Requisitos)
	}
	if err := r.db.WithContext(ctx).Model(&LeccionSeccion{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetSeccion(ctx, id)
}

func (r *Repository) PatchSeccionLifecycle(ctx context.Context, id string, req LeccionSeccionLifecyclePatchRequest) (*LeccionSeccion, error) {
	updates := map[string]interface{}{}

	if req.EstadoPublicacion.Set && req.EstadoPublicacion.Value != nil {
		updates["estado_publicacion"] = gorm.Expr("?::internal.estado_publicacion_seccion", strings.TrimSpace(*req.EstadoPublicacion.Value))
	}
	if req.PublicadoDesde.Set {
		updates["publicado_desde"] = req.PublicadoDesde.Value
	}
	if req.ProgramadoPara.Set {
		updates["programado_para"] = req.ProgramadoPara.Value
	}
	if req.Visible.Set && req.Visible.Value != nil {
		updates["visible"] = *req.Visible.Value
	}
	if req.VisibleDesde.Set {
		updates["visible_desde"] = req.VisibleDesde.Value
	}
	if req.VisibleHasta.Set {
		updates["visible_hasta"] = req.VisibleHasta.Value
	}
	if req.AnioEscolar.Set {
		if req.AnioEscolar.Value == nil {
			updates["anio_escolar"] = nil
		} else {
			trimmed := strings.TrimSpace(*req.AnioEscolar.Value)
			if trimmed == "" {
				updates["anio_escolar"] = nil
			} else {
				updates["anio_escolar"] = trimmed
			}
		}
	}

	if len(updates) == 0 {
		return r.GetSeccion(ctx, id)
	}

	if err := r.db.WithContext(ctx).Model(&LeccionSeccion{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}

	return r.GetSeccion(ctx, id)
}

func (r *Repository) DeleteSeccion(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&LeccionSeccion{}).Error
}

// ═══════════════════════════════════════════════════════════════
// FOROS
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListForosByLeccion(ctx context.Context, leccionID string) ([]Foro, error) {
	var items []Foro
	err := r.db.WithContext(ctx).Where("leccion_id = ?", leccionID).Order("created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetForo(ctx context.Context, id string) (*Foro, error) {
	var item Foro
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) CreateForo(ctx context.Context, req ForoRequest, createdBy string) (*Foro, error) {
	item := Foro{
		LeccionID:   req.LeccionID,
		Titulo:      req.Titulo,
		Descripcion: req.Descripcion,
		Activo:      true,
		CreatedBy:   &createdBy,
	}
	if req.Activo != nil {
		item.Activo = *req.Activo
	}
	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) UpdateForo(ctx context.Context, id string, req ForoRequest) (*Foro, error) {
	updates := map[string]interface{}{}
	if req.Titulo != "" {
		updates["titulo"] = req.Titulo
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Foro{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetForo(ctx, id)
}

func (r *Repository) DeleteForo(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Foro{}).Error
}

func (r *Repository) ListForoHilos(ctx context.Context, foroID string) ([]ForoHilo, error) {
	var items []ForoHilo
	err := r.db.WithContext(ctx).Where("foro_id = ?", foroID).Order("fijado DESC, created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) CreateForoHilo(ctx context.Context, foroID string, req ForoHiloRequest, createdBy string) (*ForoHilo, error) {
	item := ForoHilo{
		ForoID:    foroID,
		Titulo:    req.Titulo,
		Contenido: req.Contenido,
		ImagenURL: req.ImagenURL,
		Fijado:    false,
		Cerrado:   false,
		CreatedBy: &createdBy,
	}
	if req.Fijado != nil {
		item.Fijado = *req.Fijado
	}
	if req.Cerrado != nil {
		item.Cerrado = *req.Cerrado
	}
	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) ListForoMensajes(ctx context.Context, hiloID string) ([]ForoMensaje, error) {
	var items []ForoMensaje
	err := r.db.WithContext(ctx).Where("hilo_id = ?", hiloID).Order("created_at ASC").Find(&items).Error
	return items, err
}

func (r *Repository) CreateForoMensaje(ctx context.Context, hiloID string, req ForoMensajeRequest, createdBy string) (*ForoMensaje, error) {
	item := ForoMensaje{
		HiloID:          hiloID,
		ParentMensajeID: req.ParentMensajeID,
		Contenido:       req.Contenido,
		ImagenURL:       req.ImagenURL,
		CreatedBy:       &createdBy,
	}
	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ═══════════════════════════════════════════════════════════════
// VIDEO PROGRESO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) UpsertVideoProgreso(ctx context.Context, userID string, req UpsertVideoProgresoRequest, completado bool) (*LeccionVideoProgreso, error) {
	now := time.Now()
	item := LeccionVideoProgreso{
		UserID:           userID,
		LeccionSeccionID: req.LeccionSeccionID,
		YouTubeVideoID:   req.YouTubeVideoID,
		Completado:       completado,
		LastSeenAt:       now,
	}
	if req.WatchedSeconds != nil {
		item.WatchedSeconds = *req.WatchedSeconds
	}
	if req.TotalSeconds != nil {
		item.TotalSeconds = req.TotalSeconds
	}
	if req.PorcentajeVisto != nil {
		item.PorcentajeVisto = *req.PorcentajeVisto
	}
	if req.FirstSeenAt != nil {
		item.FirstSeenAt = req.FirstSeenAt
	}
	if req.LastSeenAt != nil {
		item.LastSeenAt = *req.LastSeenAt
	}

	updates := map[string]interface{}{
		"watched_seconds":  item.WatchedSeconds,
		"total_seconds":    item.TotalSeconds,
		"porcentaje_visto": item.PorcentajeVisto,
		"completado":       item.Completado,
		"last_seen_at":     item.LastSeenAt,
	}
	if req.FirstSeenAt != nil {
		updates["first_seen_at"] = *req.FirstSeenAt
	}

	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "leccion_seccion_id"}, {Name: "youtube_video_id"}},
		DoUpdates: clause.Assignments(updates),
	}).Create(&item).Error; err != nil {
		return nil, err
	}

	var out LeccionVideoProgreso
	if err := r.db.WithContext(ctx).
		Where("user_id = ? AND leccion_seccion_id = ? AND youtube_video_id = ?", userID, req.LeccionSeccionID, req.YouTubeVideoID).
		First(&out).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *Repository) ListVideoProgresoByLeccion(ctx context.Context, userID, leccionID string) ([]LeccionVideoProgreso, error) {
	var items []LeccionVideoProgreso
	err := r.db.WithContext(ctx).
		Table("internal.leccion_video_progreso vp").
		Select("vp.*").
		Joins("JOIN internal.leccion_seccion ls ON ls.id = vp.leccion_seccion_id").
		Where("vp.user_id = ? AND ls.leccion_id = ?", userID, leccionID).
		Order("vp.updated_at DESC").
		Scan(&items).Error
	return items, err
}

// ═══════════════════════════════════════════════════════════════
// GATING PDF
// ═══════════════════════════════════════════════════════════════

func (r *Repository) UpsertSeccionGatingPDF(ctx context.Context, seccionID, actorID string, req UpsertSeccionGatingPDFRequest) (*LeccionSeccionGatingPDF, error) {
	item := LeccionSeccionGatingPDF{
		LeccionSeccionID:       seccionID,
		Habilitado:             false,
		PuntajeMinimo:          0,
		RequiereResponderTodas: true,
		CreatedBy:              &actorID,
	}
	if req.Habilitado != nil {
		item.Habilitado = *req.Habilitado
	}
	if req.SeccionPreguntasID != nil {
		item.SeccionPreguntasID = req.SeccionPreguntasID
	}
	if req.PuntajeMinimo != nil {
		item.PuntajeMinimo = *req.PuntajeMinimo
	}
	if req.RequiereResponderTodas != nil {
		item.RequiereResponderTodas = *req.RequiereResponderTodas
	}

	updates := map[string]interface{}{
		"habilitado":               item.Habilitado,
		"seccion_preguntas_id":     item.SeccionPreguntasID,
		"puntaje_minimo":           item.PuntajeMinimo,
		"requiere_responder_todas": item.RequiereResponderTodas,
	}

	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "leccion_seccion_id"}},
		DoUpdates: clause.Assignments(updates),
	}).Create(&item).Error; err != nil {
		return nil, err
	}

	return r.GetSeccionGatingPDF(ctx, seccionID)
}

func (r *Repository) GetSeccionGatingPDF(ctx context.Context, seccionID string) (*LeccionSeccionGatingPDF, error) {
	var item LeccionSeccionGatingPDF
	if err := r.db.WithContext(ctx).Where("leccion_seccion_id = ?", seccionID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ═══════════════════════════════════════════════════════════════
// MATERIA SEGUIMIENTO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListSeguimientos(ctx context.Context, usuarioID string) ([]MateriaSeguimiento, error) {
	var items []MateriaSeguimiento
	err := r.db.WithContext(ctx).Where("usuario_id = ?", usuarioID).Find(&items).Error
	return items, err
}

func (r *Repository) SeguirMateria(ctx context.Context, usuarioID, materiaID string) (*MateriaSeguimiento, error) {
	ms := MateriaSeguimiento{
		UsuarioID:        usuarioID,
		MateriaID:        materiaID,
		FechaSeguimiento: time.Now(),
	}
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "usuario_id"}, {Name: "materia_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"fecha_seguimiento"}),
		}).
		Create(&ms).Error
	if err != nil {
		return nil, err
	}
	return &ms, nil
}

func (r *Repository) DejarDeSeguirMateria(ctx context.Context, usuarioID, materiaID string) error {
	return r.db.WithContext(ctx).
		Where("usuario_id = ? AND materia_id = ?", usuarioID, materiaID).
		Delete(&MateriaSeguimiento{}).Error
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURACION + DOCENTE-MATERIA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) GetConfiguracionAcademica(ctx context.Context) (*ConfiguracionAcademica, error) {
	var cfg ConfiguracionAcademica
	if err := r.db.WithContext(ctx).Where("id = 1").First(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (r *Repository) GetAnioEscolarActivo(ctx context.Context) (string, error) {
	cfg, err := r.GetConfiguracionAcademica(ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || isMissingRelationError(err, "internal.configuracion_academica") {
			return defaultAcademicYear(), nil
		}
		return "", err
	}
	anio := strings.TrimSpace(cfg.AnioEscolarActivo)
	if anio == "" {
		return defaultAcademicYear(), nil
	}
	return anio, nil
}

func (r *Repository) IsTeacherAssignedToCurso(ctx context.Context, teacherID, cursoID string) (bool, error) {
	anioActivo, err := r.GetAnioEscolarActivo(ctx)
	if err != nil {
		return false, err
	}

	var count int64
	err = r.db.WithContext(ctx).
		Table("internal.docente_materia_asignacion dma").
		Where("dma.docente_id = ? AND dma.curso_id = ? AND dma.anio_escolar = ? AND dma.activo = TRUE", teacherID, cursoID, anioActivo).
		Count(&count).Error
	if err != nil && !isMissingRelationError(err, "internal.docente_materia_asignacion") {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Legacy fallback while the migration settles.
	count = 0
	err = r.db.WithContext(ctx).
		Table("internal.curso c").
		Where("c.id = ? AND c.teacher_id = ?", cursoID, teacherID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *Repository) IsTeacherProfile(ctx context.Context, profileID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("internal.profiles p").
		Where("p.id = ? AND p.role = 'teacher'", profileID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *Repository) ListDocenteMateriaAsignaciones(ctx context.Context, filter DocenteMateriaAsignacionFilter) ([]DocenteMateriaAsignacion, error) {
	anio := ""
	if filter.AnioEscolar != nil {
		anio = strings.TrimSpace(*filter.AnioEscolar)
	}
	if anio == "" {
		var err error
		anio, err = r.GetAnioEscolarActivo(ctx)
		if err != nil {
			return nil, err
		}
	}

	query := r.db.WithContext(ctx).
		Table("internal.docente_materia_asignacion dma").
		Select(`
			dma.id,
			dma.docente_id,
			dma.materia_id,
			dma.curso_id,
			dma.anio_escolar,
			dma.activo,
			dma.created_by,
			dma.created_at,
			dma.updated_at,
			p.display_name AS docente_nombre,
			p.email AS docente_email,
			m.nombre AS materia_nombre,
			c.nombre AS curso_nombre
		`).
		Joins("JOIN internal.profiles p ON p.id = dma.docente_id").
		Joins("JOIN internal.materia m ON m.id = dma.materia_id").
		Joins("JOIN internal.curso c ON c.id = dma.curso_id").
		Where("dma.anio_escolar = ?", anio)

	if filter.DocenteID != nil && strings.TrimSpace(*filter.DocenteID) != "" {
		query = query.Where("dma.docente_id = ?", strings.TrimSpace(*filter.DocenteID))
	}
	if filter.CursoID != nil && strings.TrimSpace(*filter.CursoID) != "" {
		query = query.Where("dma.curso_id = ?", strings.TrimSpace(*filter.CursoID))
	}
	if filter.MateriaID != nil && strings.TrimSpace(*filter.MateriaID) != "" {
		query = query.Where("dma.materia_id = ?", strings.TrimSpace(*filter.MateriaID))
	}
	if filter.SoloActivas {
		query = query.Where("dma.activo = TRUE")
	}

	var items []DocenteMateriaAsignacion
	err := query.Order("c.orden ASC, m.orden ASC, m.nombre ASC").Scan(&items).Error
	return items, err
}

func (r *Repository) GetDocenteMateriaAsignacion(ctx context.Context, id string) (*DocenteMateriaAsignacion, error) {
	var item DocenteMateriaAsignacion
	err := r.db.WithContext(ctx).
		Table("internal.docente_materia_asignacion dma").
		Select(`
			dma.id,
			dma.docente_id,
			dma.materia_id,
			dma.curso_id,
			dma.anio_escolar,
			dma.activo,
			dma.created_by,
			dma.created_at,
			dma.updated_at,
			p.display_name AS docente_nombre,
			p.email AS docente_email,
			m.nombre AS materia_nombre,
			c.nombre AS curso_nombre
		`).
		Joins("JOIN internal.profiles p ON p.id = dma.docente_id").
		Joins("JOIN internal.materia m ON m.id = dma.materia_id").
		Joins("JOIN internal.curso c ON c.id = dma.curso_id").
		Where("dma.id = ?", id).
		Take(&item).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) CreateDocenteMateriaAsignacion(ctx context.Context, req DocenteMateriaAsignacionCreateRequest, createdBy string) (*DocenteMateriaAsignacion, error) {
	materia, err := r.GetMateria(ctx, req.MateriaID)
	if err != nil {
		return nil, err
	}

	item := DocenteMateriaAsignacion{
		DocenteID:   strings.TrimSpace(req.DocenteID),
		MateriaID:   strings.TrimSpace(req.MateriaID),
		CursoID:     materia.CursoID,
		AnioEscolar: strings.TrimSpace(req.AnioEscolar),
		Activo:      true,
		CreatedBy:   &createdBy,
	}
	if req.Activo != nil {
		item.Activo = *req.Activo
	}

	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return r.GetDocenteMateriaAsignacion(ctx, item.ID)
}

func (r *Repository) UpdateDocenteMateriaAsignacion(ctx context.Context, id string, req DocenteMateriaAsignacionUpdateRequest) (*DocenteMateriaAsignacion, error) {
	updates := map[string]interface{}{}

	if req.DocenteID != nil {
		updates["docente_id"] = strings.TrimSpace(*req.DocenteID)
	}
	if req.AnioEscolar != nil {
		updates["anio_escolar"] = strings.TrimSpace(*req.AnioEscolar)
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}

	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&DocenteMateriaAsignacion{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}

	return r.GetDocenteMateriaAsignacion(ctx, id)
}

func (r *Repository) DeleteDocenteMateriaAsignacion(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&DocenteMateriaAsignacion{}).Error
}

func (r *Repository) ListMisCursosDocente(ctx context.Context, docenteID string) ([]MisCursoDocente, error) {
	anioActivo, err := r.GetAnioEscolarActivo(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT
			dma.id AS asignacion_id,
			dma.docente_id,
			dma.materia_id,
			m.nombre AS materia_nombre,
			dma.curso_id,
			c.nombre AS curso_nombre,
			dma.anio_escolar,
			COALESCE(est.total_estudiantes, 0) AS total_estudiantes,
			COALESCE(lec.total_lecciones, 0) AS total_lecciones,
			COALESCE(tr.total_trabajos, 0) AS total_trabajos
		FROM internal.docente_materia_asignacion dma
		JOIN internal.materia m ON m.id = dma.materia_id
		JOIN internal.curso c ON c.id = dma.curso_id
		LEFT JOIN (
			SELECT ec.curso_id, COUNT(DISTINCT ec.estudiante_id)::bigint AS total_estudiantes
			FROM internal.estudiante_curso ec
			GROUP BY ec.curso_id
		) est ON est.curso_id = dma.curso_id
		LEFT JOIN (
			SELECT ma.id AS materia_id, COUNT(DISTINCT l.id)::bigint AS total_lecciones
			FROM internal.materia ma
			LEFT JOIN internal.unidad u ON u.materia_id = ma.id
			LEFT JOIN internal.tema t ON t.unidad_id = u.id
			LEFT JOIN internal.leccion l ON l.tema_id = t.id
			GROUP BY ma.id
		) lec ON lec.materia_id = dma.materia_id
		LEFT JOIN (
			SELECT ma.id AS materia_id, COUNT(DISTINCT trb.id)::bigint AS total_trabajos
			FROM internal.materia ma
			LEFT JOIN internal.unidad u ON u.materia_id = ma.id
			LEFT JOIN internal.tema t ON t.unidad_id = u.id
			LEFT JOIN internal.leccion l ON l.tema_id = t.id
			LEFT JOIN internal.trabajo trb ON trb.leccion_id = l.id
			GROUP BY ma.id
		) tr ON tr.materia_id = dma.materia_id
		WHERE dma.docente_id = ?
		  AND dma.anio_escolar = ?
		  AND dma.activo = TRUE
		ORDER BY c.orden ASC, m.orden ASC, m.nombre ASC
	`

	var items []MisCursoDocente
	err = r.db.WithContext(ctx).Raw(query, docenteID, anioActivo).Scan(&items).Error
	if err != nil {
		if !isMissingRelationError(err, "internal.docente_materia_asignacion") {
			return nil, err
		}

		legacyQuery := `
			SELECT
				m.id AS asignacion_id,
				c.teacher_id AS docente_id,
				m.id AS materia_id,
				m.nombre AS materia_nombre,
				c.id AS curso_id,
				c.nombre AS curso_nombre,
				? AS anio_escolar,
				COALESCE(est.total_estudiantes, 0) AS total_estudiantes,
				COALESCE(lec.total_lecciones, 0) AS total_lecciones,
				COALESCE(tr.total_trabajos, 0) AS total_trabajos
			FROM internal.curso c
			JOIN internal.materia m ON m.curso_id = c.id
			LEFT JOIN (
				SELECT ec.curso_id, COUNT(DISTINCT ec.estudiante_id)::bigint AS total_estudiantes
				FROM internal.estudiante_curso ec
				GROUP BY ec.curso_id
			) est ON est.curso_id = c.id
			LEFT JOIN (
				SELECT ma.id AS materia_id, COUNT(DISTINCT l.id)::bigint AS total_lecciones
				FROM internal.materia ma
				LEFT JOIN internal.unidad u ON u.materia_id = ma.id
				LEFT JOIN internal.tema t ON t.unidad_id = u.id
				LEFT JOIN internal.leccion l ON l.tema_id = t.id
				GROUP BY ma.id
			) lec ON lec.materia_id = m.id
			LEFT JOIN (
				SELECT ma.id AS materia_id, COUNT(DISTINCT trb.id)::bigint AS total_trabajos
				FROM internal.materia ma
				LEFT JOIN internal.unidad u ON u.materia_id = ma.id
				LEFT JOIN internal.tema t ON t.unidad_id = u.id
				LEFT JOIN internal.leccion l ON l.tema_id = t.id
				LEFT JOIN internal.trabajo trb ON trb.leccion_id = l.id
				GROUP BY ma.id
			) tr ON tr.materia_id = m.id
			WHERE c.teacher_id = ?
			ORDER BY c.orden ASC, m.orden ASC, m.nombre ASC
		`

		err = r.db.WithContext(ctx).Raw(legacyQuery, anioActivo, docenteID).Scan(&items).Error
		if err != nil {
			return nil, err
		}
	}
	return items, err
}

func (r *Repository) ListHorariosDocente(ctx context.Context, docenteID string) ([]DocenteMateriaHorarioDetalle, error) {
	anioActivo, err := r.GetAnioEscolarActivo(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT
			h.id,
			h.asignacion_id,
			a.docente_id,
			a.materia_id,
			m.nombre AS materia_nombre,
			a.curso_id,
			c.nombre AS curso_nombre,
			a.anio_escolar,
			h.dia_semana,
			to_char(h.hora_inicio, 'HH24:MI:SS') AS hora_inicio,
			to_char(h.hora_fin, 'HH24:MI:SS') AS hora_fin,
			h.aula,
			h.activo
		FROM internal.docente_materia_horario h
		JOIN internal.docente_materia_asignacion a ON a.id = h.asignacion_id
		JOIN internal.materia m ON m.id = a.materia_id
		JOIN internal.curso c ON c.id = a.curso_id
		WHERE a.docente_id = ?
		  AND a.anio_escolar = ?
		  AND a.activo = TRUE
		  AND h.activo = TRUE
		ORDER BY h.dia_semana ASC, h.hora_inicio ASC
	`

	var items []DocenteMateriaHorarioDetalle
	err = r.db.WithContext(ctx).Raw(query, docenteID, anioActivo).Scan(&items).Error
	if err != nil && (isMissingRelationError(err, "internal.docente_materia_horario") || isMissingRelationError(err, "internal.docente_materia_asignacion")) {
		return []DocenteMateriaHorarioDetalle{}, nil
	}
	return items, err
}

func defaultAcademicYear() string {
	year := time.Now().Year()
	return fmt.Sprintf("%d-%d", year, year+1)
}

func isMissingRelationError(err error, relation string) bool {
	if err == nil {
		return false
	}
	errLower := strings.ToLower(err.Error())
	if strings.Contains(errLower, "sqlstate 42p01") {
		if strings.TrimSpace(relation) == "" {
			return true
		}
		return strings.Contains(errLower, strings.ToLower(relation))
	}
	if strings.TrimSpace(relation) == "" {
		return strings.Contains(errLower, "does not exist")
	}
	return strings.Contains(errLower, fmt.Sprintf("relation \"%s\" does not exist", strings.ToLower(relation)))
}

func (r *Repository) ListHorariosByAsignacion(ctx context.Context, asignacionID string) ([]DocenteMateriaHorarioDetalle, error) {
	query := `
		SELECT
			h.id,
			h.asignacion_id,
			a.docente_id,
			a.materia_id,
			m.nombre AS materia_nombre,
			a.curso_id,
			c.nombre AS curso_nombre,
			a.anio_escolar,
			h.dia_semana,
			to_char(h.hora_inicio, 'HH24:MI:SS') AS hora_inicio,
			to_char(h.hora_fin, 'HH24:MI:SS') AS hora_fin,
			h.aula,
			h.activo
		FROM internal.docente_materia_horario h
		JOIN internal.docente_materia_asignacion a ON a.id = h.asignacion_id
		JOIN internal.materia m ON m.id = a.materia_id
		JOIN internal.curso c ON c.id = a.curso_id
		WHERE h.asignacion_id = ?
		ORDER BY h.dia_semana ASC, h.hora_inicio ASC
	`

	var items []DocenteMateriaHorarioDetalle
	err := r.db.WithContext(ctx).Raw(query, asignacionID).Scan(&items).Error
	return items, err
}

func (r *Repository) GetHorarioAsignacion(ctx context.Context, horarioID string) (*DocenteMateriaHorario, error) {
	var item DocenteMateriaHorario
	if err := r.db.WithContext(ctx).Where("id = ?", horarioID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) FindHorarioConflictoDocente(ctx context.Context, docenteID, anioEscolar string, diaSemana int, horaInicio, horaFin string, excludeHorarioID *string) (*HorarioConflictoDocente, error) {
	query := r.db.WithContext(ctx).
		Table("internal.docente_materia_horario h").
		Select(`
			h.id AS horario_id,
			h.asignacion_id,
			m.nombre AS materia_nombre,
			c.nombre AS curso_nombre,
			h.dia_semana,
			to_char(h.hora_inicio, 'HH24:MI:SS') AS hora_inicio,
			to_char(h.hora_fin, 'HH24:MI:SS') AS hora_fin
		`).
		Joins("JOIN internal.docente_materia_asignacion a ON a.id = h.asignacion_id").
		Joins("JOIN internal.materia m ON m.id = a.materia_id").
		Joins("JOIN internal.curso c ON c.id = a.curso_id").
		Where("a.docente_id = ? AND a.anio_escolar = ? AND a.activo = TRUE AND h.activo = TRUE", docenteID, anioEscolar).
		Where("h.dia_semana = ?", diaSemana).
		Where("(?::time < h.hora_fin AND ?::time > h.hora_inicio)", horaInicio, horaFin)

	if excludeHorarioID != nil && strings.TrimSpace(*excludeHorarioID) != "" {
		query = query.Where("h.id <> ?", strings.TrimSpace(*excludeHorarioID))
	}

	var conflict HorarioConflictoDocente
	err := query.Take(&conflict).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &conflict, nil
}

func (r *Repository) CreateHorarioAsignacion(ctx context.Context, asignacionID string, req DocenteMateriaHorarioRequest, createdBy string) (*DocenteMateriaHorario, error) {
	item := DocenteMateriaHorario{
		AsignacionID: strings.TrimSpace(asignacionID),
		DiaSemana:    req.DiaSemana,
		HoraInicio:   req.HoraInicio,
		HoraFin:      req.HoraFin,
		Aula:         req.Aula,
		Activo:       true,
		CreatedBy:    &createdBy,
	}
	if req.Activo != nil {
		item.Activo = *req.Activo
	}

	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return r.GetHorarioAsignacion(ctx, item.ID)
}

func (r *Repository) UpdateHorarioAsignacion(ctx context.Context, horarioID string, req DocenteMateriaHorarioUpdateRequest) (*DocenteMateriaHorario, error) {
	updates := map[string]interface{}{}

	if req.DiaSemana != nil {
		updates["dia_semana"] = *req.DiaSemana
	}
	if req.HoraInicio != nil {
		updates["hora_inicio"] = strings.TrimSpace(*req.HoraInicio)
	}
	if req.HoraFin != nil {
		updates["hora_fin"] = strings.TrimSpace(*req.HoraFin)
	}
	if req.Aula != nil {
		aula := strings.TrimSpace(*req.Aula)
		if aula == "" {
			updates["aula"] = nil
		} else {
			updates["aula"] = aula
		}
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}

	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&DocenteMateriaHorario{}).Where("id = ?", horarioID).Updates(updates).Error; err != nil {
			return nil, err
		}
	}

	return r.GetHorarioAsignacion(ctx, horarioID)
}

func (r *Repository) DeleteHorarioAsignacion(ctx context.Context, horarioID string) error {
	return r.db.WithContext(ctx).Where("id = ?", horarioID).Delete(&DocenteMateriaHorario{}).Error
}

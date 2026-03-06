package academic

import (
	"context"
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

func (r *Repository) ListMaterias(ctx context.Context, cursoID string) ([]Materia, error) {
	var items []Materia
	err := r.db.WithContext(ctx).Where("curso_id = ?", cursoID).Order("orden, nombre").Find(&items).Error
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
	m := Materia{
		CursoID:      req.CursoID,
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

func (r *Repository) GetLeccion(ctx context.Context, id string) (*Leccion, error) {
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
		LeccionID: req.LeccionID,
		Tipo:      req.Tipo,
		RecursoID: req.RecursoID,
		PruebaID:  req.PruebaID,
		ModeloID:  req.ModeloID,
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
	updates["prueba_id"] = req.PruebaID
	updates["modelo_id"] = req.ModeloID
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

func (r *Repository) DeleteSeccion(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&LeccionSeccion{}).Error
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

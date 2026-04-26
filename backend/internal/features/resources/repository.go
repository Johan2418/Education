package resources

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
// RECURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListRecursos(ctx context.Context) ([]Recurso, error) {
	var items []Recurso
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetRecurso(ctx context.Context, id string) (*Recurso, error) {
	var rc Recurso
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&rc).Error; err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) CreateRecurso(ctx context.Context, req RecursoRequest, createdBy string) (*Recurso, error) {
	rc := Recurso{
		Titulo:      req.Titulo,
		Descripcion: req.Descripcion,
		Tipo:        req.Tipo,
		ArchivoURL:  req.ArchivoURL,
		TextoHTML:   req.TextoHTML,
		CreatedBy:   &createdBy,
	}
	if req.Tags != nil {
		rc.Tags = pq.StringArray(req.Tags)
	}
	if req.EsPublico != nil {
		rc.EsPublico = *req.EsPublico
	} else {
		rc.EsPublico = true
	}
	if err := r.db.WithContext(ctx).Create(&rc).Error; err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) UpdateRecurso(ctx context.Context, id string, req RecursoRequest) (*Recurso, error) {
	updates := map[string]interface{}{}
	if req.Titulo != "" {
		updates["titulo"] = req.Titulo
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.Tipo != "" {
		updates["tipo"] = gorm.Expr("?::internal.tipo_recurso", req.Tipo)
	}
	if req.ArchivoURL != nil {
		updates["archivo_url"] = *req.ArchivoURL
	}
	if req.TextoHTML != nil {
		updates["texto_html"] = *req.TextoHTML
	}
	if req.Tags != nil {
		updates["tags"] = pq.StringArray(req.Tags)
	}
	if req.EsPublico != nil {
		updates["es_publico"] = *req.EsPublico
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Recurso{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetRecurso(ctx, id)
}

func (r *Repository) DeleteRecurso(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Recurso{}).Error
}

// ═══════════════════════════════════════════════════════════════
// RECURSO PERSONAL
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListRecursosPersonales(ctx context.Context, ownerID string, isAdmin bool, q ListRecursosPersonalesQuery) ([]RecursoPersonal, error) {
	query := r.db.WithContext(ctx).Model(&RecursoPersonal{}).Order("created_at DESC")
	if !isAdmin {
		query = query.Where("owner_teacher_id = ?", ownerID)
	}
	if q.Q != "" {
		like := "%" + q.Q + "%"
		query = query.Where("titulo ILIKE ? OR COALESCE(descripcion, '') ILIKE ?", like, like)
	}
	if q.Tipo != "" {
		query = query.Where("tipo = ?::internal.tipo_recurso_personal", q.Tipo)
	}
	if q.Activo != nil {
		query = query.Where("activo = ?", *q.Activo)
	}

	var items []RecursoPersonal
	err := query.Find(&items).Error
	return items, err
}

func (r *Repository) GetRecursoPersonal(ctx context.Context, id string) (*RecursoPersonal, error) {
	var item RecursoPersonal
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) CreateRecursoPersonal(ctx context.Context, req RecursoPersonalRequest, ownerTeacherID string) (*RecursoPersonal, error) {
	item := RecursoPersonal{
		OwnerTeacherID: ownerTeacherID,
		Titulo:         req.Titulo,
		Descripcion:    req.Descripcion,
		Tipo:           req.Tipo,
		URL:            req.URL,
		HTMLContenido:  req.HTMLContenido,
		TextoContenido: req.TextoContenido,
		Tags:           pq.StringArray(req.Tags),
		Activo:         true,
	}
	if req.Activo != nil {
		item.Activo = *req.Activo
	}

	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) UpdateRecursoPersonal(ctx context.Context, id string, req RecursoPersonalRequest) (*RecursoPersonal, error) {
	updates := map[string]interface{}{
		"titulo":          req.Titulo,
		"descripcion":     req.Descripcion,
		"tipo":            gorm.Expr("?::internal.tipo_recurso_personal", req.Tipo),
		"url":             req.URL,
		"html_contenido":  req.HTMLContenido,
		"texto_contenido": req.TextoContenido,
		"tags":            pq.StringArray(req.Tags),
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}

	if err := r.db.WithContext(ctx).Model(&RecursoPersonal{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetRecursoPersonal(ctx, id)
}

func (r *Repository) DeleteRecursoPersonal(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&RecursoPersonal{}).Error
}

func (r *Repository) ListMateriaRecursosPersonales(ctx context.Context, materiaID, ownerID string, isAdmin bool) ([]RecursoPersonal, error) {
	query := r.db.WithContext(ctx).
		Table("internal.recurso_personal").
		Select("internal.recurso_personal.*").
		Joins("JOIN internal.materia_recurso_personal mrp ON mrp.recurso_personal_id = internal.recurso_personal.id").
		Where("mrp.materia_id = ?", materiaID).
		Order("internal.recurso_personal.created_at DESC")
	if !isAdmin {
		query = query.Where("internal.recurso_personal.owner_teacher_id = ?", ownerID)
	}

	var items []RecursoPersonal
	err := query.Find(&items).Error
	return items, err
}

func (r *Repository) ListSeccionRecursosPersonales(ctx context.Context, seccionID, ownerID string, isAdmin bool) ([]RecursoPersonal, error) {
	query := r.db.WithContext(ctx).
		Table("internal.recurso_personal").
		Select("internal.recurso_personal.*").
		Joins("JOIN internal.seccion_recurso_personal srp ON srp.recurso_personal_id = internal.recurso_personal.id").
		Where("srp.seccion_id = ?", seccionID).
		Order("internal.recurso_personal.created_at DESC")
	if !isAdmin {
		query = query.Where("internal.recurso_personal.owner_teacher_id = ?", ownerID)
	}

	var items []RecursoPersonal
	err := query.Find(&items).Error
	return items, err
}

func (r *Repository) ListTrabajoRecursosPersonales(ctx context.Context, trabajoID, ownerID string, isAdmin bool) ([]RecursoPersonal, error) {
	query := r.db.WithContext(ctx).
		Table("internal.recurso_personal").
		Select("internal.recurso_personal.*").
		Joins("JOIN internal.trabajo_recurso_personal trp ON trp.recurso_personal_id = internal.recurso_personal.id").
		Where("trp.trabajo_id = ?", trabajoID).
		Order("internal.recurso_personal.created_at DESC")
	if !isAdmin {
		query = query.Where("internal.recurso_personal.owner_teacher_id = ?", ownerID)
	}

	var items []RecursoPersonal
	err := query.Find(&items).Error
	return items, err
}

func (r *Repository) AttachRecursoPersonalToMateria(ctx context.Context, materiaID, recursoPersonalID, createdBy string) error {
	row := map[string]interface{}{
		"materia_id":          materiaID,
		"recurso_personal_id": recursoPersonalID,
		"created_by":          createdBy,
	}
	return r.db.WithContext(ctx).
		Table("internal.materia_recurso_personal").
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "materia_id"}, {Name: "recurso_personal_id"}},
			DoNothing: true,
		}).
		Create(row).Error
}

func (r *Repository) DetachRecursoPersonalFromMateria(ctx context.Context, materiaID, recursoPersonalID string) error {
	return r.db.WithContext(ctx).
		Table("internal.materia_recurso_personal").
		Where("materia_id = ? AND recurso_personal_id = ?", materiaID, recursoPersonalID).
		Delete(nil).Error
}

func (r *Repository) AttachRecursoPersonalToSeccion(ctx context.Context, seccionID, recursoPersonalID, createdBy string) error {
	row := map[string]interface{}{
		"seccion_id":          seccionID,
		"recurso_personal_id": recursoPersonalID,
		"created_by":          createdBy,
	}
	return r.db.WithContext(ctx).
		Table("internal.seccion_recurso_personal").
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "seccion_id"}, {Name: "recurso_personal_id"}},
			DoNothing: true,
		}).
		Create(row).Error
}

func (r *Repository) DetachRecursoPersonalFromSeccion(ctx context.Context, seccionID, recursoPersonalID string) error {
	return r.db.WithContext(ctx).
		Table("internal.seccion_recurso_personal").
		Where("seccion_id = ? AND recurso_personal_id = ?", seccionID, recursoPersonalID).
		Delete(nil).Error
}

func (r *Repository) AttachRecursoPersonalToTrabajo(ctx context.Context, trabajoID, recursoPersonalID, createdBy string) error {
	row := map[string]interface{}{
		"trabajo_id":          trabajoID,
		"recurso_personal_id": recursoPersonalID,
		"created_by":          createdBy,
	}
	return r.db.WithContext(ctx).
		Table("internal.trabajo_recurso_personal").
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "trabajo_id"}, {Name: "recurso_personal_id"}},
			DoNothing: true,
		}).
		Create(row).Error
}

func (r *Repository) DetachRecursoPersonalFromTrabajo(ctx context.Context, trabajoID, recursoPersonalID string) error {
	return r.db.WithContext(ctx).
		Table("internal.trabajo_recurso_personal").
		Where("trabajo_id = ? AND recurso_personal_id = ?", trabajoID, recursoPersonalID).
		Delete(nil).Error
}

func (r *Repository) IsTeacherOfMateria(ctx context.Context, teacherID, materiaID string) (bool, error) {
	anioActivo, err := r.getActiveAcademicYear(ctx)
	if err != nil {
		return false, err
	}

	var count int64
	err = r.db.WithContext(ctx).
		Table("internal.docente_materia_asignacion dma").
		Where("dma.docente_id = ? AND dma.materia_id = ? AND dma.anio_escolar = ? AND dma.activo = TRUE", teacherID, materiaID, anioActivo).
		Count(&count).Error
	if err != nil && !isMissingRelationError(err, "internal.docente_materia_asignacion") {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Legacy fallback while all environments migrate to subject-level assignments.
	count = 0
	err = r.db.WithContext(ctx).
		Table("internal.materia m").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("m.id = ? AND c.teacher_id = ?", materiaID, teacherID).
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) IsTeacherOfSeccion(ctx context.Context, teacherID, seccionID string) (bool, error) {
	anioActivo, err := r.getActiveAcademicYear(ctx)
	if err != nil {
		return false, err
	}

	var count int64
	err = r.db.WithContext(ctx).
		Table("internal.leccion_seccion ls").
		Joins("JOIN internal.leccion l ON l.id = ls.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.docente_materia_asignacion dma ON dma.materia_id = m.id").
		Where("ls.id = ? AND dma.docente_id = ? AND dma.anio_escolar = ? AND dma.activo = TRUE", seccionID, teacherID, anioActivo).
		Count(&count).Error
	if err != nil && !isMissingRelationError(err, "internal.docente_materia_asignacion") {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Legacy fallback while all environments migrate to subject-level assignments.
	count = 0
	err = r.db.WithContext(ctx).
		Table("internal.leccion_seccion ls").
		Joins("JOIN internal.leccion l ON l.id = ls.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("ls.id = ? AND c.teacher_id = ?", seccionID, teacherID).
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) IsTeacherOfTrabajo(ctx context.Context, teacherID, trabajoID string) (bool, error) {
	anioActivo, err := r.getActiveAcademicYear(ctx)
	if err != nil {
		return false, err
	}

	var count int64
	err = r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.docente_materia_asignacion dma ON dma.materia_id = m.id").
		Where("tr.id = ? AND dma.docente_id = ? AND dma.anio_escolar = ? AND dma.activo = TRUE", trabajoID, teacherID, anioActivo).
		Count(&count).Error
	if err != nil && !isMissingRelationError(err, "internal.docente_materia_asignacion") {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Legacy fallback while all environments migrate to subject-level assignments.
	count = 0
	err = r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("tr.id = ? AND c.teacher_id = ?", trabajoID, teacherID).
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) getActiveAcademicYear(ctx context.Context) (string, error) {
	type configRow struct {
		AnioEscolarActivo string `gorm:"column:anio_escolar_activo"`
	}

	var row configRow
	err := r.db.WithContext(ctx).
		Table("internal.configuracion_academica").
		Select("anio_escolar_activo").
		Where("id = 1").
		Take(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || isMissingRelationError(err, "internal.configuracion_academica") {
			return defaultAcademicYear(), nil
		}
		return "", err
	}

	anio := strings.TrimSpace(row.AnioEscolarActivo)
	if anio == "" {
		return defaultAcademicYear(), nil
	}
	return anio, nil
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

// ═══════════════════════════════════════════════════════════════
// MODELO RA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListModelos(ctx context.Context) ([]ModeloRA, error) {
	var items []ModeloRA
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetModelo(ctx context.Context, id string) (*ModeloRA, error) {
	var m ModeloRA
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) CreateModelo(ctx context.Context, req ModeloRARequest, createdBy string) (*ModeloRA, error) {
	m := ModeloRA{
		NombreModelo:    req.NombreModelo,
		ArchivoURL:      req.ArchivoURL,
		Tipo:            req.Tipo,
		MoleculeFormula: req.MoleculeFormula,
		Categoria:       req.Categoria,
		CreatedBy:       &createdBy,
	}
	if req.Keywords != nil {
		m.Keywords = pq.StringArray(req.Keywords)
	}
	if req.EsPublico != nil {
		m.EsPublico = *req.EsPublico
	} else {
		m.EsPublico = true
	}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) UpdateModelo(ctx context.Context, id string, req ModeloRARequest) (*ModeloRA, error) {
	updates := map[string]interface{}{}
	if req.NombreModelo != "" {
		updates["nombre_modelo"] = req.NombreModelo
	}
	if req.ArchivoURL != nil {
		updates["archivo_url"] = *req.ArchivoURL
	}
	if req.Tipo != nil {
		updates["tipo"] = *req.Tipo
	}
	if req.Keywords != nil {
		updates["keywords"] = pq.StringArray(req.Keywords)
	}
	if req.MoleculeFormula != nil {
		updates["molecule_formula"] = *req.MoleculeFormula
	}
	if req.Categoria != nil {
		updates["categoria"] = *req.Categoria
	}
	if req.EsPublico != nil {
		updates["es_publico"] = *req.EsPublico
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&ModeloRA{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetModelo(ctx, id)
}

func (r *Repository) DeleteModelo(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&ModeloRA{}).Error
}

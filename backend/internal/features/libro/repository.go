package libro

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) IsTeacherOfTrabajo(ctx context.Context, teacherID, trabajoID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
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

func (r *Repository) GetTrabajo(ctx context.Context, trabajoID string) (*Trabajo, error) {
	var t Trabajo
	if err := r.db.WithContext(ctx).Where("id = ?", trabajoID).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) GetExtraccionByTrabajo(ctx context.Context, trabajoID string) (*LibroExtraccion, error) {
	var e LibroExtraccion
	err := r.db.WithContext(ctx).Where("trabajo_id = ?", trabajoID).First(&e).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &e, nil
}

func (r *Repository) UpsertExtraccion(ctx context.Context, ext LibroExtraccion) (*LibroExtraccion, error) {
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "trabajo_id"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"archivo_url":          ext.ArchivoURL,
				"idioma":               ext.Idioma,
				"pagina_inicio":        ext.PaginaInicio,
				"pagina_fin":           ext.PaginaFin,
				"estado":               gorm.Expr("?::internal.estado_extraccion_libro", string(ext.Estado)),
				"preguntas_detectadas": ext.PreguntasDetectadas,
				"confianza_promedio":   ext.ConfianzaPromedio,
				"notas_extraccion":     ext.NotasExtraccion,
				"notas_revision":       ext.NotasRevision,
				"usado_fallback":       ext.UsadoFallback,
				"revisado_por":         ext.RevisadoPor,
				"confirmado_por":       ext.ConfirmadoPor,
			}),
		}).
		Create(&ext).Error
	if err != nil {
		return nil, err
	}
	return r.GetExtraccionByTrabajo(ctx, ext.TrabajoID)
}

func (r *Repository) ReplacePreguntas(ctx context.Context, trabajoID string, preguntas []TrabajoPregunta) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("trabajo_id = ?", trabajoID).Delete(&TrabajoPregunta{}).Error; err != nil {
			return err
		}
		for i := range preguntas {
			preguntas[i].TrabajoID = trabajoID
			if preguntas[i].Orden <= 0 {
				preguntas[i].Orden = i + 1
			}
			if len(preguntas[i].Opciones) == 0 {
				preguntas[i].Opciones = []byte("[]")
			}
			if err := tx.Create(&preguntas[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) ListPreguntasByTrabajo(ctx context.Context, trabajoID string) ([]TrabajoPregunta, error) {
	var items []TrabajoPregunta
	err := r.db.WithContext(ctx).
		Where("trabajo_id = ?", trabajoID).
		Order("orden ASC, created_at ASC").
		Find(&items).Error
	return items, err
}

func (r *Repository) UpdateTrabajoPostExtraccion(ctx context.Context, trabajoID, extraccionID string) error {
	return r.db.WithContext(ctx).
		Model(&Trabajo{}).
		Where("id = ?", trabajoID).
		Updates(map[string]interface{}{
			"extraido_de_libro": true,
			"id_extraccion":     extraccionID,
		}).Error
}

func (r *Repository) UpdateTrabajoEstado(ctx context.Context, trabajoID, estado string) (*Trabajo, error) {
	if err := r.db.WithContext(ctx).
		Model(&Trabajo{}).
		Where("id = ?", trabajoID).
		Update("estado", gorm.Expr("?::internal.estado_trabajo", estado)).Error; err != nil {
		return nil, err
	}
	return r.GetTrabajo(ctx, trabajoID)
}

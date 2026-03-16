package trabajos

import (
	"context"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateTrabajo(ctx context.Context, req CreateTrabajoRequest, createdBy string) (*Trabajo, error) {
	t := Trabajo{
		LeccionID:        req.LeccionID,
		Titulo:           req.Titulo,
		Descripcion:      req.Descripcion,
		Instrucciones:    req.Instrucciones,
		FechaVencimiento: req.FechaVencimiento,
		Estado:           "borrador",
		CreatedBy:        &createdBy,
	}
	if err := r.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) ListTrabajosByLeccion(ctx context.Context, leccionID string) ([]Trabajo, error) {
	var items []Trabajo
	err := r.db.WithContext(ctx).
		Where("leccion_id = ?", leccionID).
		Order("created_at DESC").
		Find(&items).Error
	return items, err
}

func (r *Repository) ListMisTrabajos(ctx context.Context, estudianteID string) ([]Trabajo, error) {
	var items []Trabajo
	err := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id").
		Where("ec.estudiante_id = ?", estudianteID).
		Where("tr.estado IN ?", []string{"publicado", "cerrado"}).
		Select("tr.*").
		Order("tr.created_at DESC").
		Scan(&items).Error
	return items, err
}

func (r *Repository) GetTrabajo(ctx context.Context, id string) (*Trabajo, error) {
	var t Trabajo
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) UpdateTrabajoEstado(ctx context.Context, id, estado string) (*Trabajo, error) {
	if err := r.db.WithContext(ctx).
		Model(&Trabajo{}).
		Where("id = ?", id).
		Update("estado", gorm.Expr("?::internal.estado_trabajo", estado)).Error; err != nil {
		return nil, err
	}
	return r.GetTrabajo(ctx, id)
}

func (r *Repository) UpsertEntrega(ctx context.Context, trabajoID, estudianteID string, req CreateEntregaRequest) (*TrabajoEntrega, error) {
	now := time.Now()
	e := TrabajoEntrega{
		TrabajoID:    trabajoID,
		EstudianteID: estudianteID,
		Respuestas:   req.Respuestas,
		ArchivoURL:   req.ArchivoURL,
		Comentario:   req.Comentario,
		Estado:       "enviada",
		SubmittedAt:  now,
	}
	if len(e.Respuestas) == 0 {
		e.Respuestas = []byte("{}")
	}

	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "trabajo_id"}, {Name: "estudiante_id"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"respuestas":   e.Respuestas,
				"archivo_url":  e.ArchivoURL,
				"comentario":   e.Comentario,
				"estado":       gorm.Expr("?::internal.estado_entrega_trabajo", "enviada"),
				"submitted_at": now,
			}),
		}).
		Create(&e).Error
	if err != nil {
		return nil, err
	}
	return r.GetEntregaByTrabajoAndEstudiante(ctx, trabajoID, estudianteID)
}

func (r *Repository) UpdateEntregaByID(ctx context.Context, entregaID string, req CreateEntregaRequest) (*TrabajoEntrega, error) {
	updates := map[string]interface{}{
		"estado":       gorm.Expr("?::internal.estado_entrega_trabajo", "enviada"),
		"submitted_at": time.Now(),
	}
	if len(req.Respuestas) > 0 {
		updates["respuestas"] = req.Respuestas
	}
	if req.ArchivoURL != nil {
		updates["archivo_url"] = *req.ArchivoURL
	}
	if req.Comentario != nil {
		updates["comentario"] = *req.Comentario
	}
	if err := r.db.WithContext(ctx).Model(&TrabajoEntrega{}).Where("id = ?", entregaID).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetEntregaByID(ctx, entregaID)
}

func (r *Repository) GetEntregaByID(ctx context.Context, id string) (*TrabajoEntrega, error) {
	var e TrabajoEntrega
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *Repository) GetEntregaByTrabajoAndEstudiante(ctx context.Context, trabajoID, estudianteID string) (*TrabajoEntrega, error) {
	var e TrabajoEntrega
	if err := r.db.WithContext(ctx).
		Where("trabajo_id = ? AND estudiante_id = ?", trabajoID, estudianteID).
		First(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *Repository) GetEntregaByTrabajoAndEstudianteIfExists(ctx context.Context, trabajoID, estudianteID string) (*TrabajoEntrega, error) {
	e, err := r.GetEntregaByTrabajoAndEstudiante(ctx, trabajoID, estudianteID)
	if err == nil {
		return e, nil
	}
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return nil, err
}

func (r *Repository) ListEntregasByTrabajo(ctx context.Context, trabajoID string) ([]EntregaConCalificacion, error) {
	var entregas []TrabajoEntrega
	if err := r.db.WithContext(ctx).
		Where("trabajo_id = ?", trabajoID).
		Order("submitted_at DESC").
		Find(&entregas).Error; err != nil {
		return nil, err
	}

	items := make([]EntregaConCalificacion, 0, len(entregas))
	for _, e := range entregas {
		item := EntregaConCalificacion{Entrega: e}
		var cal TrabajoCalificacion
		err := r.db.WithContext(ctx).Where("entrega_id = ?", e.ID).First(&cal).Error
		if err == nil {
			item.Calificacion = &cal
		} else if err != gorm.ErrRecordNotFound {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *Repository) UpsertCalificacion(ctx context.Context, entregaID, docenteID string, req CalificarEntregaRequest) (*TrabajoCalificacion, error) {
	var cal TrabajoCalificacion
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		newCal := TrabajoCalificacion{
			EntregaID:    entregaID,
			DocenteID:    docenteID,
			Puntaje:      req.Puntaje,
			Feedback:     req.Feedback,
			SugerenciaIA: req.SugerenciaIA,
		}
		if len(newCal.SugerenciaIA) == 0 {
			newCal.SugerenciaIA = []byte("{}")
		}

		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "entrega_id"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"docente_id":    docenteID,
				"puntaje":       req.Puntaje,
				"feedback":      req.Feedback,
				"sugerencia_ia": newCal.SugerenciaIA,
			}),
		}).Create(&newCal).Error; err != nil {
			return err
		}

		if err := tx.Model(&TrabajoEntrega{}).
			Where("id = ?", entregaID).
			Update("estado", gorm.Expr("?::internal.estado_entrega_trabajo", "calificada")).Error; err != nil {
			return err
		}

		if err := tx.Where("entrega_id = ?", entregaID).First(&cal).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &cal, nil
}

func (r *Repository) IsTeacherOfLeccion(ctx context.Context, teacherID, leccionID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("internal.leccion l").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("l.id = ? AND c.teacher_id = ?", leccionID, teacherID).
		Count(&count).Error
	return count > 0, err
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

func (r *Repository) IsStudentEnrolledInTrabajo(ctx context.Context, studentID, trabajoID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id").
		Where("tr.id = ? AND ec.estudiante_id = ?", trabajoID, studentID).
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) IsStudentOwnerOfEntrega(ctx context.Context, studentID, entregaID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&TrabajoEntrega{}).
		Where("id = ? AND estudiante_id = ?", entregaID, studentID).
		Count(&count).Error
	return count > 0, err
}

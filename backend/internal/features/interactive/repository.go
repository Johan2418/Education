package interactive

import (
	"context"
	"encoding/json"
	"errors"
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

func (r *Repository) ListActividadesByLeccion(ctx context.Context, leccionID string) ([]ActividadInteractiva, error) {
	var items []ActividadInteractiva
	err := r.db.WithContext(ctx).
		Where("leccion_id = ?", leccionID).
		Order("created_at DESC").
		Find(&items).Error
	return items, err
}

func (r *Repository) GetActividad(ctx context.Context, actividadID string) (*ActividadInteractiva, error) {
	var item ActividadInteractiva
	if err := r.db.WithContext(ctx).Where("id = ?", actividadID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) CreateActividad(ctx context.Context, req ActividadInteractivaRequest, createdBy string) (*ActividadInteractiva, error) {
	configuracion := req.Configuracion
	if len(configuracion) == 0 {
		configuracion = json.RawMessage("{}")
	}

	regla := "manual"
	if req.ReglaCompletitud != nil {
		regla = *req.ReglaCompletitud
	}

	puntajeMaximo := 100.0
	if req.PuntajeMaximo != nil {
		puntajeMaximo = *req.PuntajeMaximo
	}

	item := ActividadInteractiva{
		LeccionID:        req.LeccionID,
		Titulo:           req.Titulo,
		Descripcion:      req.Descripcion,
		Proveedor:        req.Proveedor,
		EmbedURL:         req.EmbedURL,
		ReglaCompletitud: regla,
		PuntajeMaximo:    puntajeMaximo,
		IntentosMaximos:  req.IntentosMaximos,
		Configuracion:    configuracion,
		Activo:           true,
		CreatedBy:        &createdBy,
	}
	if req.Activo != nil {
		item.Activo = *req.Activo
	}

	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) UpdateActividad(ctx context.Context, actividadID string, req ActividadInteractivaRequest) (*ActividadInteractiva, error) {
	updates := map[string]interface{}{}
	if req.Titulo != "" {
		updates["titulo"] = req.Titulo
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.Proveedor != "" {
		updates["proveedor"] = req.Proveedor
	}
	if req.EmbedURL != "" {
		updates["embed_url"] = req.EmbedURL
	}
	if req.ReglaCompletitud != nil {
		updates["regla_completitud"] = *req.ReglaCompletitud
	}
	if req.PuntajeMaximo != nil {
		updates["puntaje_maximo"] = *req.PuntajeMaximo
	}
	if req.IntentosMaximos != nil {
		updates["intentos_maximos"] = *req.IntentosMaximos
	}
	if len(req.Configuracion) > 0 {
		updates["configuracion"] = req.Configuracion
	}
	if req.Activo != nil {
		updates["activo"] = *req.Activo
	}

	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&ActividadInteractiva{}).Where("id = ?", actividadID).Updates(updates).Error; err != nil {
			return nil, err
		}
	}

	return r.GetActividad(ctx, actividadID)
}

func (r *Repository) DeleteActividad(ctx context.Context, actividadID string) error {
	res := r.db.WithContext(ctx).Where("id = ?", actividadID).Delete(&ActividadInteractiva{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *Repository) GetMiIntento(ctx context.Context, actividadID, userID string) (*ActividadInteractivaIntento, error) {
	var item ActividadInteractivaIntento
	if err := r.db.WithContext(ctx).Where("actividad_id = ? AND user_id = ?", actividadID, userID).First(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *Repository) ListIntentosByActividad(ctx context.Context, actividadID string) ([]ActividadInteractivaIntento, error) {
	var items []ActividadInteractivaIntento
	err := r.db.WithContext(ctx).
		Where("actividad_id = ?", actividadID).
		Order("updated_at DESC").
		Find(&items).Error
	return items, err
}

func (r *Repository) UpsertIntento(ctx context.Context, actividadID, userID string, req UpsertIntentoRequest) (*ActividadInteractivaIntento, error) {
	now := time.Now()
	item := ActividadInteractivaIntento{
		ActividadID:    actividadID,
		UserID:         userID,
		Completado:     false,
		TiempoDedicado: 0,
		Intentos:       0,
		Metadata:       json.RawMessage("{}"),
		StartedAt:      req.StartedAt,
	}
	if req.Completado != nil {
		item.Completado = *req.Completado
	}
	if req.ScoreObtenido != nil {
		item.ScoreObtenido = req.ScoreObtenido
	}
	if req.ScoreNormalizado != nil {
		item.ScoreNormalizado = req.ScoreNormalizado
	}
	if req.TiempoDedicado != nil {
		item.TiempoDedicado = *req.TiempoDedicado
	}
	if req.Intentos != nil {
		item.Intentos = *req.Intentos
	}
	if len(req.Metadata) > 0 {
		item.Metadata = req.Metadata
	}
	if req.CompletedAt != nil {
		item.CompletedAt = req.CompletedAt
	} else if item.Completado {
		item.CompletedAt = &now
	}

	updateMap := map[string]interface{}{}
	if req.Completado != nil {
		updateMap["completado"] = *req.Completado
	}
	if req.ScoreObtenido != nil {
		updateMap["score_obtenido"] = *req.ScoreObtenido
	}
	if req.ScoreNormalizado != nil {
		updateMap["score_normalizado"] = *req.ScoreNormalizado
	}
	if req.TiempoDedicado != nil {
		updateMap["tiempo_dedicado"] = *req.TiempoDedicado
	}
	if req.Intentos != nil {
		updateMap["intentos"] = *req.Intentos
	}
	if len(req.Metadata) > 0 {
		updateMap["metadata"] = req.Metadata
	}
	if req.StartedAt != nil {
		updateMap["started_at"] = req.StartedAt
	}
	if req.CompletedAt != nil {
		updateMap["completed_at"] = req.CompletedAt
	} else if req.Completado != nil && *req.Completado {
		updateMap["completed_at"] = now
	}

	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "actividad_id"}, {Name: "user_id"}},
		DoUpdates: clause.Assignments(updateMap),
	}).Create(&item).Error; err != nil {
		return nil, err
	}

	out, err := r.GetMiIntento(ctx, actividadID, userID)
	if err != nil {
		return nil, err
	}

	if err := r.syncProgresoSeccion(ctx, actividadID, userID, out); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Repository) syncProgresoSeccion(ctx context.Context, actividadID, userID string, intento *ActividadInteractivaIntento) error {
	if intento == nil {
		return errors.New("intento requerido")
	}

	const query = `
	INSERT INTO internal.progreso_seccion (
	  user_id,
	  leccion_seccion_id,
	  completado,
	  puntuacion,
	  tiempo_dedicado,
	  intentos
	)
	SELECT ?, ls.id, ?, ?, ?, ?
	FROM internal.leccion_seccion ls
	WHERE ls.actividad_interactiva_id = ?
	ON CONFLICT (user_id, leccion_seccion_id)
	DO UPDATE SET
	  completado = (internal.progreso_seccion.completado OR EXCLUDED.completado),
	  puntuacion = CASE
	    WHEN EXCLUDED.puntuacion IS NULL THEN internal.progreso_seccion.puntuacion
	    WHEN internal.progreso_seccion.puntuacion IS NULL THEN EXCLUDED.puntuacion
	    ELSE GREATEST(internal.progreso_seccion.puntuacion, EXCLUDED.puntuacion)
	  END,
	  tiempo_dedicado = GREATEST(internal.progreso_seccion.tiempo_dedicado, EXCLUDED.tiempo_dedicado),
	  intentos = GREATEST(internal.progreso_seccion.intentos, EXCLUDED.intentos),
	  updated_at = now();`

	return r.db.WithContext(ctx).
		Exec(query, userID, intento.Completado, intento.ScoreNormalizado, intento.TiempoDedicado, intento.Intentos, actividadID).
		Error
}

func (r *Repository) IsTeacherOfLeccion(ctx context.Context, teacherID, leccionID string) (bool, error) {
	var exists bool
	err := r.db.WithContext(ctx).
		Table("internal.leccion l").
		Select("COUNT(1) > 0").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("l.id = ? AND c.teacher_id = ?", leccionID, teacherID).
		Scan(&exists).Error
	return exists, err
}

func (r *Repository) IsTeacherOfActividad(ctx context.Context, teacherID, actividadID string) (bool, error) {
	var exists bool
	err := r.db.WithContext(ctx).
		Table("internal.actividad_interactiva ai").
		Select("COUNT(1) > 0").
		Joins("JOIN internal.leccion l ON l.id = ai.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("ai.id = ? AND c.teacher_id = ?", actividadID, teacherID).
		Scan(&exists).Error
	return exists, err
}

func (r *Repository) IsStudentEnrolledInActividad(ctx context.Context, studentID, actividadID string) (bool, error) {
	var exists bool
	err := r.db.WithContext(ctx).
		Table("internal.actividad_interactiva ai").
		Select("COUNT(1) > 0").
		Joins("JOIN internal.leccion l ON l.id = ai.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id").
		Where("ai.id = ? AND ec.estudiante_id = ?", actividadID, studentID).
		Scan(&exists).Error
	return exists, err
}

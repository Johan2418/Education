package trabajos

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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
	notaMaxima := 10.0
	if req.NotaMaxima != nil {
		notaMaxima = *req.NotaMaxima
	}
	pesoCalif := 1.0
	if req.PesoCalif != nil {
		pesoCalif = *req.PesoCalif
	}

	t := Trabajo{
		LeccionID:        req.LeccionID,
		Titulo:           req.Titulo,
		Descripcion:      req.Descripcion,
		Instrucciones:    req.Instrucciones,
		FechaVencimiento: req.FechaVencimiento,
		NotaMaxima:       notaMaxima,
		PesoCalif:        pesoCalif,
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

func (r *Repository) UpdateTrabajo(ctx context.Context, id string, req UpdateTrabajoRequest) (*Trabajo, error) {
	updates := map[string]interface{}{
		"titulo":            req.Titulo,
		"descripcion":       req.Descripcion,
		"instrucciones":     req.Instrucciones,
		"fecha_vencimiento": req.FechaVencimiento,
	}
	if req.NotaMaxima != nil {
		updates["nota_maxima"] = *req.NotaMaxima
	}
	if req.PesoCalif != nil {
		updates["peso_calificacion"] = *req.PesoCalif
	}

	if err := r.db.WithContext(ctx).
		Model(&Trabajo{}).
		Where("id = ?", id).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	return r.GetTrabajo(ctx, id)
}

func (r *Repository) DeleteTrabajo(ctx context.Context, id string) error {
	res := r.db.WithContext(ctx).Where("id = ?", id).Delete(&Trabajo{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *Repository) UpsertEntrega(ctx context.Context, trabajoID, estudianteID string, req CreateEntregaRequest) (*TrabajoEntrega, error) {
	legacyRespuestas := buildLegacyRespuestas(req)
	now := time.Now()
	e := TrabajoEntrega{
		TrabajoID:    trabajoID,
		EstudianteID: estudianteID,
		Respuestas:   legacyRespuestas,
		ArchivoURL:   req.ArchivoURL,
		Comentario:   req.Comentario,
		Estado:       "enviada",
		SubmittedAt:  now,
	}
	if len(e.Respuestas) == 0 {
		e.Respuestas = []byte("{}")
	}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "trabajo_id"}, {Name: "estudiante_id"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"respuestas":   e.Respuestas,
				"archivo_url":  e.ArchivoURL,
				"comentario":   e.Comentario,
				"estado":       gorm.Expr("?::internal.estado_entrega_trabajo", "enviada"),
				"submitted_at": now,
			}),
		}).Create(&e).Error; err != nil {
			return err
		}

		entrega, err := r.getEntregaByTrabajoAndEstudianteTx(ctx, tx, trabajoID, estudianteID)
		if err != nil {
			return err
		}

		if len(req.RespuestasPreguntas) > 0 {
			if err := r.syncRespuestasPreguntasTx(ctx, tx, entrega.ID, req.RespuestasPreguntas); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetEntregaByTrabajoAndEstudiante(ctx, trabajoID, estudianteID)
}

func (r *Repository) UpdateEntregaByID(ctx context.Context, entregaID string, req CreateEntregaRequest) (*TrabajoEntrega, error) {
	legacyRespuestas := buildLegacyRespuestas(req)
	updates := map[string]interface{}{
		"estado":       gorm.Expr("?::internal.estado_entrega_trabajo", "enviada"),
		"submitted_at": time.Now(),
	}
	if len(legacyRespuestas) > 0 {
		updates["respuestas"] = legacyRespuestas
	}
	if req.ArchivoURL != nil {
		updates["archivo_url"] = *req.ArchivoURL
	}
	if req.Comentario != nil {
		updates["comentario"] = *req.Comentario
	}
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&TrabajoEntrega{}).Where("id = ?", entregaID).Updates(updates).Error; err != nil {
			return err
		}
		if len(req.RespuestasPreguntas) > 0 {
			if err := r.syncRespuestasPreguntasTx(ctx, tx, entregaID, req.RespuestasPreguntas); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
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

func (r *Repository) getEntregaByTrabajoAndEstudianteTx(ctx context.Context, tx *gorm.DB, trabajoID, estudianteID string) (*TrabajoEntrega, error) {
	var e TrabajoEntrega
	if err := tx.WithContext(ctx).
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
	items, _, err := r.ListEntregasByTrabajoPaginated(ctx, trabajoID, 0, 0)
	if err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) ListEntregasByTrabajoPaginated(ctx context.Context, trabajoID string, limit, offset int) ([]EntregaConCalificacion, int64, error) {
	type entregaRow struct {
		EntregaID        string
		TrabajoID        string
		EstudianteID     string
		Respuestas       json.RawMessage
		ArchivoURL       *string
		Comentario       *string
		Estado           string
		SubmittedAt      time.Time
		EntregaCreatedAt time.Time
		EntregaUpdatedAt time.Time
		CalificacionID   *string
		DocenteID        *string
		Puntaje          *float64
		Feedback         *string
		SugerenciaIA     json.RawMessage
		CalifCreatedAt   *time.Time
		CalifUpdatedAt   *time.Time
		EstudianteNombre *string
		EstudianteEmail  *string
	}

	baseQuery := r.db.WithContext(ctx).
		Table("internal.trabajo_entrega e").
		Select(`
			e.id AS entrega_id,
			e.trabajo_id,
			e.estudiante_id,
			e.respuestas,
			e.archivo_url,
			e.comentario,
			e.estado,
			e.submitted_at,
			e.created_at AS entrega_created_at,
			e.updated_at AS entrega_updated_at,
			c.id AS calificacion_id,
			c.docente_id,
			c.puntaje,
			c.feedback,
			c.sugerencia_ia,
			c.created_at AS calif_created_at,
			c.updated_at AS calif_updated_at,
			p.display_name AS estudiante_nombre,
			p.email AS estudiante_email
		`).
		Joins("LEFT JOIN internal.trabajo_calificacion c ON c.entrega_id = e.id").
		Joins("LEFT JOIN internal.profiles p ON p.id = e.estudiante_id").
		Where("e.trabajo_id = ?", trabajoID)

	var total int64
	if err := baseQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	query := baseQuery.Order("e.submitted_at DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}

	var rows []entregaRow
	err := query.Find(&rows).Error
	if err != nil {
		return nil, 0, err
	}

	items := make([]EntregaConCalificacion, 0, len(rows))
	for _, row := range rows {
		entrega := TrabajoEntrega{
			ID:           row.EntregaID,
			TrabajoID:    row.TrabajoID,
			EstudianteID: row.EstudianteID,
			Respuestas:   row.Respuestas,
			ArchivoURL:   row.ArchivoURL,
			Comentario:   row.Comentario,
			Estado:       row.Estado,
			SubmittedAt:  row.SubmittedAt,
			CreatedAt:    row.EntregaCreatedAt,
			UpdatedAt:    row.EntregaUpdatedAt,
		}

		item := EntregaConCalificacion{
			Entrega:          entrega,
			EstudianteNombre: row.EstudianteNombre,
			EstudianteEmail:  row.EstudianteEmail,
		}

		if row.CalificacionID != nil {
			sugerencia := row.SugerenciaIA
			if len(sugerencia) == 0 {
				sugerencia = []byte("{}")
			}

			calif := TrabajoCalificacion{
				ID:           *row.CalificacionID,
				EntregaID:    row.EntregaID,
				DocenteID:    derefString(row.DocenteID),
				Puntaje:      derefFloat64(row.Puntaje),
				Feedback:     row.Feedback,
				SugerenciaIA: sugerencia,
			}
			if row.CalifCreatedAt != nil {
				calif.CreatedAt = *row.CalifCreatedAt
			}
			if row.CalifUpdatedAt != nil {
				calif.UpdatedAt = *row.CalifUpdatedAt
			}
			item.Calificacion = &calif
		}

		items = append(items, item)
	}

	return items, total, nil
}

func (r *Repository) GetTrabajoReporte(ctx context.Context, trabajoID string) (*TrabajoReporte, error) {
	type reporteRow struct {
		TotalEntregas    int64      `gorm:"column:total_entregas"`
		TotalCalificadas int64      `gorm:"column:total_calificadas"`
		TotalPendientes  int64      `gorm:"column:total_pendientes"`
		PromedioPuntaje  *float64   `gorm:"column:promedio_puntaje"`
		UltimaEntregaAt  *time.Time `gorm:"column:ultima_entrega_at"`
	}

	var row reporteRow
	err := r.db.WithContext(ctx).
		Table("internal.trabajo_entrega e").
		Select(`
			COUNT(e.id) AS total_entregas,
			COUNT(c.id) AS total_calificadas,
			(COUNT(e.id) - COUNT(c.id)) AS total_pendientes,
			AVG(c.puntaje) AS promedio_puntaje,
			MAX(e.submitted_at) AS ultima_entrega_at
		`).
		Joins("LEFT JOIN internal.trabajo_calificacion c ON c.entrega_id = e.id").
		Where("e.trabajo_id = ?", trabajoID).
		Take(&row).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return &TrabajoReporte{TrabajoID: trabajoID}, nil
		}
		return nil, err
	}

	return &TrabajoReporte{
		TrabajoID:        trabajoID,
		TotalEntregas:    row.TotalEntregas,
		TotalCalificadas: row.TotalCalificadas,
		TotalPendientes:  row.TotalPendientes,
		PromedioPuntaje:  row.PromedioPuntaje,
		UltimaEntregaAt:  row.UltimaEntregaAt,
	}, nil
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func derefFloat64(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

func (r *Repository) UpsertCalificacion(ctx context.Context, entregaID, docenteID, actorRole string, req CalificarEntregaRequest) (*TrabajoCalificacion, error) {
	var cal TrabajoCalificacion
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var previous *TrabajoCalificacion
		var existing TrabajoCalificacion
		switch err := tx.Where("entrega_id = ?", entregaID).First(&existing).Error; {
		case err == nil:
			copyExisting := existing
			previous = &copyExisting
		case errors.Is(err, gorm.ErrRecordNotFound):
			// first grade, no previous snapshot
		default:
			return err
		}

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

		if err := r.insertCalificacionHistorialTx(
			ctx,
			tx,
			entregaID,
			docenteID,
			actorRole,
			req.TipoCambio,
			req.Motivo,
			previous,
			&cal,
			nil,
			nil,
		); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &cal, nil
}

func (r *Repository) UpsertCalificacionPorPregunta(ctx context.Context, entregaID, docenteID, actorRole string, req CalificarEntregaPorPreguntaRequest) (*TrabajoCalificacion, error) {
	var cal TrabajoCalificacion
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		entrega, err := r.getEntregaByIDTx(ctx, tx, entregaID)
		if err != nil {
			return err
		}

		var previous *TrabajoCalificacion
		var previousDetalles []TrabajoCalificacionPregunta
		var existing TrabajoCalificacion
		switch err := tx.Where("entrega_id = ?", entregaID).First(&existing).Error; {
		case err == nil:
			copyExisting := existing
			previous = &copyExisting
			if err := tx.Where("calificacion_id = ?", existing.ID).
				Order("created_at ASC").
				Find(&previousDetalles).Error; err != nil {
				return err
			}
		case errors.Is(err, gorm.ErrRecordNotFound):
			// first grade, no previous snapshot
		default:
			return err
		}

		validRows := make([]struct{ ID string }, 0)
		if err := tx.WithContext(ctx).
			Table("internal.trabajo_pregunta").
			Select("id").
			Where("trabajo_id = ?", entrega.TrabajoID).
			Find(&validRows).Error; err != nil {
			return err
		}

		valid := map[string]struct{}{}
		for _, row := range validRows {
			valid[row.ID] = struct{}{}
		}

		total := 0.0
		for _, item := range req.Items {
			if _, ok := valid[item.PreguntaID]; !ok {
				return fmt.Errorf("pregunta_id invalido para esta entrega")
			}
			total += item.Puntaje
		}

		detalleAnterior := buildCalificacionDetalleFromRows(previousDetalles)
		detalleNuevo := buildCalificacionDetalleFromItems(req.Items)

		newCal := TrabajoCalificacion{
			EntregaID:    entregaID,
			DocenteID:    docenteID,
			Puntaje:      total,
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
				"puntaje":       total,
				"feedback":      req.Feedback,
				"sugerencia_ia": newCal.SugerenciaIA,
			}),
		}).Create(&newCal).Error; err != nil {
			return err
		}

		if err := tx.Where("entrega_id = ?", entregaID).First(&cal).Error; err != nil {
			return err
		}

		if err := tx.Where("calificacion_id = ?", cal.ID).Delete(&TrabajoCalificacionPregunta{}).Error; err != nil {
			return err
		}

		for _, item := range req.Items {
			detalle := TrabajoCalificacionPregunta{
				CalificacionID: cal.ID,
				PreguntaID:     item.PreguntaID,
				Puntaje:        item.Puntaje,
				Feedback:       item.Feedback,
			}
			if err := tx.Create(&detalle).Error; err != nil {
				return err
			}
		}

		if err := tx.Model(&TrabajoEntrega{}).
			Where("id = ?", entregaID).
			Update("estado", gorm.Expr("?::internal.estado_entrega_trabajo", "calificada")).Error; err != nil {
			return err
		}

		if err := r.insertCalificacionHistorialTx(
			ctx,
			tx,
			entregaID,
			docenteID,
			actorRole,
			req.TipoCambio,
			req.Motivo,
			previous,
			&cal,
			detalleAnterior,
			detalleNuevo,
		); err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return &cal, nil
}

func (r *Repository) ListTrabajoPreguntas(ctx context.Context, trabajoID string) ([]TrabajoPregunta, error) {
	var items []TrabajoPregunta
	err := r.db.WithContext(ctx).
		Where("trabajo_id = ?", trabajoID).
		Order("orden ASC, created_at ASC").
		Find(&items).Error
	return items, err
}

func (r *Repository) ListRespuestasPreguntasByEntrega(ctx context.Context, entregaID string) ([]TrabajoRespuestaPregunta, error) {
	var items []TrabajoRespuestaPregunta
	err := r.db.WithContext(ctx).
		Where("entrega_id = ?", entregaID).
		Order("orden ASC, created_at ASC").
		Find(&items).Error
	return items, err
}

func (r *Repository) GetCalificacionByEntrega(ctx context.Context, entregaID string) (*TrabajoCalificacion, error) {
	var cal TrabajoCalificacion
	err := r.db.WithContext(ctx).Where("entrega_id = ?", entregaID).First(&cal).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &cal, nil
}

func (r *Repository) ListCalificacionesPreguntaByCalificacion(ctx context.Context, calificacionID string) ([]TrabajoCalificacionPregunta, error) {
	var items []TrabajoCalificacionPregunta
	err := r.db.WithContext(ctx).
		Where("calificacion_id = ?", calificacionID).
		Order("created_at ASC").
		Find(&items).Error
	return items, err
}

func (r *Repository) ListCalificacionHistorialByEntrega(ctx context.Context, entregaID string) ([]TrabajoCalificacionHistorial, error) {
	var items []TrabajoCalificacionHistorial
	err := r.db.WithContext(ctx).
		Where("entrega_id = ?", entregaID).
		Order("created_at DESC").
		Find(&items).Error
	return items, err
}

type calificacionDetalleSnapshot struct {
	PreguntaID string  `json:"pregunta_id"`
	Puntaje    float64 `json:"puntaje"`
	Feedback   *string `json:"feedback,omitempty"`
}

func buildCalificacionDetalleFromItems(items []CalificarEntregaPreguntaItem) json.RawMessage {
	if len(items) == 0 {
		return nil
	}

	snapshot := make([]calificacionDetalleSnapshot, 0, len(items))
	for _, item := range items {
		snapshot = append(snapshot, calificacionDetalleSnapshot{
			PreguntaID: item.PreguntaID,
			Puntaje:    item.Puntaje,
			Feedback:   normalizeOptionalText(item.Feedback),
		})
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return nil
	}
	return payload
}

func buildCalificacionDetalleFromRows(rows []TrabajoCalificacionPregunta) json.RawMessage {
	if len(rows) == 0 {
		return nil
	}

	snapshot := make([]calificacionDetalleSnapshot, 0, len(rows))
	for _, row := range rows {
		snapshot = append(snapshot, calificacionDetalleSnapshot{
			PreguntaID: row.PreguntaID,
			Puntaje:    row.Puntaje,
			Feedback:   normalizeOptionalText(row.Feedback),
		})
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return nil
	}
	return payload
}

func normalizeOptionalText(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func (r *Repository) insertCalificacionHistorialTx(
	ctx context.Context,
	tx *gorm.DB,
	entregaID string,
	actorID string,
	actorRole string,
	tipoCambio string,
	motivo *string,
	previous *TrabajoCalificacion,
	current *TrabajoCalificacion,
	detalleAnterior json.RawMessage,
	detalleNuevo json.RawMessage,
) error {
	if current == nil {
		return errors.New("calificacion actual requerida para historial")
	}

	motivo = normalizeOptionalText(motivo)
	calificacionID := current.ID
	hist := TrabajoCalificacionHistorial{
		EntregaID:      entregaID,
		CalificacionID: &calificacionID,
		ActorID:        actorID,
		ActorRole:      actorRole,
		TipoCambio:     tipoCambio,
		Motivo:         motivo,
		PuntajeNuevo:   current.Puntaje,
		FeedbackNuevo:  normalizeOptionalText(current.Feedback),
	}

	if previous != nil {
		hist.PuntajeAnterior = &previous.Puntaje
		hist.FeedbackAnterior = normalizeOptionalText(previous.Feedback)
	}
	if len(detalleAnterior) > 0 {
		hist.DetalleAnterior = detalleAnterior
	}
	if len(detalleNuevo) > 0 {
		hist.DetalleNuevo = detalleNuevo
	}

	return tx.WithContext(ctx).Create(&hist).Error
}

func (r *Repository) getEntregaByIDTx(ctx context.Context, tx *gorm.DB, id string) (*TrabajoEntrega, error) {
	var e TrabajoEntrega
	if err := tx.WithContext(ctx).Where("id = ?", id).First(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *Repository) syncRespuestasPreguntasTx(ctx context.Context, tx *gorm.DB, entregaID string, respuestas []CreateEntregaPreguntaRespuesta) error {
	if err := tx.WithContext(ctx).Where("entrega_id = ?", entregaID).Delete(&TrabajoRespuestaPregunta{}).Error; err != nil {
		return err
	}

	for idx, item := range respuestas {
		row := TrabajoRespuestaPregunta{
			EntregaID:       entregaID,
			PreguntaID:      item.PreguntaID,
			RespuestaTexto:  item.RespuestaTexto,
			RespuestaOpcion: item.RespuestaOpcion,
			Orden:           idx + 1,
		}
		if err := tx.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}

	return nil
}

func buildLegacyRespuestas(req CreateEntregaRequest) json.RawMessage {
	if len(req.RespuestasPreguntas) > 0 {
		mapped := map[string]any{}
		for _, item := range req.RespuestasPreguntas {
			if item.PreguntaID == "" {
				continue
			}
			if item.RespuestaOpcion != nil {
				mapped[item.PreguntaID] = *item.RespuestaOpcion
				continue
			}
			if item.RespuestaTexto != nil {
				mapped[item.PreguntaID] = *item.RespuestaTexto
				continue
			}
			mapped[item.PreguntaID] = ""
		}
		if payload, err := json.Marshal(mapped); err == nil {
			return payload
		}
	}

	if len(req.Respuestas) > 0 {
		return req.Respuestas
	}

	return json.RawMessage("{}")
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

func (r *Repository) HasPendingLibroExtraction(ctx context.Context, trabajoID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("internal.libro_extraccion").
		Where("trabajo_id = ?", trabajoID).
		Where("estado <> ?::internal.estado_extraccion_libro OR confirmado_por IS NULL", "aprobado").
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) GetTeacherContactByTrabajo(ctx context.Context, trabajoID string) (*UserContact, error) {
	type contactRow struct {
		ID          string
		DisplayName *string
		Email       *string
	}

	var row contactRow
	err := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Select("p.id, p.display_name, p.email").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Joins("JOIN internal.profiles p ON p.id = c.teacher_id").
		Where("tr.id = ?", trabajoID).
		Take(&row).Error
	if err != nil {
		return nil, err
	}

	return &UserContact{ID: row.ID, DisplayName: row.DisplayName, Email: row.Email}, nil
}

func (r *Repository) ListStudentContactsByTrabajo(ctx context.Context, trabajoID string) ([]UserContact, error) {
	var items []UserContact
	err := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Select("DISTINCT p.id, p.display_name, p.email").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id").
		Joins("JOIN internal.profiles p ON p.id = ec.estudiante_id").
		Where("tr.id = ?", trabajoID).
		Order("p.display_name ASC").
		Scan(&items).Error
	return items, err
}

func (r *Repository) GetStudentContactByEntrega(ctx context.Context, entregaID string) (*UserContact, error) {
	type contactRow struct {
		ID          string
		DisplayName *string
		Email       *string
	}

	var row contactRow
	err := r.db.WithContext(ctx).
		Table("internal.trabajo_entrega e").
		Select("p.id, p.display_name, p.email").
		Joins("JOIN internal.profiles p ON p.id = e.estudiante_id").
		Where("e.id = ?", entregaID).
		Take(&row).Error
	if err != nil {
		return nil, err
	}

	return &UserContact{ID: row.ID, DisplayName: row.DisplayName, Email: row.Email}, nil
}

func (r *Repository) GetTrabajoAnalyticsV2(ctx context.Context, filter TrabajoAnalyticsFilter) (*TrabajoAnalyticsV2Response, error) {
	summary, err := r.getAnalyticsSummary(ctx, filter)
	if err != nil {
		return nil, err
	}

	finalSummary, err := r.getFinalSummaryAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}
	summary.PromedioFinal10 = finalSummary.PromedioFinal10
	summary.TotalContribuciones = finalSummary.TotalContribuciones
	if finalSummary.EstudiantesActivos > summary.EstudiantesActivos {
		summary.EstudiantesActivos = finalSummary.EstudiantesActivos
	}

	cursos, err := r.listCursoAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}

	unidades, err := r.listUnidadAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}

	temas, err := r.listTemaAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}

	lecciones, err := r.listLeccionAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}

	estudiantes, err := r.listEstudianteAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}

	estudiantesFinales, err := r.listEstudianteFinalAnalytics(ctx, filter)
	if err != nil {
		return nil, err
	}

	contribuciones, err := r.listContribucionTipoRecurso(ctx, filter)
	if err != nil {
		return nil, err
	}

	return &TrabajoAnalyticsV2Response{
		Scope:              filter,
		Summary:            summary,
		Cursos:             cursos,
		Unidades:           unidades,
		Temas:              temas,
		Lecciones:          lecciones,
		Estudiantes:        estudiantes,
		EstudiantesFinales: estudiantesFinales,
		Contribuciones:     contribuciones,
		GeneratedAt:        time.Now(),
	}, nil
}

type finalSummaryAnalytics struct {
	TotalContribuciones int64    `gorm:"column:total_contribuciones"`
	EstudiantesActivos  int64    `gorm:"column:estudiantes_activos"`
	PromedioFinal10     *float64 `gorm:"column:promedio_final_10"`
}

func (r *Repository) getFinalSummaryAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) (finalSummaryAnalytics, error) {
	cte, args := buildFinalRowsCTE(filter)
	query := cte + `
		SELECT
			COUNT(*) FILTER (WHERE peso > 0)::bigint AS total_contribuciones,
			COUNT(DISTINCT user_id) FILTER (WHERE peso > 0)::bigint AS estudiantes_activos,
			CASE
				WHEN COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0) > 0
				THEN ROUND((SUM(CASE WHEN peso > 0 THEN nota_10 * peso ELSE 0 END) / SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END))::numeric, 2)::double precision
				ELSE NULL
			END AS promedio_final_10
		FROM final_rows
	`

	var row finalSummaryAnalytics
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&row).Error
	return row, err
}

func (r *Repository) getAnalyticsSummary(ctx context.Context, filter TrabajoAnalyticsFilter) (TrabajoAnalyticsSummary, error) {
	summaryTrabajosQuery := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id")

	summaryTrabajosQuery = applyTrabajoScope(summaryTrabajosQuery, filter)

	var totalTrabajos int64
	if err := summaryTrabajosQuery.Distinct("tr.id").Count(&totalTrabajos).Error; err != nil {
		return TrabajoAnalyticsSummary{}, err
	}

	type summaryRow struct {
		TotalEntregas      int64    `gorm:"column:total_entregas"`
		TotalCalificadas   int64    `gorm:"column:total_calificadas"`
		PromedioPuntaje    *float64 `gorm:"column:promedio_puntaje"`
		EstudiantesActivos int64    `gorm:"column:estudiantes_activos"`
	}

	entregasQuery := r.db.WithContext(ctx).
		Table("internal.trabajo_entrega e").
		Select(`
			COUNT(e.id) AS total_entregas,
			COUNT(tc.id) AS total_calificadas,
			AVG(tc.puntaje) AS promedio_puntaje,
			COUNT(DISTINCT e.estudiante_id) AS estudiantes_activos
		`).
		Joins("JOIN internal.trabajo tr ON tr.id = e.trabajo_id").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Joins("LEFT JOIN internal.trabajo_calificacion tc ON tc.entrega_id = e.id")

	entregasQuery = applyTrabajoScope(entregasQuery, filter)
	entregasQuery = applyEntregaScope(entregasQuery, filter)

	var row summaryRow
	if err := entregasQuery.Scan(&row).Error; err != nil {
		return TrabajoAnalyticsSummary{}, err
	}

	return TrabajoAnalyticsSummary{
		TotalTrabajos:      totalTrabajos,
		TotalEntregas:      row.TotalEntregas,
		TotalCalificadas:   row.TotalCalificadas,
		PromedioPuntaje:    row.PromedioPuntaje,
		EstudiantesActivos: row.EstudiantesActivos,
	}, nil
}

func (r *Repository) listCursoAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) ([]CursoAnalyticsItem, error) {
	var items []CursoAnalyticsItem
	query := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Select(`
			c.id AS curso_id,
			c.nombre AS curso_nombre,
			COUNT(DISTINCT tr.id) AS total_trabajos,
			COUNT(e.id) AS total_entregas,
			COUNT(tc.id) AS total_calificadas,
			AVG(tc.puntaje) AS promedio_puntaje,
			COUNT(DISTINCT e.estudiante_id) AS estudiantes_activos
		`).
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Joins("LEFT JOIN internal.trabajo_entrega e ON e.trabajo_id = tr.id").
		Joins("LEFT JOIN internal.trabajo_calificacion tc ON tc.entrega_id = e.id")

	query = applyTrabajoScope(query, filter)
	query = applyEntregaScope(query, filter)

	err := query.
		Group("c.id, c.nombre").
		Order("c.nombre ASC").
		Scan(&items).Error
	return items, err
}

func (r *Repository) listUnidadAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) ([]UnidadAnalyticsItem, error) {
	cte, args := buildFinalRowsCTE(filter)
	query := cte + `
		SELECT
			unidad_id,
			unidad_nombre,
			curso_id,
			curso_nombre,
			COUNT(*) FILTER (WHERE peso > 0)::bigint AS total_contribuciones,
			COUNT(DISTINCT user_id) FILTER (WHERE peso > 0)::bigint AS estudiantes_activos,
			CASE
				WHEN COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0) > 0
				THEN ROUND((SUM(CASE WHEN peso > 0 THEN nota_10 * peso ELSE 0 END) / SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END))::numeric, 2)::double precision
				ELSE NULL
			END AS promedio_final_10
		FROM final_rows
		GROUP BY unidad_id, unidad_nombre, curso_id, curso_nombre
		ORDER BY curso_nombre ASC, unidad_nombre ASC
	`

	var items []UnidadAnalyticsItem
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&items).Error
	return items, err
}

func (r *Repository) listTemaAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) ([]TemaAnalyticsItem, error) {
	cte, args := buildFinalRowsCTE(filter)
	query := cte + `
		SELECT
			tema_id,
			tema_nombre,
			unidad_id,
			unidad_nombre,
			curso_id,
			curso_nombre,
			COUNT(*) FILTER (WHERE peso > 0)::bigint AS total_contribuciones,
			COUNT(DISTINCT user_id) FILTER (WHERE peso > 0)::bigint AS estudiantes_activos,
			CASE
				WHEN COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0) > 0
				THEN ROUND((SUM(CASE WHEN peso > 0 THEN nota_10 * peso ELSE 0 END) / SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END))::numeric, 2)::double precision
				ELSE NULL
			END AS promedio_final_10
		FROM final_rows
		GROUP BY tema_id, tema_nombre, unidad_id, unidad_nombre, curso_id, curso_nombre
		ORDER BY curso_nombre ASC, unidad_nombre ASC, tema_nombre ASC
	`

	var items []TemaAnalyticsItem
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&items).Error
	return items, err
}

func (r *Repository) listLeccionAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) ([]LeccionAnalyticsItem, error) {
	var items []LeccionAnalyticsItem
	query := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Select(`
			l.id AS leccion_id,
			l.titulo AS leccion_titulo,
			c.id AS curso_id,
			c.nombre AS curso_nombre,
			COUNT(DISTINCT tr.id) AS total_trabajos,
			COUNT(e.id) AS total_entregas,
			COUNT(tc.id) AS total_calificadas,
			AVG(tc.puntaje) AS promedio_puntaje,
			COUNT(DISTINCT e.estudiante_id) AS estudiantes_activos
		`).
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Joins("LEFT JOIN internal.trabajo_entrega e ON e.trabajo_id = tr.id").
		Joins("LEFT JOIN internal.trabajo_calificacion tc ON tc.entrega_id = e.id")

	query = applyTrabajoScope(query, filter)
	query = applyEntregaScope(query, filter)

	err := query.
		Group("l.id, l.titulo, c.id, c.nombre").
		Order("l.titulo ASC").
		Scan(&items).Error
	return items, err
}

func (r *Repository) listEstudianteAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) ([]EstudianteAnalyticsItem, error) {
	var items []EstudianteAnalyticsItem
	query := r.db.WithContext(ctx).
		Table("internal.trabajo_entrega e").
		Select(`
			e.estudiante_id,
			p.display_name AS estudiante_nombre,
			p.email AS estudiante_email,
			c.id AS curso_id,
			c.nombre AS curso_nombre,
			l.id AS leccion_id,
			l.titulo AS leccion_titulo,
			COUNT(e.id) AS total_entregas,
			COUNT(tc.id) AS total_calificadas,
			AVG(tc.puntaje) AS promedio_puntaje,
			MAX(e.submitted_at) AS ultima_entrega_at
		`).
		Joins("JOIN internal.trabajo tr ON tr.id = e.trabajo_id").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Joins("JOIN internal.profiles p ON p.id = e.estudiante_id").
		Joins("LEFT JOIN internal.trabajo_calificacion tc ON tc.entrega_id = e.id")

	query = applyTrabajoScope(query, filter)
	query = applyEntregaScope(query, filter)

	err := query.
		Group("e.estudiante_id, p.display_name, p.email, c.id, c.nombre, l.id, l.titulo").
		Order("p.display_name ASC").
		Scan(&items).Error
	return items, err
}

func (r *Repository) listEstudianteFinalAnalytics(ctx context.Context, filter TrabajoAnalyticsFilter) ([]EstudianteFinalAnalyticsItem, error) {
	cte, args := buildFinalRowsCTE(filter)
	query := cte + `
		SELECT
			user_id AS estudiante_id,
			estudiante_nombre,
			estudiante_email,
			curso_id,
			curso_nombre,
			COUNT(*) FILTER (WHERE peso > 0)::bigint AS total_contribuciones,
			COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0)::double precision AS peso_total,
			CASE
				WHEN COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0) > 0
				THEN ROUND((SUM(CASE WHEN peso > 0 THEN nota_10 * peso ELSE 0 END) / SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END))::numeric, 2)::double precision
				ELSE NULL
			END AS promedio_final_10
		FROM final_rows
		GROUP BY user_id, estudiante_nombre, estudiante_email, curso_id, curso_nombre
		ORDER BY estudiante_nombre ASC NULLS LAST, estudiante_email ASC NULLS LAST
	`

	var items []EstudianteFinalAnalyticsItem
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&items).Error
	return items, err
}

func (r *Repository) listContribucionTipoRecurso(ctx context.Context, filter TrabajoAnalyticsFilter) ([]ContribucionTipoRecursoItem, error) {
	cte, args := buildFinalRowsCTE(filter)
	query := cte + `
		SELECT
			tipo_recurso,
			COUNT(*) FILTER (WHERE peso > 0)::bigint AS total_contribuciones,
			COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0)::double precision AS peso_total,
			CASE
				WHEN COALESCE(SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END), 0) > 0
				THEN ROUND((SUM(CASE WHEN peso > 0 THEN nota_10 * peso ELSE 0 END) / SUM(CASE WHEN peso > 0 THEN peso ELSE 0 END))::numeric, 2)::double precision
				ELSE NULL
			END AS promedio_final_10
		FROM final_rows
		GROUP BY tipo_recurso
		ORDER BY tipo_recurso ASC
	`

	var items []ContribucionTipoRecursoItem
	err := r.db.WithContext(ctx).Raw(query, args...).Scan(&items).Error
	return items, err
}

func applyTrabajoScope(query *gorm.DB, filter TrabajoAnalyticsFilter) *gorm.DB {
	if filter.TeacherID != nil && *filter.TeacherID != "" {
		query = query.Where("c.teacher_id = ?", *filter.TeacherID)
	}
	if filter.CursoID != nil && *filter.CursoID != "" {
		query = query.Where("c.id = ?", *filter.CursoID)
	}
	if filter.UnidadID != nil && *filter.UnidadID != "" {
		query = query.Where("u.id = ?", *filter.UnidadID)
	}
	if filter.TemaID != nil && *filter.TemaID != "" {
		query = query.Where("t.id = ?", *filter.TemaID)
	}
	if filter.LeccionID != nil && *filter.LeccionID != "" {
		query = query.Where("l.id = ?", *filter.LeccionID)
	}
	return query
}

func applyEntregaScope(query *gorm.DB, filter TrabajoAnalyticsFilter) *gorm.DB {
	if filter.EstudianteID != nil && *filter.EstudianteID != "" {
		query = query.Where("e.estudiante_id = ?", *filter.EstudianteID)
	}
	if filter.From != nil {
		query = query.Where("e.submitted_at >= ?", *filter.From)
	}
	if filter.To != nil {
		query = query.Where("e.submitted_at <= ?", *filter.To)
	}
	return query
}

func buildFinalRowsCTE(filter TrabajoAnalyticsFilter) (string, []interface{}) {
	trabajoWhere, trabajoArgs := buildFinalRowsFilterClause(filter,
		"c.teacher_id", "c.id", "u.id", "t.id", "l.id", "te.estudiante_id", "te.submitted_at",
	)
	pruebaWhere, pruebaArgs := buildFinalRowsFilterClause(filter,
		"c.teacher_id", "c.id", "u.id", "t.id", "l.id", "br.usuario_id", "br.event_at",
	)
	recursoWhere, recursoArgs := buildFinalRowsFilterClause(filter,
		"c.teacher_id", "c.id", "u.id", "t.id", "l.id", "ps.user_id", "ps.updated_at",
	)

	cte := `
		WITH best_resultados AS (
			SELECT DISTINCT ON (rp.usuario_id, rp.prueba_id)
				rp.usuario_id,
				rp.prueba_id,
				rp.puntaje_obtenido,
				COALESCE(rp.completed_at, rp.created_at) AS event_at
			FROM internal.resultado_prueba rp
			ORDER BY rp.usuario_id, rp.prueba_id, rp.puntaje_obtenido DESC, COALESCE(rp.completed_at, rp.created_at) DESC
		),
		final_rows AS (
			SELECT
				te.estudiante_id AS user_id,
				p.display_name AS estudiante_nombre,
				p.email AS estudiante_email,
				c.id AS curso_id,
				c.nombre AS curso_nombre,
				u.id AS unidad_id,
				u.nombre AS unidad_nombre,
				t.id AS tema_id,
				t.nombre AS tema_nombre,
				l.id AS leccion_id,
				l.titulo AS leccion_titulo,
				'trabajo'::text AS tipo_recurso,
				COALESCE(tr.peso_calificacion, 1)::double precision AS peso,
				(LEAST(GREATEST(tc.puntaje, 0), 100) / 10.0)::double precision AS nota_10
			FROM internal.trabajo_entrega te
			JOIN internal.trabajo tr ON tr.id = te.trabajo_id
			JOIN internal.trabajo_calificacion tc ON tc.entrega_id = te.id
			JOIN internal.leccion l ON l.id = tr.leccion_id
			JOIN internal.tema t ON t.id = l.tema_id
			JOIN internal.unidad u ON u.id = t.unidad_id
			JOIN internal.materia m ON m.id = u.materia_id
			JOIN internal.curso c ON c.id = m.curso_id
			LEFT JOIN internal.profiles p ON p.id = te.estudiante_id
			WHERE 1 = 1` + trabajoWhere + `

			UNION ALL

			SELECT
				br.usuario_id AS user_id,
				p.display_name AS estudiante_nombre,
				p.email AS estudiante_email,
				c.id AS curso_id,
				c.nombre AS curso_nombre,
				u.id AS unidad_id,
				u.nombre AS unidad_nombre,
				t.id AS tema_id,
				t.nombre AS tema_nombre,
				l.id AS leccion_id,
				l.titulo AS leccion_titulo,
				'prueba'::text AS tipo_recurso,
				COALESCE(pr.peso_calificacion, 1)::double precision AS peso,
				(LEAST(GREATEST(br.puntaje_obtenido, 0), 100) / 10.0)::double precision AS nota_10
			FROM best_resultados br
			JOIN internal.prueba pr ON pr.id = br.prueba_id
			JOIN internal.leccion l ON l.id = pr.leccion_id
			JOIN internal.tema t ON t.id = l.tema_id
			JOIN internal.unidad u ON u.id = t.unidad_id
			JOIN internal.materia m ON m.id = u.materia_id
			JOIN internal.curso c ON c.id = m.curso_id
			LEFT JOIN internal.profiles p ON p.id = br.usuario_id
			WHERE 1 = 1` + pruebaWhere + `

			UNION ALL

			SELECT
				ps.user_id AS user_id,
				p.display_name AS estudiante_nombre,
				p.email AS estudiante_email,
				c.id AS curso_id,
				c.nombre AS curso_nombre,
				u.id AS unidad_id,
				u.nombre AS unidad_nombre,
				t.id AS tema_id,
				t.nombre AS tema_nombre,
				l.id AS leccion_id,
				l.titulo AS leccion_titulo,
				'otro_recurso'::text AS tipo_recurso,
				COALESCE(ls.peso_calificacion, 1)::double precision AS peso,
				CASE
					WHEN ps.puntuacion <= 10 THEN GREATEST(ps.puntuacion, 0)::double precision
					ELSE (LEAST(GREATEST(ps.puntuacion, 0), 100) / 10.0)::double precision
				END AS nota_10
			FROM internal.progreso_seccion ps
			JOIN internal.leccion_seccion ls ON ls.id = ps.leccion_seccion_id
			JOIN internal.leccion l ON l.id = ls.leccion_id
			JOIN internal.tema t ON t.id = l.tema_id
			JOIN internal.unidad u ON u.id = t.unidad_id
			JOIN internal.materia m ON m.id = u.materia_id
			JOIN internal.curso c ON c.id = m.curso_id
			LEFT JOIN internal.profiles p ON p.id = ps.user_id
			WHERE ls.calificable = TRUE
			  AND ls.tipo <> 'prueba'::internal.tipo_seccion
			  AND ps.puntuacion IS NOT NULL` + recursoWhere + `
		)
	`

	args := make([]interface{}, 0, len(trabajoArgs)+len(pruebaArgs)+len(recursoArgs))
	args = append(args, trabajoArgs...)
	args = append(args, pruebaArgs...)
	args = append(args, recursoArgs...)
	return cte, args
}

func buildFinalRowsFilterClause(
	filter TrabajoAnalyticsFilter,
	teacherCol string,
	cursoCol string,
	unidadCol string,
	temaCol string,
	leccionCol string,
	estudianteCol string,
	timeCol string,
) (string, []interface{}) {
	clauses := make([]string, 0, 7)
	args := make([]interface{}, 0, 7)

	if filter.TeacherID != nil && *filter.TeacherID != "" {
		clauses = append(clauses, teacherCol+" = ?")
		args = append(args, *filter.TeacherID)
	}
	if filter.CursoID != nil && *filter.CursoID != "" {
		clauses = append(clauses, cursoCol+" = ?")
		args = append(args, *filter.CursoID)
	}
	if filter.UnidadID != nil && *filter.UnidadID != "" {
		clauses = append(clauses, unidadCol+" = ?")
		args = append(args, *filter.UnidadID)
	}
	if filter.TemaID != nil && *filter.TemaID != "" {
		clauses = append(clauses, temaCol+" = ?")
		args = append(args, *filter.TemaID)
	}
	if filter.LeccionID != nil && *filter.LeccionID != "" {
		clauses = append(clauses, leccionCol+" = ?")
		args = append(args, *filter.LeccionID)
	}
	if filter.EstudianteID != nil && *filter.EstudianteID != "" {
		clauses = append(clauses, estudianteCol+" = ?")
		args = append(args, *filter.EstudianteID)
	}
	if filter.From != nil {
		clauses = append(clauses, timeCol+" >= ?")
		args = append(args, *filter.From)
	}
	if filter.To != nil {
		clauses = append(clauses, timeCol+" <= ?")
		args = append(args, *filter.To)
	}

	if len(clauses) == 0 {
		return "", args
	}
	return "\n\t\t\t  AND " + strings.Join(clauses, "\n\t\t\t  AND "), args
}

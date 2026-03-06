package evaluations

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

// ═══════════════════════════════════════════════════════════════
// PRUEBA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListPruebasByLeccion(ctx context.Context, leccionID string) ([]Prueba, error) {
	var items []Prueba
	err := r.db.WithContext(ctx).Where("leccion_id = ?", leccionID).Order("orden").Find(&items).Error
	return items, err
}

func (r *Repository) GetPrueba(ctx context.Context, id string) (*Prueba, error) {
	var p Prueba
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) GetPruebaCompleta(ctx context.Context, id string) (*PruebaCompleta, error) {
	prueba, err := r.GetPrueba(ctx, id)
	if err != nil {
		return nil, err
	}

	var preguntas []PreguntaConRespuestas
	if err := r.db.WithContext(ctx).Table("internal.pregunta").
		Where("prueba_id = ?", id).Order("orden").Find(&preguntas).Error; err != nil {
		return nil, err
	}

	for i := range preguntas {
		var respuestas []Respuesta
		if err := r.db.WithContext(ctx).Where("pregunta_id = ?", preguntas[i].ID).
			Order("orden").Find(&respuestas).Error; err != nil {
			return nil, err
		}
		preguntas[i].Respuestas = respuestas
	}

	return &PruebaCompleta{Prueba: *prueba, Preguntas: preguntas}, nil
}

func (r *Repository) CreatePrueba(ctx context.Context, req PruebaRequest, createdBy string) (*Prueba, error) {
	p := Prueba{
		LeccionID:    req.LeccionID,
		Titulo:       req.Titulo,
		TiempoLimite: req.TiempoLimite,
		CreatedBy:    &createdBy,
	}
	if req.PuntajeMinimo != nil {
		p.PuntajeMinimo = *req.PuntajeMinimo
	}
	if req.Orden != nil {
		p.Orden = *req.Orden
	}
	if err := r.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdatePrueba(ctx context.Context, id string, req PruebaRequest) (*Prueba, error) {
	updates := map[string]interface{}{}
	if req.Titulo != "" {
		updates["titulo"] = req.Titulo
	}
	if req.TiempoLimite != nil {
		updates["tiempo_limite"] = *req.TiempoLimite
	}
	if req.PuntajeMinimo != nil {
		updates["puntaje_minimo"] = *req.PuntajeMinimo
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Prueba{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetPrueba(ctx, id)
}

func (r *Repository) DeletePrueba(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Prueba{}).Error
}

// ═══════════════════════════════════════════════════════════════
// PREGUNTA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListPreguntas(ctx context.Context, pruebaID string) ([]PreguntaConRespuestas, error) {
	var items []PreguntaConRespuestas
	if err := r.db.WithContext(ctx).Table("internal.pregunta").
		Where("prueba_id = ?", pruebaID).Order("orden").Find(&items).Error; err != nil {
		return nil, err
	}

	for i := range items {
		var respuestas []Respuesta
		if err := r.db.WithContext(ctx).Where("pregunta_id = ?", items[i].ID).
			Order("orden").Find(&respuestas).Error; err != nil {
			return nil, err
		}
		items[i].Respuestas = respuestas
	}
	return items, nil
}

func (r *Repository) GetPregunta(ctx context.Context, id string) (*Pregunta, error) {
	var p Pregunta
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) CreatePregunta(ctx context.Context, req PreguntaRequest) (*Pregunta, error) {
	p := Pregunta{
		PruebaID: req.PruebaID,
		Texto:    req.Texto,
		Tipo:     req.Tipo,
	}
	if req.Orden != nil {
		p.Orden = *req.Orden
	}
	if err := r.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdatePregunta(ctx context.Context, id string, req PreguntaRequest) (*Pregunta, error) {
	updates := map[string]interface{}{}
	if req.Texto != "" {
		updates["texto"] = req.Texto
	}
	if req.Tipo != "" {
		updates["tipo"] = gorm.Expr("?::internal.tipo_pregunta", req.Tipo)
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Pregunta{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetPregunta(ctx, id)
}

func (r *Repository) DeletePregunta(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Pregunta{}).Error
}

// ═══════════════════════════════════════════════════════════════
// RESPUESTA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) GetRespuesta(ctx context.Context, id string) (*Respuesta, error) {
	var resp Respuesta
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&resp).Error; err != nil {
		return nil, err
	}
	return &resp, nil
}

func (r *Repository) CreateRespuesta(ctx context.Context, req RespuestaRequest) (*Respuesta, error) {
	resp := Respuesta{
		PreguntaID: req.PreguntaID,
		Texto:      req.Texto,
		EsCorrecta: req.EsCorrecta,
	}
	if req.Orden != nil {
		resp.Orden = *req.Orden
	}
	if err := r.db.WithContext(ctx).Create(&resp).Error; err != nil {
		return nil, err
	}
	return &resp, nil
}

func (r *Repository) UpdateRespuesta(ctx context.Context, id string, req RespuestaRequest) (*Respuesta, error) {
	updates := map[string]interface{}{
		"es_correcta": req.EsCorrecta,
	}
	if req.Texto != "" {
		updates["texto"] = req.Texto
	}
	if req.Orden != nil {
		updates["orden"] = *req.Orden
	}
	if err := r.db.WithContext(ctx).Model(&Respuesta{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetRespuesta(ctx, id)
}

func (r *Repository) DeleteRespuesta(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Respuesta{}).Error
}

// ═══════════════════════════════════════════════════════════════
// RESULTADO PRUEBA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) CreateResultado(ctx context.Context, req ResultadoPruebaRequest, usuarioID string) (*ResultadoPrueba, error) {
	res := ResultadoPrueba{
		PruebaID:        req.PruebaID,
		UsuarioID:       usuarioID,
		PuntajeObtenido: req.PuntajeObtenido,
		Aprobado:        req.Aprobado,
		Respuestas:      req.Respuestas,
		StartedAt:       req.StartedAt,
	}
	if err := r.db.WithContext(ctx).Create(&res).Error; err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *Repository) ListResultadosByPrueba(ctx context.Context, pruebaID string) ([]ResultadoPrueba, error) {
	var items []ResultadoPrueba
	err := r.db.WithContext(ctx).Where("prueba_id = ?", pruebaID).Order("completed_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) ListResultadosByUsuario(ctx context.Context, usuarioID, pruebaID string) ([]ResultadoPrueba, error) {
	var items []ResultadoPrueba
	err := r.db.WithContext(ctx).Where("usuario_id = ? AND prueba_id = ?", usuarioID, pruebaID).
		Order("started_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetBestResultado(ctx context.Context, usuarioID, pruebaID string) (*ResultadoPrueba, error) {
	var res ResultadoPrueba
	if err := r.db.WithContext(ctx).Where("usuario_id = ? AND prueba_id = ?", usuarioID, pruebaID).
		Order("puntaje_obtenido DESC").First(&res).Error; err != nil {
		return nil, err
	}
	return &res, nil
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO (nivel lección)
// ═══════════════════════════════════════════════════════════════

func (r *Repository) UpsertProgreso(ctx context.Context, usuarioID string, req ProgresoRequest) (*Progreso, error) {
	now := time.Now()
	p := Progreso{
		UsuarioID:         usuarioID,
		LeccionID:         req.LeccionID,
		FechaUltimoAcceso: &now,
	}
	if req.Completado != nil {
		p.Completado = *req.Completado
	}
	if req.Puntaje != nil {
		p.Puntaje = req.Puntaje
	}

	updateMap := map[string]interface{}{
		"fecha_ultimo_acceso": gorm.Expr("now()"),
	}
	if req.Completado != nil {
		updateMap["completado"] = *req.Completado
	}
	if req.Puntaje != nil {
		updateMap["puntaje"] = *req.Puntaje
	}

	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "usuario_id"}, {Name: "leccion_id"}},
		DoUpdates: clause.Assignments(updateMap),
	}).Create(&p).Error; err != nil {
		return nil, err
	}
	return r.GetProgreso(ctx, usuarioID, req.LeccionID)
}

func (r *Repository) ListProgresosByUsuario(ctx context.Context, usuarioID string) ([]Progreso, error) {
	var items []Progreso
	err := r.db.WithContext(ctx).Where("usuario_id = ?", usuarioID).Order("fecha_ultimo_acceso DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetProgreso(ctx context.Context, usuarioID, leccionID string) (*Progreso, error) {
	var p Progreso
	if err := r.db.WithContext(ctx).Where("usuario_id = ? AND leccion_id = ?", usuarioID, leccionID).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO SECCION
// ═══════════════════════════════════════════════════════════════

func (r *Repository) UpsertProgresoSeccion(ctx context.Context, userID string, req ProgresoSeccionRequest) (*ProgresoSeccion, error) {
	ps := ProgresoSeccion{
		UserID:           userID,
		LeccionSeccionID: req.LeccionSeccionID,
	}
	if req.Completado != nil {
		ps.Completado = *req.Completado
	}
	if req.Puntuacion != nil {
		ps.Puntuacion = req.Puntuacion
	}
	if req.TiempoDedicado != nil {
		ps.TiempoDedicado = *req.TiempoDedicado
	}
	if req.Intentos != nil {
		ps.Intentos = *req.Intentos
	}

	updateMap := map[string]interface{}{}
	if req.Completado != nil {
		updateMap["completado"] = *req.Completado
	}
	if req.Puntuacion != nil {
		updateMap["puntuacion"] = *req.Puntuacion
	}
	if req.TiempoDedicado != nil {
		updateMap["tiempo_dedicado"] = *req.TiempoDedicado
	}
	if req.Intentos != nil {
		updateMap["intentos"] = *req.Intentos
	}

	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "leccion_seccion_id"}},
		DoUpdates: clause.Assignments(updateMap),
	}).Create(&ps).Error; err != nil {
		return nil, err
	}

	// Re-fetch the upserted record
	var result ProgresoSeccion
	if err := r.db.WithContext(ctx).Where("user_id = ? AND leccion_seccion_id = ?", userID, req.LeccionSeccionID).
		First(&result).Error; err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *Repository) ListProgresoSeccionesByLeccion(ctx context.Context, userID, leccionID string) ([]ProgresoSeccion, error) {
	var items []ProgresoSeccion
	err := r.db.WithContext(ctx).Table("internal.progreso_seccion").
		Joins("JOIN internal.leccion_seccion ls ON ls.id = \"internal\".\"progreso_seccion\".leccion_seccion_id").
		Where("\"internal\".\"progreso_seccion\".user_id = ? AND ls.leccion_id = ?", userID, leccionID).
		Find(&items).Error
	return items, err
}

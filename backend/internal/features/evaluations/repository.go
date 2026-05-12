package evaluations

import (
	"context"
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

// ═══════════════════════════════════════════════════════════════
// PRUEBA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListPruebasByLeccion(ctx context.Context, leccionID string) ([]Prueba, error) {
	var items []Prueba
	err := r.db.WithContext(ctx).Where("leccion_id = ?", leccionID).Order("orden").Find(&items).Error
	return items, err
}

func (r *Repository) ListMisPruebasByEstudiante(ctx context.Context, estudianteID string) ([]PruebaAsignada, error) {
	var items []PruebaAsignada
	err := r.db.WithContext(ctx).
		Table("internal.prueba").
		Select("DISTINCT ON (internal.prueba.id) internal.prueba.*, l.titulo AS leccion_titulo, m.id AS materia_id, m.nombre AS materia_nombre").
		Joins("LEFT JOIN internal.leccion l ON l.id = internal.prueba.leccion_id").
		Joins("LEFT JOIN internal.tema t ON t.id = l.tema_id").
		Joins("LEFT JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = COALESCE(internal.prueba.materia_id, u.materia_id)").
		Joins("LEFT JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id AND ec.estudiante_id = ?", strings.TrimSpace(estudianteID)).
		Joins("LEFT JOIN internal.materia_seguimiento ms ON ms.materia_id = m.id AND ms.usuario_id = ?", strings.TrimSpace(estudianteID)).
		Where("(ec.id IS NOT NULL OR ms.id IS NOT NULL)").
		Where("(internal.prueba.fecha_publicacion IS NULL OR internal.prueba.fecha_publicacion <= ?)", time.Now()).
		Where("COALESCE(m.activo, TRUE) = TRUE").
		Order("internal.prueba.id, internal.prueba.created_at DESC").
		Find(&items).Error
	return items, err
}

func (r *Repository) ListPruebasByMateria(ctx context.Context, materiaID string) ([]Prueba, error) {
	var items []Prueba
	err := r.db.WithContext(ctx).
		Table("internal.prueba").
		Select("internal.prueba.*").
		Joins("LEFT JOIN internal.leccion l ON l.id = internal.prueba.leccion_id").
		Joins("LEFT JOIN internal.tema t ON t.id = l.tema_id").
		Joins("LEFT JOIN internal.unidad u ON u.id = t.unidad_id").
		Where("internal.prueba.materia_id = ? OR u.materia_id = ?", materiaID, materiaID).
		Order("internal.prueba.orden ASC, internal.prueba.created_at DESC").
		Find(&items).Error
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
		MateriaID:                 req.MateriaID,
		LeccionID:                 req.LeccionID,
		Titulo:                    req.Titulo,
		Descripcion:               req.Descripcion,
		TiempoLimite:              req.TiempoLimite,
		NotaMaxima:                10,
		PesoCalif:                 1,
		Activa:                    true,
		FechaPublicacion:          req.FechaPublicacion,
		FechaActivacion:           req.FechaActivacion,
		MostrarResultadoInmediato: true,
		CreatedBy:                 &createdBy,
	}
	if req.NotaMaxima != nil {
		p.NotaMaxima = *req.NotaMaxima
	}
	if req.PesoCalif != nil {
		p.PesoCalif = *req.PesoCalif
	}
	if req.PuntajeMinimo != nil {
		p.PuntajeMinimo = *req.PuntajeMinimo
	}
	if req.Activa != nil {
		p.Activa = *req.Activa
	}
	if req.MostrarResultadoInmediato != nil {
		p.MostrarResultadoInmediato = *req.MostrarResultadoInmediato
	}
	if req.RequiereRevisionDocente != nil {
		p.RequiereRevisionDocente = *req.RequiereRevisionDocente
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
	if req.MateriaID != nil {
		updates["materia_id"] = req.MateriaID
	}
	if req.TiempoLimite != nil {
		updates["tiempo_limite"] = *req.TiempoLimite
	}
	if req.Descripcion != nil {
		updates["descripcion"] = req.Descripcion
	}
	if req.NotaMaxima != nil {
		updates["nota_maxima"] = *req.NotaMaxima
	}
	if req.PesoCalif != nil {
		updates["peso_calificacion"] = *req.PesoCalif
	}
	if req.PuntajeMinimo != nil {
		updates["puntaje_minimo"] = *req.PuntajeMinimo
	}
	if req.Activa != nil {
		updates["activa"] = *req.Activa
	}
	if req.FechaPublicacion != nil {
		updates["fecha_publicacion"] = req.FechaPublicacion
	}
	if req.FechaActivacion != nil {
		updates["fecha_activacion"] = req.FechaActivacion
	}
	if req.MostrarResultadoInmediato != nil {
		updates["mostrar_resultado_inmediato"] = *req.MostrarResultadoInmediato
	}
	if req.RequiereRevisionDocente != nil {
		updates["requiere_revision_docente"] = *req.RequiereRevisionDocente
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
	puntajeMaximo := 1.0
	if req.PuntajeMaximo != nil {
		puntajeMaximo = *req.PuntajeMaximo
	}
	p := Pregunta{
		PruebaID:      req.PruebaID,
		Texto:         req.Texto,
		Tipo:          req.Tipo,
		PuntajeMaximo: puntajeMaximo,
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
	if req.PuntajeMaximo != nil {
		updates["puntaje_maximo"] = *req.PuntajeMaximo
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
		PruebaID:                 req.PruebaID,
		UsuarioID:                usuarioID,
		PuntajeObtenido:          req.PuntajeObtenido,
		Aprobado:                 req.Aprobado,
		Respuestas:               req.Respuestas,
		StartedAt:                req.StartedAt,
		MostrarPuntajeEstudiante: true,
	}
	if err := r.db.WithContext(ctx).Create(&res).Error; err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *Repository) UpdateResultadoAfterSubmit(ctx context.Context, resultadoID string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(&ResultadoPrueba{}).Where("id = ?", resultadoID).Updates(updates).Error
}

func (r *Repository) GetResultadoByID(ctx context.Context, id string) (*ResultadoPrueba, error) {
	var res ResultadoPrueba
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&res).Error; err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *Repository) UpdateResultadoByDocente(ctx context.Context, id string, req CalificarResultadoRequest, docenteID string) (*ResultadoPrueba, error) {
	updates := map[string]interface{}{
		"calificado_por_docente": true,
		"calificado_by":          strings.TrimSpace(docenteID),
		"calificado_at":          gorm.Expr("now()"),
	}
	if req.PuntajeObtenido != nil {
		updates["puntaje_obtenido"] = *req.PuntajeObtenido
	}
	if req.Aprobado != nil {
		updates["aprobado"] = *req.Aprobado
	}
	if req.FeedbackDocente != nil {
		updates["feedback_docente"] = req.FeedbackDocente
	}
	if req.MostrarPuntajeEstudiante != nil {
		updates["mostrar_puntaje_estudiante"] = *req.MostrarPuntajeEstudiante
	}
	if err := r.db.WithContext(ctx).Model(&ResultadoPrueba{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetResultadoByID(ctx, id)
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
	leccionSeccionID := req.LeccionSeccionID
	if leccionSeccionID == "" {
		leccionSeccionID = req.SeccionID
	}

	ps := ProgresoSeccion{
		UserID:           userID,
		LeccionSeccionID: leccionSeccionID,
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
	if err := r.db.WithContext(ctx).Where("user_id = ? AND leccion_seccion_id = ?", userID, leccionSeccionID).
		First(&result).Error; err != nil {
		return nil, err
	}
	result.SeccionID = result.LeccionSeccionID
	return &result, nil
}

func (r *Repository) ListProgresoSeccionesByLeccion(ctx context.Context, userID, leccionID string) ([]ProgresoSeccion, error) {
	var items []ProgresoSeccion
	err := r.db.WithContext(ctx).Table("internal.progreso_seccion").
		Joins("JOIN internal.leccion_seccion ls ON ls.id = \"internal\".\"progreso_seccion\".leccion_seccion_id").
		Where("\"internal\".\"progreso_seccion\".user_id = ? AND ls.leccion_id = ?", userID, leccionID).
		Find(&items).Error
	if err == nil {
		for i := range items {
			items[i].SeccionID = items[i].LeccionSeccionID
		}
	}
	return items, err
}

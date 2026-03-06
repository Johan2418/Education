package evaluations

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// ═══════════════════════════════════════════════════════════════
// PRUEBA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListPruebasByLeccion(ctx context.Context, leccionID string) ([]Prueba, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, leccion_id, titulo, tiempo_limite, puntaje_minimo, orden, created_by, created_at, updated_at
		FROM internal.prueba WHERE leccion_id = $1 ORDER BY orden
	`, leccionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Prueba
	for rows.Next() {
		var p Prueba
		if err := rows.Scan(&p.ID, &p.LeccionID, &p.Titulo, &p.TiempoLimite, &p.PuntajeMinimo,
			&p.Orden, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, nil
}

func (r *Repository) GetPrueba(ctx context.Context, id string) (*Prueba, error) {
	var p Prueba
	err := r.db.QueryRow(ctx, `
		SELECT id, leccion_id, titulo, tiempo_limite, puntaje_minimo, orden, created_by, created_at, updated_at
		FROM internal.prueba WHERE id = $1
	`, id).Scan(&p.ID, &p.LeccionID, &p.Titulo, &p.TiempoLimite, &p.PuntajeMinimo,
		&p.Orden, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) GetPruebaCompleta(ctx context.Context, id string) (*PruebaCompleta, error) {
	prueba, err := r.GetPrueba(ctx, id)
	if err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, prueba_id, texto, tipo, orden, created_at
		FROM internal.pregunta WHERE prueba_id = $1 ORDER BY orden
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var preguntas []PreguntaConRespuestas
	for rows.Next() {
		var p PreguntaConRespuestas
		if err := rows.Scan(&p.ID, &p.PruebaID, &p.Texto, &p.Tipo, &p.Orden, &p.CreatedAt); err != nil {
			return nil, err
		}
		preguntas = append(preguntas, p)
	}
	rows.Close()

	for i := range preguntas {
		rRows, err := r.db.Query(ctx, `
			SELECT id, pregunta_id, texto, es_correcta, orden
			FROM internal.respuesta WHERE pregunta_id = $1 ORDER BY orden
		`, preguntas[i].ID)
		if err != nil {
			return nil, err
		}
		for rRows.Next() {
			var resp Respuesta
			if err := rRows.Scan(&resp.ID, &resp.PreguntaID, &resp.Texto, &resp.EsCorrecta, &resp.Orden); err != nil {
				rRows.Close()
				return nil, err
			}
			preguntas[i].Respuestas = append(preguntas[i].Respuestas, resp)
		}
		rRows.Close()
	}

	return &PruebaCompleta{Prueba: *prueba, Preguntas: preguntas}, nil
}

func (r *Repository) CreatePrueba(ctx context.Context, req PruebaRequest, createdBy string) (*Prueba, error) {
	var p Prueba
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.prueba (leccion_id, titulo, tiempo_limite, puntaje_minimo, orden, created_by)
		VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 0), $6)
		RETURNING id, leccion_id, titulo, tiempo_limite, puntaje_minimo, orden, created_by, created_at, updated_at
	`, req.LeccionID, req.Titulo, req.TiempoLimite, req.PuntajeMinimo, req.Orden, createdBy).Scan(
		&p.ID, &p.LeccionID, &p.Titulo, &p.TiempoLimite, &p.PuntajeMinimo,
		&p.Orden, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdatePrueba(ctx context.Context, id string, req PruebaRequest) (*Prueba, error) {
	var p Prueba
	err := r.db.QueryRow(ctx, `
		UPDATE internal.prueba
		SET titulo = COALESCE(NULLIF($2, ''), titulo),
		    tiempo_limite = COALESCE($3, tiempo_limite),
		    puntaje_minimo = COALESCE($4, puntaje_minimo),
		    orden = COALESCE($5, orden)
		WHERE id = $1
		RETURNING id, leccion_id, titulo, tiempo_limite, puntaje_minimo, orden, created_by, created_at, updated_at
	`, id, req.Titulo, req.TiempoLimite, req.PuntajeMinimo, req.Orden).Scan(
		&p.ID, &p.LeccionID, &p.Titulo, &p.TiempoLimite, &p.PuntajeMinimo,
		&p.Orden, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) DeletePrueba(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.prueba WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// PREGUNTA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListPreguntas(ctx context.Context, pruebaID string) ([]PreguntaConRespuestas, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, prueba_id, texto, tipo, orden, created_at
		FROM internal.pregunta WHERE prueba_id = $1 ORDER BY orden
	`, pruebaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []PreguntaConRespuestas
	for rows.Next() {
		var p PreguntaConRespuestas
		if err := rows.Scan(&p.ID, &p.PruebaID, &p.Texto, &p.Tipo, &p.Orden, &p.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	rows.Close()

	for i := range items {
		rRows, err := r.db.Query(ctx, `
			SELECT id, pregunta_id, texto, es_correcta, orden
			FROM internal.respuesta WHERE pregunta_id = $1 ORDER BY orden
		`, items[i].ID)
		if err != nil {
			return nil, err
		}
		for rRows.Next() {
			var resp Respuesta
			if err := rRows.Scan(&resp.ID, &resp.PreguntaID, &resp.Texto, &resp.EsCorrecta, &resp.Orden); err != nil {
				rRows.Close()
				return nil, err
			}
			items[i].Respuestas = append(items[i].Respuestas, resp)
		}
		rRows.Close()
	}

	return items, nil
}

func (r *Repository) CreatePregunta(ctx context.Context, req PreguntaRequest) (*Pregunta, error) {
	var p Pregunta
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.pregunta (prueba_id, texto, tipo, orden)
		VALUES ($1, $2, $3::internal.tipo_pregunta, COALESCE($4, 0))
		RETURNING id, prueba_id, texto, tipo, orden, created_at
	`, req.PruebaID, req.Texto, req.Tipo, req.Orden).Scan(
		&p.ID, &p.PruebaID, &p.Texto, &p.Tipo, &p.Orden, &p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdatePregunta(ctx context.Context, id string, req PreguntaRequest) (*Pregunta, error) {
	var p Pregunta
	err := r.db.QueryRow(ctx, `
		UPDATE internal.pregunta
		SET texto = COALESCE(NULLIF($2, ''), texto),
		    tipo = COALESCE(NULLIF($3, '')::internal.tipo_pregunta, tipo),
		    orden = COALESCE($4, orden)
		WHERE id = $1
		RETURNING id, prueba_id, texto, tipo, orden, created_at
	`, id, req.Texto, req.Tipo, req.Orden).Scan(
		&p.ID, &p.PruebaID, &p.Texto, &p.Tipo, &p.Orden, &p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) DeletePregunta(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.pregunta WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// RESPUESTA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) CreateRespuesta(ctx context.Context, req RespuestaRequest) (*Respuesta, error) {
	var resp Respuesta
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.respuesta (pregunta_id, texto, es_correcta, orden)
		VALUES ($1, $2, $3, COALESCE($4, 0))
		RETURNING id, pregunta_id, texto, es_correcta, orden
	`, req.PreguntaID, req.Texto, req.EsCorrecta, req.Orden).Scan(
		&resp.ID, &resp.PreguntaID, &resp.Texto, &resp.EsCorrecta, &resp.Orden,
	)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (r *Repository) UpdateRespuesta(ctx context.Context, id string, req RespuestaRequest) (*Respuesta, error) {
	var resp Respuesta
	err := r.db.QueryRow(ctx, `
		UPDATE internal.respuesta
		SET texto = COALESCE(NULLIF($2, ''), texto),
		    es_correcta = $3,
		    orden = COALESCE($4, orden)
		WHERE id = $1
		RETURNING id, pregunta_id, texto, es_correcta, orden
	`, id, req.Texto, req.EsCorrecta, req.Orden).Scan(
		&resp.ID, &resp.PreguntaID, &resp.Texto, &resp.EsCorrecta, &resp.Orden,
	)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (r *Repository) DeleteRespuesta(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.respuesta WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// RESULTADO PRUEBA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) CreateResultado(ctx context.Context, req ResultadoPruebaRequest, usuarioID string) (*ResultadoPrueba, error) {
	var res ResultadoPrueba
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.resultado_prueba (prueba_id, usuario_id, puntaje_obtenido, aprobado, respuestas, started_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, prueba_id, usuario_id, puntaje_obtenido, aprobado, respuestas, started_at, completed_at, created_at
	`, req.PruebaID, usuarioID, req.PuntajeObtenido, req.Aprobado, req.Respuestas, req.StartedAt).Scan(
		&res.ID, &res.PruebaID, &res.UsuarioID, &res.PuntajeObtenido, &res.Aprobado,
		&res.Respuestas, &res.StartedAt, &res.CompletedAt, &res.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func (r *Repository) ListResultadosByPrueba(ctx context.Context, pruebaID string) ([]ResultadoPrueba, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, prueba_id, usuario_id, puntaje_obtenido, aprobado, respuestas, started_at, completed_at, created_at
		FROM internal.resultado_prueba WHERE prueba_id = $1 ORDER BY completed_at DESC
	`, pruebaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ResultadoPrueba
	for rows.Next() {
		var res ResultadoPrueba
		if err := rows.Scan(&res.ID, &res.PruebaID, &res.UsuarioID, &res.PuntajeObtenido, &res.Aprobado,
			&res.Respuestas, &res.StartedAt, &res.CompletedAt, &res.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, res)
	}
	return items, nil
}

func (r *Repository) ListResultadosByUsuario(ctx context.Context, usuarioID, pruebaID string) ([]ResultadoPrueba, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, prueba_id, usuario_id, puntaje_obtenido, aprobado, respuestas, started_at, completed_at, created_at
		FROM internal.resultado_prueba WHERE usuario_id = $1 AND prueba_id = $2 ORDER BY started_at DESC
	`, usuarioID, pruebaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ResultadoPrueba
	for rows.Next() {
		var res ResultadoPrueba
		if err := rows.Scan(&res.ID, &res.PruebaID, &res.UsuarioID, &res.PuntajeObtenido, &res.Aprobado,
			&res.Respuestas, &res.StartedAt, &res.CompletedAt, &res.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, res)
	}
	return items, nil
}

func (r *Repository) GetBestResultado(ctx context.Context, usuarioID, pruebaID string) (*ResultadoPrueba, error) {
	var res ResultadoPrueba
	err := r.db.QueryRow(ctx, `
		SELECT id, prueba_id, usuario_id, puntaje_obtenido, aprobado, respuestas, started_at, completed_at, created_at
		FROM internal.resultado_prueba
		WHERE usuario_id = $1 AND prueba_id = $2
		ORDER BY puntaje_obtenido DESC LIMIT 1
	`, usuarioID, pruebaID).Scan(
		&res.ID, &res.PruebaID, &res.UsuarioID, &res.PuntajeObtenido, &res.Aprobado,
		&res.Respuestas, &res.StartedAt, &res.CompletedAt, &res.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &res, nil
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO (nivel lección)
// ═══════════════════════════════════════════════════════════════

func (r *Repository) UpsertProgreso(ctx context.Context, usuarioID string, req ProgresoRequest) (*Progreso, error) {
	var p Progreso
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.progreso (usuario_id, leccion_id, completado, puntaje, fecha_ultimo_acceso)
		VALUES ($1, $2, COALESCE($3, FALSE), $4, now())
		ON CONFLICT (usuario_id, leccion_id) DO UPDATE
		SET completado = COALESCE($3, internal.progreso.completado),
		    puntaje = COALESCE($4, internal.progreso.puntaje),
		    fecha_ultimo_acceso = now()
		RETURNING id, usuario_id, leccion_id, completado, puntaje, fecha_ultimo_acceso, created_at, updated_at
	`, usuarioID, req.LeccionID, req.Completado, req.Puntaje).Scan(
		&p.ID, &p.UsuarioID, &p.LeccionID, &p.Completado, &p.Puntaje,
		&p.FechaUltimoAcceso, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) ListProgresosByUsuario(ctx context.Context, usuarioID string) ([]Progreso, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, usuario_id, leccion_id, completado, puntaje, fecha_ultimo_acceso, created_at, updated_at
		FROM internal.progreso WHERE usuario_id = $1 ORDER BY fecha_ultimo_acceso DESC
	`, usuarioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Progreso
	for rows.Next() {
		var p Progreso
		if err := rows.Scan(&p.ID, &p.UsuarioID, &p.LeccionID, &p.Completado, &p.Puntaje,
			&p.FechaUltimoAcceso, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, nil
}

func (r *Repository) GetProgreso(ctx context.Context, usuarioID, leccionID string) (*Progreso, error) {
	var p Progreso
	err := r.db.QueryRow(ctx, `
		SELECT id, usuario_id, leccion_id, completado, puntaje, fecha_ultimo_acceso, created_at, updated_at
		FROM internal.progreso WHERE usuario_id = $1 AND leccion_id = $2
	`, usuarioID, leccionID).Scan(
		&p.ID, &p.UsuarioID, &p.LeccionID, &p.Completado, &p.Puntaje,
		&p.FechaUltimoAcceso, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO SECCION
// ═══════════════════════════════════════════════════════════════

func (r *Repository) UpsertProgresoSeccion(ctx context.Context, userID string, req ProgresoSeccionRequest) (*ProgresoSeccion, error) {
	var ps ProgresoSeccion
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.progreso_seccion (user_id, leccion_seccion_id, completado, puntuacion, tiempo_dedicado, intentos)
		VALUES ($1, $2, COALESCE($3, FALSE), $4, COALESCE($5, 0), COALESCE($6, 0))
		ON CONFLICT (user_id, leccion_seccion_id) DO UPDATE
		SET completado = COALESCE($3, internal.progreso_seccion.completado),
		    puntuacion = COALESCE($4, internal.progreso_seccion.puntuacion),
		    tiempo_dedicado = COALESCE($5, internal.progreso_seccion.tiempo_dedicado),
		    intentos = COALESCE($6, internal.progreso_seccion.intentos)
		RETURNING id, user_id, leccion_seccion_id, completado, puntuacion, tiempo_dedicado, intentos, created_at, updated_at
	`, userID, req.LeccionSeccionID, req.Completado, req.Puntuacion, req.TiempoDedicado, req.Intentos).Scan(
		&ps.ID, &ps.UserID, &ps.LeccionSeccionID, &ps.Completado, &ps.Puntuacion,
		&ps.TiempoDedicado, &ps.Intentos, &ps.CreatedAt, &ps.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &ps, nil
}

func (r *Repository) ListProgresoSeccionesByLeccion(ctx context.Context, userID, leccionID string) ([]ProgresoSeccion, error) {
	rows, err := r.db.Query(ctx, `
		SELECT ps.id, ps.user_id, ps.leccion_seccion_id, ps.completado, ps.puntuacion, ps.tiempo_dedicado, ps.intentos, ps.created_at, ps.updated_at
		FROM internal.progreso_seccion ps
		JOIN internal.leccion_seccion ls ON ls.id = ps.leccion_seccion_id
		WHERE ps.user_id = $1 AND ls.leccion_id = $2
	`, userID, leccionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ProgresoSeccion
	for rows.Next() {
		var ps ProgresoSeccion
		if err := rows.Scan(&ps.ID, &ps.UserID, &ps.LeccionSeccionID, &ps.Completado, &ps.Puntuacion,
			&ps.TiempoDedicado, &ps.Intentos, &ps.CreatedAt, &ps.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, ps)
	}
	return items, nil
}

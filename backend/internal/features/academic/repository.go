package academic

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
// CURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListCursos(ctx context.Context) ([]Curso, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, nombre, descripcion, orden, activo, created_at, updated_at
		FROM internal.curso ORDER BY orden, nombre
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Curso
	for rows.Next() {
		var c Curso
		if err := rows.Scan(&c.ID, &c.Nombre, &c.Descripcion, &c.Orden, &c.Activo, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, nil
}

func (r *Repository) GetCurso(ctx context.Context, id string) (*Curso, error) {
	var c Curso
	err := r.db.QueryRow(ctx, `
		SELECT id, nombre, descripcion, orden, activo, created_at, updated_at
		FROM internal.curso WHERE id = $1
	`, id).Scan(&c.ID, &c.Nombre, &c.Descripcion, &c.Orden, &c.Activo, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) CreateCurso(ctx context.Context, req CursoRequest) (*Curso, error) {
	var c Curso
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.curso (nombre, descripcion, orden, activo)
		VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, TRUE))
		RETURNING id, nombre, descripcion, orden, activo, created_at, updated_at
	`, req.Nombre, req.Descripcion, req.Orden, req.Activo).Scan(
		&c.ID, &c.Nombre, &c.Descripcion, &c.Orden, &c.Activo, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) UpdateCurso(ctx context.Context, id string, req CursoRequest) (*Curso, error) {
	var c Curso
	err := r.db.QueryRow(ctx, `
		UPDATE internal.curso
		SET nombre = COALESCE(NULLIF($2, ''), nombre),
		    descripcion = COALESCE($3, descripcion),
		    orden = COALESCE($4, orden),
		    activo = COALESCE($5, activo)
		WHERE id = $1
		RETURNING id, nombre, descripcion, orden, activo, created_at, updated_at
	`, id, req.Nombre, req.Descripcion, req.Orden, req.Activo).Scan(
		&c.ID, &c.Nombre, &c.Descripcion, &c.Orden, &c.Activo, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) DeleteCurso(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.curso WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// ESTUDIANTE_CURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListEstudianteCursos(ctx context.Context, estudianteID string) ([]EstudianteCurso, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, estudiante_id, curso_id, anio_escolar, created_at
		FROM internal.estudiante_curso WHERE estudiante_id = $1
	`, estudianteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []EstudianteCurso
	for rows.Next() {
		var ec EstudianteCurso
		if err := rows.Scan(&ec.ID, &ec.EstudianteID, &ec.CursoID, &ec.AnioEscolar, &ec.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, ec)
	}
	return items, nil
}

func (r *Repository) EnrollStudent(ctx context.Context, req EstudianteCursoRequest) (*EstudianteCurso, error) {
	var ec EstudianteCurso
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.estudiante_curso (estudiante_id, curso_id, anio_escolar)
		VALUES ($1, $2, $3)
		ON CONFLICT (estudiante_id, curso_id, anio_escolar) DO NOTHING
		RETURNING id, estudiante_id, curso_id, anio_escolar, created_at
	`, req.EstudianteID, req.CursoID, req.AnioEscolar).Scan(
		&ec.ID, &ec.EstudianteID, &ec.CursoID, &ec.AnioEscolar, &ec.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &ec, nil
}

func (r *Repository) UnenrollStudent(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.estudiante_curso WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// MATERIA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListMaterias(ctx context.Context, cursoID string) ([]Materia, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, curso_id, nombre, descripcion, thumbnail_url, color, orden, activo, created_by, created_at, updated_at
		FROM internal.materia WHERE curso_id = $1 ORDER BY orden, nombre
	`, cursoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Materia
	for rows.Next() {
		var m Materia
		if err := rows.Scan(&m.ID, &m.CursoID, &m.Nombre, &m.Descripcion, &m.ThumbnailURL, &m.Color,
			&m.Orden, &m.Activo, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, nil
}

func (r *Repository) GetMateria(ctx context.Context, id string) (*Materia, error) {
	var m Materia
	err := r.db.QueryRow(ctx, `
		SELECT id, curso_id, nombre, descripcion, thumbnail_url, color, orden, activo, created_by, created_at, updated_at
		FROM internal.materia WHERE id = $1
	`, id).Scan(&m.ID, &m.CursoID, &m.Nombre, &m.Descripcion, &m.ThumbnailURL, &m.Color,
		&m.Orden, &m.Activo, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) CreateMateria(ctx context.Context, req MateriaRequest, createdBy string) (*Materia, error) {
	var m Materia
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.materia (curso_id, nombre, descripcion, thumbnail_url, color, orden, activo, created_by)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, TRUE), $8)
		RETURNING id, curso_id, nombre, descripcion, thumbnail_url, color, orden, activo, created_by, created_at, updated_at
	`, req.CursoID, req.Nombre, req.Descripcion, req.ThumbnailURL, req.Color, req.Orden, req.Activo, createdBy).Scan(
		&m.ID, &m.CursoID, &m.Nombre, &m.Descripcion, &m.ThumbnailURL, &m.Color,
		&m.Orden, &m.Activo, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) UpdateMateria(ctx context.Context, id string, req MateriaRequest) (*Materia, error) {
	var m Materia
	err := r.db.QueryRow(ctx, `
		UPDATE internal.materia
		SET curso_id = COALESCE(NULLIF($2, ''), curso_id)::UUID,
		    nombre = COALESCE(NULLIF($3, ''), nombre),
		    descripcion = COALESCE($4, descripcion),
		    thumbnail_url = COALESCE($5, thumbnail_url),
		    color = COALESCE($6, color),
		    orden = COALESCE($7, orden),
		    activo = COALESCE($8, activo)
		WHERE id = $1
		RETURNING id, curso_id, nombre, descripcion, thumbnail_url, color, orden, activo, created_by, created_at, updated_at
	`, id, req.CursoID, req.Nombre, req.Descripcion, req.ThumbnailURL, req.Color, req.Orden, req.Activo).Scan(
		&m.ID, &m.CursoID, &m.Nombre, &m.Descripcion, &m.ThumbnailURL, &m.Color,
		&m.Orden, &m.Activo, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) DeleteMateria(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.materia WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// UNIDAD
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListUnidades(ctx context.Context, materiaID string) ([]Unidad, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, materia_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
		FROM internal.unidad WHERE materia_id = $1 ORDER BY orden, nombre
	`, materiaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Unidad
	for rows.Next() {
		var u Unidad
		if err := rows.Scan(&u.ID, &u.MateriaID, &u.Nombre, &u.Descripcion, &u.Orden, &u.Activo, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, u)
	}
	return items, nil
}

func (r *Repository) GetUnidad(ctx context.Context, id string) (*Unidad, error) {
	var u Unidad
	err := r.db.QueryRow(ctx, `
		SELECT id, materia_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
		FROM internal.unidad WHERE id = $1
	`, id).Scan(&u.ID, &u.MateriaID, &u.Nombre, &u.Descripcion, &u.Orden, &u.Activo, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) CreateUnidad(ctx context.Context, req UnidadRequest, createdBy string) (*Unidad, error) {
	var u Unidad
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.unidad (materia_id, nombre, descripcion, orden, activo, created_by)
		VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, TRUE), $6)
		RETURNING id, materia_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
	`, req.MateriaID, req.Nombre, req.Descripcion, req.Orden, req.Activo, createdBy).Scan(
		&u.ID, &u.MateriaID, &u.Nombre, &u.Descripcion, &u.Orden, &u.Activo, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) UpdateUnidad(ctx context.Context, id string, req UnidadRequest) (*Unidad, error) {
	var u Unidad
	err := r.db.QueryRow(ctx, `
		UPDATE internal.unidad
		SET nombre = COALESCE(NULLIF($2, ''), nombre),
		    descripcion = COALESCE($3, descripcion),
		    orden = COALESCE($4, orden),
		    activo = COALESCE($5, activo)
		WHERE id = $1
		RETURNING id, materia_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
	`, id, req.Nombre, req.Descripcion, req.Orden, req.Activo).Scan(
		&u.ID, &u.MateriaID, &u.Nombre, &u.Descripcion, &u.Orden, &u.Activo, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) DeleteUnidad(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.unidad WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// TEMA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListTemas(ctx context.Context, unidadID string) ([]Tema, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, unidad_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
		FROM internal.tema WHERE unidad_id = $1 ORDER BY orden, nombre
	`, unidadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Tema
	for rows.Next() {
		var t Tema
		if err := rows.Scan(&t.ID, &t.UnidadID, &t.Nombre, &t.Descripcion, &t.Orden, &t.Activo, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, t)
	}
	return items, nil
}

func (r *Repository) GetTema(ctx context.Context, id string) (*Tema, error) {
	var t Tema
	err := r.db.QueryRow(ctx, `
		SELECT id, unidad_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
		FROM internal.tema WHERE id = $1
	`, id).Scan(&t.ID, &t.UnidadID, &t.Nombre, &t.Descripcion, &t.Orden, &t.Activo, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) CreateTema(ctx context.Context, req TemaRequest, createdBy string) (*Tema, error) {
	var t Tema
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.tema (unidad_id, nombre, descripcion, orden, activo, created_by)
		VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, TRUE), $6)
		RETURNING id, unidad_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
	`, req.UnidadID, req.Nombre, req.Descripcion, req.Orden, req.Activo, createdBy).Scan(
		&t.ID, &t.UnidadID, &t.Nombre, &t.Descripcion, &t.Orden, &t.Activo, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) UpdateTema(ctx context.Context, id string, req TemaRequest) (*Tema, error) {
	var t Tema
	err := r.db.QueryRow(ctx, `
		UPDATE internal.tema
		SET nombre = COALESCE(NULLIF($2, ''), nombre),
		    descripcion = COALESCE($3, descripcion),
		    orden = COALESCE($4, orden),
		    activo = COALESCE($5, activo)
		WHERE id = $1
		RETURNING id, unidad_id, nombre, descripcion, orden, activo, created_by, created_at, updated_at
	`, id, req.Nombre, req.Descripcion, req.Orden, req.Activo).Scan(
		&t.ID, &t.UnidadID, &t.Nombre, &t.Descripcion, &t.Orden, &t.Activo, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) DeleteTema(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.tema WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// LECCION
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListLecciones(ctx context.Context, temaID string) ([]Leccion, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, tema_id, titulo, descripcion, thumbnail_url, orden, activo, created_by, created_at, updated_at
		FROM internal.leccion WHERE tema_id = $1 ORDER BY orden, titulo
	`, temaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Leccion
	for rows.Next() {
		var l Leccion
		if err := rows.Scan(&l.ID, &l.TemaID, &l.Titulo, &l.Descripcion, &l.ThumbnailURL, &l.Orden, &l.Activo, &l.CreatedBy, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, l)
	}
	return items, nil
}

func (r *Repository) GetLeccion(ctx context.Context, id string) (*Leccion, error) {
	var l Leccion
	err := r.db.QueryRow(ctx, `
		SELECT id, tema_id, titulo, descripcion, thumbnail_url, orden, activo, created_by, created_at, updated_at
		FROM internal.leccion WHERE id = $1
	`, id).Scan(&l.ID, &l.TemaID, &l.Titulo, &l.Descripcion, &l.ThumbnailURL, &l.Orden, &l.Activo, &l.CreatedBy, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) CreateLeccion(ctx context.Context, req LeccionRequest, createdBy string) (*Leccion, error) {
	var l Leccion
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.leccion (tema_id, titulo, descripcion, thumbnail_url, orden, activo, created_by)
		VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, TRUE), $7)
		RETURNING id, tema_id, titulo, descripcion, thumbnail_url, orden, activo, created_by, created_at, updated_at
	`, req.TemaID, req.Titulo, req.Descripcion, req.ThumbnailURL, req.Orden, req.Activo, createdBy).Scan(
		&l.ID, &l.TemaID, &l.Titulo, &l.Descripcion, &l.ThumbnailURL, &l.Orden, &l.Activo, &l.CreatedBy, &l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) UpdateLeccion(ctx context.Context, id string, req LeccionRequest) (*Leccion, error) {
	var l Leccion
	err := r.db.QueryRow(ctx, `
		UPDATE internal.leccion
		SET titulo = COALESCE(NULLIF($2, ''), titulo),
		    descripcion = COALESCE($3, descripcion),
		    thumbnail_url = COALESCE($4, thumbnail_url),
		    orden = COALESCE($5, orden),
		    activo = COALESCE($6, activo)
		WHERE id = $1
		RETURNING id, tema_id, titulo, descripcion, thumbnail_url, orden, activo, created_by, created_at, updated_at
	`, id, req.Titulo, req.Descripcion, req.ThumbnailURL, req.Orden, req.Activo).Scan(
		&l.ID, &l.TemaID, &l.Titulo, &l.Descripcion, &l.ThumbnailURL, &l.Orden, &l.Activo, &l.CreatedBy, &l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) DeleteLeccion(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.leccion WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// LECCION SECCION
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListSecciones(ctx context.Context, leccionID string) ([]LeccionSeccion, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, leccion_id, tipo, recurso_id, prueba_id, modelo_id, orden, es_obligatorio, requisitos, created_at
		FROM internal.leccion_seccion WHERE leccion_id = $1 ORDER BY orden
	`, leccionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []LeccionSeccion
	for rows.Next() {
		var s LeccionSeccion
		if err := rows.Scan(&s.ID, &s.LeccionID, &s.Tipo, &s.RecursoID, &s.PruebaID, &s.ModeloID,
			&s.Orden, &s.EsObligatorio, &s.Requisitos, &s.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, s)
	}
	return items, nil
}

func (r *Repository) CreateSeccion(ctx context.Context, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	var s LeccionSeccion
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.leccion_seccion (leccion_id, tipo, recurso_id, prueba_id, modelo_id, orden, es_obligatorio, requisitos)
		VALUES ($1, $2::internal.tipo_seccion, $3, $4, $5, COALESCE($6, 0), COALESCE($7, TRUE), $8)
		RETURNING id, leccion_id, tipo, recurso_id, prueba_id, modelo_id, orden, es_obligatorio, requisitos, created_at
	`, req.LeccionID, req.Tipo, req.RecursoID, req.PruebaID, req.ModeloID, req.Orden, req.EsObligatorio, req.Requisitos).Scan(
		&s.ID, &s.LeccionID, &s.Tipo, &s.RecursoID, &s.PruebaID, &s.ModeloID,
		&s.Orden, &s.EsObligatorio, &s.Requisitos, &s.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) UpdateSeccion(ctx context.Context, id string, req LeccionSeccionRequest) (*LeccionSeccion, error) {
	var s LeccionSeccion
	err := r.db.QueryRow(ctx, `
		UPDATE internal.leccion_seccion
		SET tipo = COALESCE(NULLIF($2, '')::internal.tipo_seccion, tipo),
		    recurso_id = $3, prueba_id = $4, modelo_id = $5,
		    orden = COALESCE($6, orden),
		    es_obligatorio = COALESCE($7, es_obligatorio),
		    requisitos = COALESCE($8, requisitos)
		WHERE id = $1
		RETURNING id, leccion_id, tipo, recurso_id, prueba_id, modelo_id, orden, es_obligatorio, requisitos, created_at
	`, id, req.Tipo, req.RecursoID, req.PruebaID, req.ModeloID, req.Orden, req.EsObligatorio, req.Requisitos).Scan(
		&s.ID, &s.LeccionID, &s.Tipo, &s.RecursoID, &s.PruebaID, &s.ModeloID,
		&s.Orden, &s.EsObligatorio, &s.Requisitos, &s.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) DeleteSeccion(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.leccion_seccion WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// MATERIA SEGUIMIENTO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListSeguimientos(ctx context.Context, usuarioID string) ([]MateriaSeguimiento, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, usuario_id, materia_id, fecha_seguimiento
		FROM internal.materia_seguimiento WHERE usuario_id = $1
	`, usuarioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []MateriaSeguimiento
	for rows.Next() {
		var ms MateriaSeguimiento
		if err := rows.Scan(&ms.ID, &ms.UsuarioID, &ms.MateriaID, &ms.FechaSeguimiento); err != nil {
			return nil, err
		}
		items = append(items, ms)
	}
	return items, nil
}

func (r *Repository) SeguirMateria(ctx context.Context, usuarioID, materiaID string) (*MateriaSeguimiento, error) {
	var ms MateriaSeguimiento
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.materia_seguimiento (usuario_id, materia_id)
		VALUES ($1, $2)
		ON CONFLICT (usuario_id, materia_id) DO UPDATE SET fecha_seguimiento = now()
		RETURNING id, usuario_id, materia_id, fecha_seguimiento
	`, usuarioID, materiaID).Scan(&ms.ID, &ms.UsuarioID, &ms.MateriaID, &ms.FechaSeguimiento)
	if err != nil {
		return nil, err
	}
	return &ms, nil
}

func (r *Repository) DejarDeSeguirMateria(ctx context.Context, usuarioID, materiaID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM internal.materia_seguimiento WHERE usuario_id = $1 AND materia_id = $2
	`, usuarioID, materiaID)
	return err
}

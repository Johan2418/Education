package resources

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
// RECURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListRecursos(ctx context.Context) ([]Recurso, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, titulo, descripcion, tipo, archivo_url, texto_html, tags, es_publico, created_by, created_at, updated_at
		FROM internal.recurso ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Recurso
	for rows.Next() {
		var rc Recurso
		if err := rows.Scan(&rc.ID, &rc.Titulo, &rc.Descripcion, &rc.Tipo, &rc.ArchivoURL, &rc.TextoHTML,
			&rc.Tags, &rc.EsPublico, &rc.CreatedBy, &rc.CreatedAt, &rc.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, rc)
	}
	return items, nil
}

func (r *Repository) GetRecurso(ctx context.Context, id string) (*Recurso, error) {
	var rc Recurso
	err := r.db.QueryRow(ctx, `
		SELECT id, titulo, descripcion, tipo, archivo_url, texto_html, tags, es_publico, created_by, created_at, updated_at
		FROM internal.recurso WHERE id = $1
	`, id).Scan(&rc.ID, &rc.Titulo, &rc.Descripcion, &rc.Tipo, &rc.ArchivoURL, &rc.TextoHTML,
		&rc.Tags, &rc.EsPublico, &rc.CreatedBy, &rc.CreatedAt, &rc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) CreateRecurso(ctx context.Context, req RecursoRequest, createdBy string) (*Recurso, error) {
	var rc Recurso
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.recurso (titulo, descripcion, tipo, archivo_url, texto_html, tags, es_publico, created_by)
		VALUES ($1, $2, $3::internal.tipo_recurso, $4, $5, $6, COALESCE($7, TRUE), $8)
		RETURNING id, titulo, descripcion, tipo, archivo_url, texto_html, tags, es_publico, created_by, created_at, updated_at
	`, req.Titulo, req.Descripcion, req.Tipo, req.ArchivoURL, req.TextoHTML, req.Tags, req.EsPublico, createdBy).Scan(
		&rc.ID, &rc.Titulo, &rc.Descripcion, &rc.Tipo, &rc.ArchivoURL, &rc.TextoHTML,
		&rc.Tags, &rc.EsPublico, &rc.CreatedBy, &rc.CreatedAt, &rc.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) UpdateRecurso(ctx context.Context, id string, req RecursoRequest) (*Recurso, error) {
	var rc Recurso
	err := r.db.QueryRow(ctx, `
		UPDATE internal.recurso
		SET titulo = COALESCE(NULLIF($2, ''), titulo),
		    descripcion = COALESCE($3, descripcion),
		    tipo = COALESCE(NULLIF($4, '')::internal.tipo_recurso, tipo),
		    archivo_url = COALESCE($5, archivo_url),
		    texto_html = COALESCE($6, texto_html),
		    tags = COALESCE($7, tags),
		    es_publico = COALESCE($8, es_publico)
		WHERE id = $1
		RETURNING id, titulo, descripcion, tipo, archivo_url, texto_html, tags, es_publico, created_by, created_at, updated_at
	`, id, req.Titulo, req.Descripcion, req.Tipo, req.ArchivoURL, req.TextoHTML, req.Tags, req.EsPublico).Scan(
		&rc.ID, &rc.Titulo, &rc.Descripcion, &rc.Tipo, &rc.ArchivoURL, &rc.TextoHTML,
		&rc.Tags, &rc.EsPublico, &rc.CreatedBy, &rc.CreatedAt, &rc.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) DeleteRecurso(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.recurso WHERE id = $1`, id)
	return err
}

// ═══════════════════════════════════════════════════════════════
// MODELO RA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListModelos(ctx context.Context) ([]ModeloRA, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, nombre_modelo, archivo_url, tipo, keywords, molecule_formula, categoria, es_publico, created_by, created_at, updated_at
		FROM internal.modelo_ra ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ModeloRA
	for rows.Next() {
		var m ModeloRA
		if err := rows.Scan(&m.ID, &m.NombreModelo, &m.ArchivoURL, &m.Tipo, &m.Keywords,
			&m.MoleculeFormula, &m.Categoria, &m.EsPublico, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, nil
}

func (r *Repository) GetModelo(ctx context.Context, id string) (*ModeloRA, error) {
	var m ModeloRA
	err := r.db.QueryRow(ctx, `
		SELECT id, nombre_modelo, archivo_url, tipo, keywords, molecule_formula, categoria, es_publico, created_by, created_at, updated_at
		FROM internal.modelo_ra WHERE id = $1
	`, id).Scan(&m.ID, &m.NombreModelo, &m.ArchivoURL, &m.Tipo, &m.Keywords,
		&m.MoleculeFormula, &m.Categoria, &m.EsPublico, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) CreateModelo(ctx context.Context, req ModeloRARequest, createdBy string) (*ModeloRA, error) {
	var m ModeloRA
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.modelo_ra (nombre_modelo, archivo_url, tipo, keywords, molecule_formula, categoria, es_publico, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), $8)
		RETURNING id, nombre_modelo, archivo_url, tipo, keywords, molecule_formula, categoria, es_publico, created_by, created_at, updated_at
	`, req.NombreModelo, req.ArchivoURL, req.Tipo, req.Keywords, req.MoleculeFormula, req.Categoria, req.EsPublico, createdBy).Scan(
		&m.ID, &m.NombreModelo, &m.ArchivoURL, &m.Tipo, &m.Keywords,
		&m.MoleculeFormula, &m.Categoria, &m.EsPublico, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) UpdateModelo(ctx context.Context, id string, req ModeloRARequest) (*ModeloRA, error) {
	var m ModeloRA
	err := r.db.QueryRow(ctx, `
		UPDATE internal.modelo_ra
		SET nombre_modelo = COALESCE(NULLIF($2, ''), nombre_modelo),
		    archivo_url = COALESCE($3, archivo_url),
		    tipo = COALESCE($4, tipo),
		    keywords = COALESCE($5, keywords),
		    molecule_formula = COALESCE($6, molecule_formula),
		    categoria = COALESCE($7, categoria),
		    es_publico = COALESCE($8, es_publico)
		WHERE id = $1
		RETURNING id, nombre_modelo, archivo_url, tipo, keywords, molecule_formula, categoria, es_publico, created_by, created_at, updated_at
	`, id, req.NombreModelo, req.ArchivoURL, req.Tipo, req.Keywords, req.MoleculeFormula, req.Categoria, req.EsPublico).Scan(
		&m.ID, &m.NombreModelo, &m.ArchivoURL, &m.Tipo, &m.Keywords,
		&m.MoleculeFormula, &m.Categoria, &m.EsPublico, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) DeleteModelo(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.modelo_ra WHERE id = $1`, id)
	return err
}

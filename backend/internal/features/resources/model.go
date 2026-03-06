package resources

import "time"

// ─── Recurso ────────────────────────────────────────────────

type Recurso struct {
	ID          string    `json:"id"`
	Titulo      string    `json:"titulo"`
	Descripcion *string   `json:"descripcion"`
	Tipo        string    `json:"tipo"`
	ArchivoURL  *string   `json:"archivo_url"`
	TextoHTML   *string   `json:"texto_html"`
	Tags        []string  `json:"tags"`
	EsPublico   bool      `json:"es_publico"`
	CreatedBy   *string   `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type RecursoRequest struct {
	Titulo      string   `json:"titulo"`
	Descripcion *string  `json:"descripcion"`
	Tipo        string   `json:"tipo"`
	ArchivoURL  *string  `json:"archivo_url"`
	TextoHTML   *string  `json:"texto_html"`
	Tags        []string `json:"tags"`
	EsPublico   *bool    `json:"es_publico"`
}

// ─── Modelo RA ──────────────────────────────────────────────

type ModeloRA struct {
	ID              string    `json:"id"`
	NombreModelo    string    `json:"nombre_modelo"`
	ArchivoURL      *string   `json:"archivo_url"`
	Tipo            *string   `json:"tipo"`
	Keywords        []string  `json:"keywords"`
	MoleculeFormula *string   `json:"molecule_formula"`
	Categoria       *string   `json:"categoria"`
	EsPublico       bool      `json:"es_publico"`
	CreatedBy       *string   `json:"created_by"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type ModeloRARequest struct {
	NombreModelo    string   `json:"nombre_modelo"`
	ArchivoURL      *string  `json:"archivo_url"`
	Tipo            *string  `json:"tipo"`
	Keywords        []string `json:"keywords"`
	MoleculeFormula *string  `json:"molecule_formula"`
	Categoria       *string  `json:"categoria"`
	EsPublico       *bool    `json:"es_publico"`
}

package resources

import (
	"time"

	"github.com/lib/pq"
)

// ─── Recurso ────────────────────────────────────────────────

type Recurso struct {
	ID          string         `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	Titulo      string         `json:"titulo" gorm:"column:titulo"`
	Descripcion *string        `json:"descripcion" gorm:"column:descripcion"`
	Tipo        string         `json:"tipo" gorm:"column:tipo;type:internal.tipo_recurso"`
	ArchivoURL  *string        `json:"archivo_url" gorm:"column:archivo_url"`
	TextoHTML   *string        `json:"texto_html" gorm:"column:texto_html"`
	Tags        pq.StringArray `json:"tags" gorm:"column:tags;type:text[]"`
	EsPublico   bool           `json:"es_publico" gorm:"column:es_publico;default:true"`
	CreatedBy   *string        `json:"created_by" gorm:"column:created_by"`
	CreatedAt   time.Time      `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time      `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Recurso) TableName() string { return "internal.recurso" }

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
	ID              string         `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	NombreModelo    string         `json:"nombre_modelo" gorm:"column:nombre_modelo"`
	ArchivoURL      *string        `json:"archivo_url" gorm:"column:archivo_url"`
	Tipo            *string        `json:"tipo" gorm:"column:tipo"`
	Keywords        pq.StringArray `json:"keywords" gorm:"column:keywords;type:text[]"`
	MoleculeFormula *string        `json:"molecule_formula" gorm:"column:molecule_formula"`
	Categoria       *string        `json:"categoria" gorm:"column:categoria"`
	EsPublico       bool           `json:"es_publico" gorm:"column:es_publico;default:true"`
	CreatedBy       *string        `json:"created_by" gorm:"column:created_by"`
	CreatedAt       time.Time      `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       time.Time      `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ModeloRA) TableName() string { return "internal.modelo_ra" }

type ModeloRARequest struct {
	NombreModelo    string   `json:"nombre_modelo"`
	ArchivoURL      *string  `json:"archivo_url"`
	Tipo            *string  `json:"tipo"`
	Keywords        []string `json:"keywords"`
	MoleculeFormula *string  `json:"molecule_formula"`
	Categoria       *string  `json:"categoria"`
	EsPublico       *bool    `json:"es_publico"`
}

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

// ─── Recurso Personal ───────────────────────────────────────

type RecursoPersonal struct {
	ID             string         `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	OwnerTeacherID string         `json:"owner_teacher_id" gorm:"column:owner_teacher_id"`
	Titulo         string         `json:"titulo" gorm:"column:titulo"`
	Descripcion    *string        `json:"descripcion" gorm:"column:descripcion"`
	Tipo           string         `json:"tipo" gorm:"column:tipo;type:internal.tipo_recurso_personal"`
	URL            *string        `json:"url" gorm:"column:url"`
	HTMLContenido  *string        `json:"html_contenido" gorm:"column:html_contenido"`
	TextoContenido *string        `json:"texto_contenido" gorm:"column:texto_contenido"`
	Tags           pq.StringArray `json:"tags" gorm:"column:tags;type:text[]"`
	Activo         bool           `json:"activo" gorm:"column:activo;default:true"`
	CreatedAt      time.Time      `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time      `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (RecursoPersonal) TableName() string { return "internal.recurso_personal" }

type RecursoPersonalRequest struct {
	Titulo         string   `json:"titulo"`
	Descripcion    *string  `json:"descripcion"`
	Tipo           string   `json:"tipo"`
	URL            *string  `json:"url"`
	HTMLContenido  *string  `json:"html_contenido"`
	TextoContenido *string  `json:"texto_contenido"`
	Tags           []string `json:"tags"`
	Activo         *bool    `json:"activo"`
}

type ListRecursosPersonalesQuery struct {
	Q      string
	Tipo   string
	Activo *bool
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

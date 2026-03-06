package academic

import (
	"time"

	"github.com/lib/pq"
)

// ─── Curso ──────────────────────────────────────────────────

type Curso struct {
	ID          string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	Nombre      string    `json:"nombre" gorm:"column:nombre;uniqueIndex"`
	Descripcion *string   `json:"descripcion" gorm:"column:descripcion"`
	Orden       int       `json:"orden" gorm:"column:orden;default:0"`
	Activo      bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedAt   time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Curso) TableName() string { return "internal.curso" }

type CursoRequest struct {
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Estudiante-Curso ───────────────────────────────────────

type EstudianteCurso struct {
	ID           string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	EstudianteID string    `json:"estudiante_id" gorm:"column:estudiante_id"`
	CursoID      string    `json:"curso_id" gorm:"column:curso_id"`
	AnioEscolar  *string   `json:"anio_escolar" gorm:"column:anio_escolar"`
	CreatedAt    time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (EstudianteCurso) TableName() string { return "internal.estudiante_curso" }

type EstudianteCursoRequest struct {
	EstudianteID string  `json:"estudiante_id"`
	CursoID      string  `json:"curso_id"`
	AnioEscolar  *string `json:"anio_escolar"`
}

// ─── Materia ────────────────────────────────────────────────

type Materia struct {
	ID           string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	CursoID      string    `json:"curso_id" gorm:"column:curso_id"`
	Nombre       string    `json:"nombre" gorm:"column:nombre"`
	Descripcion  *string   `json:"descripcion" gorm:"column:descripcion"`
	ThumbnailURL *string   `json:"thumbnail_url" gorm:"column:thumbnail_url"`
	Color        *string   `json:"color" gorm:"column:color"`
	Orden        int       `json:"orden" gorm:"column:orden;default:0"`
	Activo       bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy    *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt    time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Materia) TableName() string { return "internal.materia" }

type MateriaRequest struct {
	CursoID      string  `json:"curso_id"`
	Nombre       string  `json:"nombre"`
	Descripcion  *string `json:"descripcion"`
	ThumbnailURL *string `json:"thumbnail_url"`
	Color        *string `json:"color"`
	Orden        *int    `json:"orden"`
	Activo       *bool   `json:"activo"`
}

// ─── Unidad ─────────────────────────────────────────────────

type Unidad struct {
	ID          string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	MateriaID   string    `json:"materia_id" gorm:"column:materia_id"`
	Nombre      string    `json:"nombre" gorm:"column:nombre"`
	Descripcion *string   `json:"descripcion" gorm:"column:descripcion"`
	Orden       int       `json:"orden" gorm:"column:orden;default:0"`
	Activo      bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy   *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt   time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Unidad) TableName() string { return "internal.unidad" }

type UnidadRequest struct {
	MateriaID   string  `json:"materia_id"`
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Tema ───────────────────────────────────────────────────

type Tema struct {
	ID          string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UnidadID    string    `json:"unidad_id" gorm:"column:unidad_id"`
	Nombre      string    `json:"nombre" gorm:"column:nombre"`
	Descripcion *string   `json:"descripcion" gorm:"column:descripcion"`
	Orden       int       `json:"orden" gorm:"column:orden;default:0"`
	Activo      bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy   *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt   time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Tema) TableName() string { return "internal.tema" }

type TemaRequest struct {
	UnidadID    string  `json:"unidad_id"`
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Lección ────────────────────────────────────────────────

type Leccion struct {
	ID           string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	TemaID       string    `json:"tema_id" gorm:"column:tema_id"`
	Titulo       string    `json:"titulo" gorm:"column:titulo"`
	Descripcion  *string   `json:"descripcion" gorm:"column:descripcion"`
	ThumbnailURL *string   `json:"thumbnail_url" gorm:"column:thumbnail_url"`
	Orden        int       `json:"orden" gorm:"column:orden;default:0"`
	Activo       bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy    *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt    time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Leccion) TableName() string { return "internal.leccion" }

type LeccionRequest struct {
	TemaID       string  `json:"tema_id"`
	Titulo       string  `json:"titulo"`
	Descripcion  *string `json:"descripcion"`
	ThumbnailURL *string `json:"thumbnail_url"`
	Orden        *int    `json:"orden"`
	Activo       *bool   `json:"activo"`
}

// ─── Lección Sección ────────────────────────────────────────

type LeccionSeccion struct {
	ID            string         `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LeccionID     string         `json:"leccion_id" gorm:"column:leccion_id"`
	Tipo          string         `json:"tipo" gorm:"column:tipo;type:internal.tipo_seccion"`
	RecursoID     *string        `json:"recurso_id" gorm:"column:recurso_id"`
	PruebaID      *string        `json:"prueba_id" gorm:"column:prueba_id"`
	ModeloID      *string        `json:"modelo_id" gorm:"column:modelo_id"`
	Orden         int            `json:"orden" gorm:"column:orden;default:0"`
	EsObligatorio bool           `json:"es_obligatorio" gorm:"column:es_obligatorio;default:true"`
	Requisitos    pq.StringArray `json:"requisitos" gorm:"column:requisitos;type:text[]"`
	CreatedAt     time.Time      `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (LeccionSeccion) TableName() string { return "internal.leccion_seccion" }

type LeccionSeccionRequest struct {
	LeccionID     string   `json:"leccion_id"`
	Tipo          string   `json:"tipo"`
	RecursoID     *string  `json:"recurso_id"`
	PruebaID      *string  `json:"prueba_id"`
	ModeloID      *string  `json:"modelo_id"`
	Orden         *int     `json:"orden"`
	EsObligatorio *bool    `json:"es_obligatorio"`
	Requisitos    []string `json:"requisitos"`
}

// ─── Materia Seguimiento ────────────────────────────────────

type MateriaSeguimiento struct {
	ID               string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UsuarioID        string    `json:"usuario_id" gorm:"column:usuario_id"`
	MateriaID        string    `json:"materia_id" gorm:"column:materia_id"`
	FechaSeguimiento time.Time `json:"fecha_seguimiento" gorm:"column:fecha_seguimiento;autoCreateTime"`
}

func (MateriaSeguimiento) TableName() string { return "internal.materia_seguimiento" }

package libro

import (
	"encoding/json"
	"time"
)

type EstadoExtraccionLibro string

const (
	EstadoPendiente  EstadoExtraccionLibro = "pendiente"
	EstadoExtrayendo EstadoExtraccionLibro = "extrayendo"
	EstadoCompletado EstadoExtraccionLibro = "completado"
	EstadoRevision   EstadoExtraccionLibro = "en_revision"
	EstadoAprobado   EstadoExtraccionLibro = "aprobado"
	EstadoCancelado  EstadoExtraccionLibro = "cancelado"
)

type LibroExtraccion struct {
	ID                  string                `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	TrabajoID           string                `json:"trabajo_id" gorm:"column:trabajo_id"`
	ArchivoURL          *string               `json:"archivo_url" gorm:"column:archivo_url"`
	Idioma              string                `json:"idioma" gorm:"column:idioma"`
	PaginaInicio        int                   `json:"pagina_inicio" gorm:"column:pagina_inicio"`
	PaginaFin           *int                  `json:"pagina_fin" gorm:"column:pagina_fin"`
	Estado              EstadoExtraccionLibro `json:"estado" gorm:"column:estado;type:internal.estado_extraccion_libro"`
	PreguntasDetectadas int                   `json:"preguntas_detectadas" gorm:"column:preguntas_detectadas"`
	ConfianzaPromedio   *float64              `json:"confianza_promedio" gorm:"column:confianza_promedio"`
	NotasExtraccion     *string               `json:"notas_extraccion" gorm:"column:notas_extraccion"`
	NotasRevision       *string               `json:"notas_revision" gorm:"column:notas_revision"`
	UsadoFallback       bool                  `json:"usado_fallback" gorm:"column:usado_fallback"`
	CreatedBy           *string               `json:"created_by" gorm:"column:created_by"`
	RevisadoPor         *string               `json:"revisado_por" gorm:"column:revisado_por"`
	ConfirmadoPor       *string               `json:"confirmado_por" gorm:"column:confirmado_por"`
	CreatedAt           time.Time             `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt           time.Time             `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (LibroExtraccion) TableName() string { return "internal.libro_extraccion" }

type TrabajoPregunta struct {
	ID          string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	TrabajoID   string          `json:"trabajo_id" gorm:"column:trabajo_id"`
	Texto       string          `json:"texto" gorm:"column:texto"`
	Tipo        string          `json:"tipo" gorm:"column:tipo;type:internal.tipo_pregunta"`
	Opciones    json.RawMessage `json:"opciones" gorm:"column:opciones;type:jsonb"`
	PaginaLibro *int            `json:"pagina_libro" gorm:"column:pagina_libro"`
	ConfianzaIA *float64        `json:"confianza_ia" gorm:"column:confianza_ia"`
	Orden       int             `json:"orden" gorm:"column:orden"`
	CreatedAt   time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (TrabajoPregunta) TableName() string { return "internal.trabajo_pregunta" }

type Trabajo struct {
	ID              string  `json:"id" gorm:"column:id;primaryKey"`
	Estado          string  `json:"estado" gorm:"column:estado;type:internal.estado_trabajo"`
	ExtraidoDeLibro bool    `json:"extraido_de_libro" gorm:"column:extraido_de_libro"`
	IDExtraccion    *string `json:"id_extraccion" gorm:"column:id_extraccion"`
}

func (Trabajo) TableName() string { return "internal.trabajo" }

type ExtractLibroRequest struct {
	ArchivoURL   *string `json:"archivo_url"`
	Contenido    string  `json:"contenido"`
	PaginaInicio *int    `json:"pagina_inicio"`
	PaginaFin    *int    `json:"pagina_fin"`
	Idioma       string  `json:"idioma"`
	MaxPreguntas *int    `json:"max_preguntas"`
}

type LibroPreguntaInput struct {
	ID          string          `json:"id,omitempty"`
	Texto       string          `json:"texto"`
	Tipo        string          `json:"tipo"`
	Opciones    json.RawMessage `json:"opciones,omitempty"`
	PaginaLibro *int            `json:"pagina_libro,omitempty"`
	ConfianzaIA *float64        `json:"confianza_ia,omitempty"`
	Orden       int             `json:"orden"`
}

type RevisionLibroRequest struct {
	Preguntas     []LibroPreguntaInput `json:"preguntas"`
	NotasRevision *string              `json:"notas_revision"`
	Aprobar       bool                 `json:"aprobar"`
}

type ConfirmarLibroRequest struct {
	Publicar     bool    `json:"publicar"`
	NotasFinales *string `json:"notas_finales"`
}

type LibroEstadoResponse struct {
	Extraccion *LibroExtraccion  `json:"extraccion,omitempty"`
	Preguntas  []TrabajoPregunta `json:"preguntas"`
}

type ExtractLibroResponse struct {
	Extraccion *LibroExtraccion  `json:"extraccion"`
	Preguntas  []TrabajoPregunta `json:"preguntas"`
}

type ConfirmarLibroResponse struct {
	Trabajo    *Trabajo         `json:"trabajo"`
	Extraccion *LibroExtraccion `json:"extraccion"`
}

type LibroObservabilityResponse struct {
	TrabajoID        string     `json:"trabajo_id"`
	ExtractTotal     int64      `json:"extract_total"`
	FallbackTotal    int64      `json:"fallback_total"`
	ErrorTotal       int64      `json:"error_total"`
	AverageLatencyMs float64    `json:"average_latency_ms"`
	LastLatencyMs    float64    `json:"last_latency_ms"`
	LastError        *string    `json:"last_error,omitempty"`
	LastEventAt      *time.Time `json:"last_event_at,omitempty"`
}

type EstadoExtraccionJob string

const (
	EstadoJobPendiente  EstadoExtraccionJob = "pendiente"
	EstadoJobEnProgreso EstadoExtraccionJob = "en_progreso"
	EstadoJobCompletado EstadoExtraccionJob = "completado"
	EstadoJobError      EstadoExtraccionJob = "error"
)

type ExtractLibroAsyncResponse struct {
	JobID     string              `json:"job_id"`
	TrabajoID string              `json:"trabajo_id"`
	Estado    EstadoExtraccionJob `json:"estado"`
	Progress  int                 `json:"progress"`
	Message   string              `json:"message"`
}

type LibroExtractJobStatusResponse struct {
	JobID       string                `json:"job_id"`
	TrabajoID   string                `json:"trabajo_id"`
	Estado      EstadoExtraccionJob   `json:"estado"`
	Progress    int                   `json:"progress"`
	Message     string                `json:"message"`
	Error       *string               `json:"error,omitempty"`
	StartedAt   time.Time             `json:"started_at"`
	UpdatedAt   time.Time             `json:"updated_at"`
	CompletedAt *time.Time            `json:"completed_at,omitempty"`
	Result      *ExtractLibroResponse `json:"result,omitempty"`
}

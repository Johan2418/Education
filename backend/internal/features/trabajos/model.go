package trabajos

import (
	"encoding/json"
	"time"
)

type Trabajo struct {
	ID               string     `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LeccionID        string     `json:"leccion_id" gorm:"column:leccion_id"`
	Titulo           string     `json:"titulo" gorm:"column:titulo"`
	Descripcion      *string    `json:"descripcion" gorm:"column:descripcion"`
	Instrucciones    *string    `json:"instrucciones" gorm:"column:instrucciones"`
	FechaVencimiento *time.Time `json:"fecha_vencimiento" gorm:"column:fecha_vencimiento"`
	Estado           string     `json:"estado" gorm:"column:estado;type:internal.estado_trabajo"`
	CreatedBy        *string    `json:"created_by" gorm:"column:created_by"`
	CreatedAt        time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt        time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Trabajo) TableName() string { return "internal.trabajo" }

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

type TrabajoEntrega struct {
	ID           string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	TrabajoID    string          `json:"trabajo_id" gorm:"column:trabajo_id"`
	EstudianteID string          `json:"estudiante_id" gorm:"column:estudiante_id"`
	Respuestas   json.RawMessage `json:"respuestas" gorm:"column:respuestas;type:jsonb"`
	ArchivoURL   *string         `json:"archivo_url" gorm:"column:archivo_url"`
	Comentario   *string         `json:"comentario" gorm:"column:comentario"`
	Estado       string          `json:"estado" gorm:"column:estado;type:internal.estado_entrega_trabajo"`
	SubmittedAt  time.Time       `json:"submitted_at" gorm:"column:submitted_at"`
	CreatedAt    time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time       `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (TrabajoEntrega) TableName() string { return "internal.trabajo_entrega" }

type TrabajoCalificacion struct {
	ID           string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	EntregaID    string          `json:"entrega_id" gorm:"column:entrega_id"`
	DocenteID    string          `json:"docente_id" gorm:"column:docente_id"`
	Puntaje      float64         `json:"puntaje" gorm:"column:puntaje"`
	Feedback     *string         `json:"feedback" gorm:"column:feedback"`
	SugerenciaIA json.RawMessage `json:"sugerencia_ia" gorm:"column:sugerencia_ia;type:jsonb"`
	CreatedAt    time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time       `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (TrabajoCalificacion) TableName() string { return "internal.trabajo_calificacion" }

type CreateTrabajoRequest struct {
	LeccionID        string     `json:"leccion_id"`
	Titulo           string     `json:"titulo"`
	Descripcion      *string    `json:"descripcion"`
	Instrucciones    *string    `json:"instrucciones"`
	FechaVencimiento *time.Time `json:"fecha_vencimiento"`
}

type CreateEntregaRequest struct {
	Respuestas json.RawMessage `json:"respuestas"`
	ArchivoURL *string         `json:"archivo_url"`
	Comentario *string         `json:"comentario"`
}

type CalificarEntregaRequest struct {
	Puntaje      float64         `json:"puntaje"`
	Feedback     *string         `json:"feedback"`
	SugerenciaIA json.RawMessage `json:"sugerencia_ia"`
}

type EntregaConCalificacion struct {
	Entrega      TrabajoEntrega       `json:"entrega"`
	Calificacion *TrabajoCalificacion `json:"calificacion,omitempty"`
}

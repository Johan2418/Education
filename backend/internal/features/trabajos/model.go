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
	ExtraidoDeLibro  bool       `json:"extraido_de_libro" gorm:"column:extraido_de_libro"`
	IDExtraccion     *string    `json:"id_extraccion" gorm:"column:id_extraccion"`
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

type TrabajoRespuestaPregunta struct {
	ID              string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	EntregaID       string    `json:"entrega_id" gorm:"column:entrega_id"`
	PreguntaID      string    `json:"pregunta_id" gorm:"column:pregunta_id"`
	RespuestaTexto  *string   `json:"respuesta_texto" gorm:"column:respuesta_texto"`
	RespuestaOpcion *string   `json:"respuesta_opcion" gorm:"column:respuesta_opcion"`
	Orden           int       `json:"orden" gorm:"column:orden"`
	CreatedAt       time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (TrabajoRespuestaPregunta) TableName() string { return "internal.trabajo_respuesta_pregunta" }

type TrabajoCalificacionPregunta struct {
	ID             string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	CalificacionID string    `json:"calificacion_id" gorm:"column:calificacion_id"`
	PreguntaID     string    `json:"pregunta_id" gorm:"column:pregunta_id"`
	Puntaje        float64   `json:"puntaje" gorm:"column:puntaje"`
	Feedback       *string   `json:"feedback" gorm:"column:feedback"`
	CreatedAt      time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (TrabajoCalificacionPregunta) TableName() string {
	return "internal.trabajo_calificacion_pregunta"
}

type CreateTrabajoRequest struct {
	LeccionID        string     `json:"leccion_id"`
	Titulo           string     `json:"titulo"`
	Descripcion      *string    `json:"descripcion"`
	Instrucciones    *string    `json:"instrucciones"`
	FechaVencimiento *time.Time `json:"fecha_vencimiento"`
}

type UpdateTrabajoRequest struct {
	Titulo           string     `json:"titulo"`
	Descripcion      *string    `json:"descripcion"`
	Instrucciones    *string    `json:"instrucciones"`
	FechaVencimiento *time.Time `json:"fecha_vencimiento"`
}

type CreateEntregaRequest struct {
	Respuestas          json.RawMessage                  `json:"respuestas"`
	RespuestasPreguntas []CreateEntregaPreguntaRespuesta `json:"respuestas_preguntas"`
	ArchivoURL          *string                          `json:"archivo_url"`
	Comentario          *string                          `json:"comentario"`
}

type CalificarEntregaRequest struct {
	Puntaje      float64         `json:"puntaje"`
	Feedback     *string         `json:"feedback"`
	SugerenciaIA json.RawMessage `json:"sugerencia_ia"`
}

type CreateEntregaPreguntaRespuesta struct {
	PreguntaID      string  `json:"pregunta_id"`
	RespuestaTexto  *string `json:"respuesta_texto"`
	RespuestaOpcion *string `json:"respuesta_opcion"`
}

type CalificarEntregaPreguntaItem struct {
	PreguntaID string  `json:"pregunta_id"`
	Puntaje    float64 `json:"puntaje"`
	Feedback   *string `json:"feedback"`
}

type CalificarEntregaPorPreguntaRequest struct {
	Items        []CalificarEntregaPreguntaItem `json:"items"`
	Feedback     *string                        `json:"feedback"`
	SugerenciaIA json.RawMessage                `json:"sugerencia_ia"`
}

type EntregaDetalleResponse struct {
	Trabajo                Trabajo                       `json:"trabajo"`
	Entrega                TrabajoEntrega                `json:"entrega"`
	Preguntas              []TrabajoPregunta             `json:"preguntas"`
	RespuestasPreguntas    []TrabajoRespuestaPregunta    `json:"respuestas_preguntas"`
	Calificacion           *TrabajoCalificacion          `json:"calificacion,omitempty"`
	CalificacionesPregunta []TrabajoCalificacionPregunta `json:"calificaciones_pregunta"`
}

type TrabajoFormularioResponse struct {
	Trabajo             Trabajo                    `json:"trabajo"`
	Preguntas           []TrabajoPregunta          `json:"preguntas"`
	MiEntrega           *TrabajoEntrega            `json:"mi_entrega,omitempty"`
	RespuestasPreguntas []TrabajoRespuestaPregunta `json:"respuestas_preguntas"`
}

type EntregaConCalificacion struct {
	Entrega          TrabajoEntrega       `json:"entrega"`
	Calificacion     *TrabajoCalificacion `json:"calificacion,omitempty"`
	EstudianteNombre *string              `json:"estudiante_nombre,omitempty"`
	EstudianteEmail  *string              `json:"estudiante_email,omitempty"`
}

type TrabajoReporte struct {
	TrabajoID        string     `json:"trabajo_id"`
	TotalEntregas    int64      `json:"total_entregas"`
	TotalCalificadas int64      `json:"total_calificadas"`
	TotalPendientes  int64      `json:"total_pendientes"`
	PromedioPuntaje  *float64   `json:"promedio_puntaje,omitempty"`
	UltimaEntregaAt  *time.Time `json:"ultima_entrega_at,omitempty"`
}

type UserContact struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"display_name,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type NotificationEventMetric struct {
	Sent      int64      `json:"sent"`
	Failed    int64      `json:"failed"`
	LastSent  *time.Time `json:"last_sent,omitempty"`
	LastError *string    `json:"last_error,omitempty"`
}

type TrabajoNotificacionesResponse struct {
	TrabajoID string                             `json:"trabajo_id"`
	Events    map[string]NotificationEventMetric `json:"events"`
}

type PaginatedEntregasResponse struct {
	Items   []EntregaConCalificacion `json:"items"`
	Total   int64                    `json:"total"`
	Limit   int                      `json:"limit"`
	Offset  int                      `json:"offset"`
	HasNext bool                     `json:"has_next"`
}

type TrabajoAnalyticsFilter struct {
	CursoID      *string    `json:"curso_id,omitempty"`
	LeccionID    *string    `json:"leccion_id,omitempty"`
	EstudianteID *string    `json:"estudiante_id,omitempty"`
	From         *time.Time `json:"from,omitempty"`
	To           *time.Time `json:"to,omitempty"`
	TeacherID    *string    `json:"teacher_id,omitempty"`
}

type TrabajoAnalyticsSummary struct {
	TotalTrabajos      int64    `json:"total_trabajos"`
	TotalEntregas      int64    `json:"total_entregas"`
	TotalCalificadas   int64    `json:"total_calificadas"`
	PromedioPuntaje    *float64 `json:"promedio_puntaje,omitempty"`
	EstudiantesActivos int64    `json:"estudiantes_activos"`
}

type CursoAnalyticsItem struct {
	CursoID            string   `json:"curso_id"`
	CursoNombre        string   `json:"curso_nombre"`
	TotalTrabajos      int64    `json:"total_trabajos"`
	TotalEntregas      int64    `json:"total_entregas"`
	TotalCalificadas   int64    `json:"total_calificadas"`
	PromedioPuntaje    *float64 `json:"promedio_puntaje,omitempty"`
	EstudiantesActivos int64    `json:"estudiantes_activos"`
}

type LeccionAnalyticsItem struct {
	LeccionID          string   `json:"leccion_id"`
	LeccionTitulo      string   `json:"leccion_titulo"`
	CursoID            string   `json:"curso_id"`
	CursoNombre        string   `json:"curso_nombre"`
	TotalTrabajos      int64    `json:"total_trabajos"`
	TotalEntregas      int64    `json:"total_entregas"`
	TotalCalificadas   int64    `json:"total_calificadas"`
	PromedioPuntaje    *float64 `json:"promedio_puntaje,omitempty"`
	EstudiantesActivos int64    `json:"estudiantes_activos"`
}

type EstudianteAnalyticsItem struct {
	EstudianteID     string     `json:"estudiante_id"`
	EstudianteNombre *string    `json:"estudiante_nombre,omitempty"`
	EstudianteEmail  *string    `json:"estudiante_email,omitempty"`
	CursoID          string     `json:"curso_id"`
	CursoNombre      string     `json:"curso_nombre"`
	LeccionID        string     `json:"leccion_id"`
	LeccionTitulo    string     `json:"leccion_titulo"`
	TotalEntregas    int64      `json:"total_entregas"`
	TotalCalificadas int64      `json:"total_calificadas"`
	PromedioPuntaje  *float64   `json:"promedio_puntaje,omitempty"`
	UltimaEntregaAt  *time.Time `json:"ultima_entrega_at,omitempty"`
}

type TrabajoAnalyticsV2Response struct {
	Scope       TrabajoAnalyticsFilter    `json:"scope"`
	Summary     TrabajoAnalyticsSummary   `json:"summary"`
	Cursos      []CursoAnalyticsItem      `json:"cursos"`
	Lecciones   []LeccionAnalyticsItem    `json:"lecciones"`
	Estudiantes []EstudianteAnalyticsItem `json:"estudiantes"`
	GeneratedAt time.Time                 `json:"generated_at"`
}

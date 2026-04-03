package evaluations

import (
	"encoding/json"
	"time"
)

// ─── Prueba ─────────────────────────────────────────────────

type Prueba struct {
	ID            string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LeccionID     *string   `json:"leccion_id" gorm:"column:leccion_id"`
	Titulo        string    `json:"titulo" gorm:"column:titulo"`
	TiempoLimite  *int      `json:"tiempo_limite" gorm:"column:tiempo_limite"`
	NotaMaxima    float64   `json:"nota_maxima" gorm:"column:nota_maxima;default:10"`
	PesoCalif     float64   `json:"peso_calificacion" gorm:"column:peso_calificacion;default:1"`
	PuntajeMinimo float64   `json:"puntaje_minimo" gorm:"column:puntaje_minimo;default:0"`
	Orden         int       `json:"orden" gorm:"column:orden;default:0"`
	CreatedBy     *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt     time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt     time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Prueba) TableName() string { return "internal.prueba" }

type PruebaRequest struct {
	LeccionID     *string  `json:"leccion_id"`
	Titulo        string   `json:"titulo"`
	TiempoLimite  *int     `json:"tiempo_limite"`
	NotaMaxima    *float64 `json:"nota_maxima"`
	PesoCalif     *float64 `json:"peso_calificacion"`
	PuntajeMinimo *float64 `json:"puntaje_minimo"`
	Orden         *int     `json:"orden"`
}

type PruebaCompleta struct {
	Prueba
	Preguntas []PreguntaConRespuestas `json:"preguntas" gorm:"-"`
}

// ─── Pregunta ───────────────────────────────────────────────

type Pregunta struct {
	ID            string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	PruebaID      string    `json:"prueba_id" gorm:"column:prueba_id"`
	Texto         string    `json:"texto" gorm:"column:texto"`
	Tipo          string    `json:"tipo" gorm:"column:tipo;type:internal.tipo_pregunta"`
	PuntajeMaximo float64   `json:"puntaje_maximo" gorm:"column:puntaje_maximo;default:1"`
	Orden         int       `json:"orden" gorm:"column:orden;default:0"`
	CreatedAt     time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (Pregunta) TableName() string { return "internal.pregunta" }

type PreguntaRequest struct {
	PruebaID      string   `json:"prueba_id"`
	Texto         string   `json:"texto"`
	Tipo          string   `json:"tipo"`
	PuntajeMaximo *float64 `json:"puntaje_maximo"`
	Orden         *int     `json:"orden"`
}

type PreguntaConRespuestas struct {
	Pregunta
	Respuestas []Respuesta `json:"respuestas" gorm:"-"`
}

// ─── Respuesta ──────────────────────────────────────────────

type Respuesta struct {
	ID         string `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	PreguntaID string `json:"pregunta_id" gorm:"column:pregunta_id"`
	Texto      string `json:"texto" gorm:"column:texto"`
	EsCorrecta bool   `json:"es_correcta" gorm:"column:es_correcta;default:false"`
	Orden      int    `json:"orden" gorm:"column:orden;default:0"`
}

func (Respuesta) TableName() string { return "internal.respuesta" }

type RespuestaRequest struct {
	PreguntaID string `json:"pregunta_id"`
	Texto      string `json:"texto"`
	EsCorrecta bool   `json:"es_correcta"`
	Orden      *int   `json:"orden"`
}

// ─── Resultado Prueba ───────────────────────────────────────

type ResultadoPrueba struct {
	ID              string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	PruebaID        string          `json:"prueba_id" gorm:"column:prueba_id"`
	UsuarioID       string          `json:"usuario_id" gorm:"column:usuario_id"`
	PuntajeObtenido float64         `json:"puntaje_obtenido" gorm:"column:puntaje_obtenido"`
	Aprobado        bool            `json:"aprobado" gorm:"column:aprobado"`
	Respuestas      json.RawMessage `json:"respuestas" gorm:"column:respuestas;type:jsonb"`
	StartedAt       *time.Time      `json:"started_at" gorm:"column:started_at"`
	CompletedAt     *time.Time      `json:"completed_at" gorm:"column:completed_at"`
	CreatedAt       time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (ResultadoPrueba) TableName() string { return "internal.resultado_prueba" }

type ResultadoPruebaRequest struct {
	PruebaID         string          `json:"prueba_id"`
	PuntajeObtenido  float64         `json:"puntaje_obtenido"`
	Aprobado         bool            `json:"aprobado"`
	Respuestas       json.RawMessage `json:"respuestas"`
	StartedAt        *time.Time      `json:"started_at"`
	LegacyPuntaje    *float64        `json:"puntaje,omitempty" gorm:"-"`
	LegacyRespuestas json.RawMessage `json:"respuestas_json,omitempty" gorm:"-"`
}

// ─── Progreso (nivel lección) ───────────────────────────────

type Progreso struct {
	ID                string     `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UsuarioID         string     `json:"usuario_id" gorm:"column:usuario_id"`
	LeccionID         string     `json:"leccion_id" gorm:"column:leccion_id"`
	Completado        bool       `json:"completado" gorm:"column:completado;default:false"`
	Puntaje           *float64   `json:"puntaje" gorm:"column:puntaje"`
	FechaUltimoAcceso *time.Time `json:"fecha_ultimo_acceso" gorm:"column:fecha_ultimo_acceso"`
	CreatedAt         time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt         time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Progreso) TableName() string { return "internal.progreso" }

type ProgresoRequest struct {
	LeccionID  string   `json:"leccion_id"`
	Completado *bool    `json:"completado"`
	Puntaje    *float64 `json:"puntaje"`
}

// ─── Progreso Sección ───────────────────────────────────────

type ProgresoSeccion struct {
	ID               string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UserID           string    `json:"user_id" gorm:"column:user_id"`
	LeccionSeccionID string    `json:"leccion_seccion_id" gorm:"column:leccion_seccion_id"`
	SeccionID        string    `json:"seccion_id,omitempty" gorm:"-"`
	Completado       bool      `json:"completado" gorm:"column:completado;default:false"`
	Puntuacion       *float64  `json:"puntuacion" gorm:"column:puntuacion"`
	TiempoDedicado   int       `json:"tiempo_dedicado" gorm:"column:tiempo_dedicado;default:0"`
	Intentos         int       `json:"intentos" gorm:"column:intentos;default:0"`
	CreatedAt        time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt        time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ProgresoSeccion) TableName() string { return "internal.progreso_seccion" }

type ProgresoSeccionRequest struct {
	LeccionSeccionID string   `json:"leccion_seccion_id"`
	SeccionID        string   `json:"seccion_id,omitempty" gorm:"-"`
	Completado       *bool    `json:"completado"`
	Puntuacion       *float64 `json:"puntuacion"`
	TiempoDedicado   *int     `json:"tiempo_dedicado"`
	Intentos         *int     `json:"intentos"`
}

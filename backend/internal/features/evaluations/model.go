package evaluations

import (
	"encoding/json"
	"time"
)

// ─── Prueba ─────────────────────────────────────────────────

type Prueba struct {
	ID            string    `json:"id"`
	LeccionID     *string   `json:"leccion_id"`
	Titulo        string    `json:"titulo"`
	TiempoLimite  *int      `json:"tiempo_limite"`
	PuntajeMinimo float64   `json:"puntaje_minimo"`
	Orden         int       `json:"orden"`
	CreatedBy     *string   `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type PruebaRequest struct {
	LeccionID     *string  `json:"leccion_id"`
	Titulo        string   `json:"titulo"`
	TiempoLimite  *int     `json:"tiempo_limite"`
	PuntajeMinimo *float64 `json:"puntaje_minimo"`
	Orden         *int     `json:"orden"`
}

type PruebaCompleta struct {
	Prueba
	Preguntas []PreguntaConRespuestas `json:"preguntas"`
}

// ─── Pregunta ───────────────────────────────────────────────

type Pregunta struct {
	ID        string    `json:"id"`
	PruebaID  string    `json:"prueba_id"`
	Texto     string    `json:"texto"`
	Tipo      string    `json:"tipo"`
	Orden     int       `json:"orden"`
	CreatedAt time.Time `json:"created_at"`
}

type PreguntaRequest struct {
	PruebaID string `json:"prueba_id"`
	Texto    string `json:"texto"`
	Tipo     string `json:"tipo"`
	Orden    *int   `json:"orden"`
}

type PreguntaConRespuestas struct {
	Pregunta
	Respuestas []Respuesta `json:"respuestas"`
}

// ─── Respuesta ──────────────────────────────────────────────

type Respuesta struct {
	ID         string `json:"id"`
	PreguntaID string `json:"pregunta_id"`
	Texto      string `json:"texto"`
	EsCorrecta bool   `json:"es_correcta"`
	Orden      int    `json:"orden"`
}

type RespuestaRequest struct {
	PreguntaID string `json:"pregunta_id"`
	Texto      string `json:"texto"`
	EsCorrecta bool   `json:"es_correcta"`
	Orden      *int   `json:"orden"`
}

// ─── Resultado Prueba ───────────────────────────────────────

type ResultadoPrueba struct {
	ID              string          `json:"id"`
	PruebaID        string          `json:"prueba_id"`
	UsuarioID       string          `json:"usuario_id"`
	PuntajeObtenido float64         `json:"puntaje_obtenido"`
	Aprobado        bool            `json:"aprobado"`
	Respuestas      json.RawMessage `json:"respuestas"`
	StartedAt       *time.Time      `json:"started_at"`
	CompletedAt     *time.Time      `json:"completed_at"`
	CreatedAt       time.Time       `json:"created_at"`
}

type ResultadoPruebaRequest struct {
	PruebaID        string          `json:"prueba_id"`
	PuntajeObtenido float64         `json:"puntaje_obtenido"`
	Aprobado        bool            `json:"aprobado"`
	Respuestas      json.RawMessage `json:"respuestas"`
	StartedAt       *time.Time      `json:"started_at"`
}

// ─── Progreso (nivel lección) ───────────────────────────────

type Progreso struct {
	ID                string     `json:"id"`
	UsuarioID         string     `json:"usuario_id"`
	LeccionID         string     `json:"leccion_id"`
	Completado        bool       `json:"completado"`
	Puntaje           *float64   `json:"puntaje"`
	FechaUltimoAcceso *time.Time `json:"fecha_ultimo_acceso"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type ProgresoRequest struct {
	LeccionID  string   `json:"leccion_id"`
	Completado *bool    `json:"completado"`
	Puntaje    *float64 `json:"puntaje"`
}

// ─── Progreso Sección ───────────────────────────────────────

type ProgresoSeccion struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	LeccionSeccionID string    `json:"leccion_seccion_id"`
	Completado       bool      `json:"completado"`
	Puntuacion       *float64  `json:"puntuacion"`
	TiempoDedicado   int       `json:"tiempo_dedicado"`
	Intentos         int       `json:"intentos"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type ProgresoSeccionRequest struct {
	LeccionSeccionID string   `json:"leccion_seccion_id"`
	Completado       *bool    `json:"completado"`
	Puntuacion       *float64 `json:"puntuacion"`
	TiempoDedicado   *int     `json:"tiempo_dedicado"`
	Intentos         *int     `json:"intentos"`
}

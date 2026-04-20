package interactive

import (
	"encoding/json"
	"time"
)

type ActividadInteractiva struct {
	ID               string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LeccionID        string          `json:"leccion_id" gorm:"column:leccion_id"`
	Titulo           string          `json:"titulo" gorm:"column:titulo"`
	Descripcion      *string         `json:"descripcion" gorm:"column:descripcion"`
	Proveedor        string          `json:"proveedor" gorm:"column:proveedor"`
	EmbedURL         string          `json:"embed_url" gorm:"column:embed_url"`
	ReglaCompletitud string          `json:"regla_completitud" gorm:"column:regla_completitud"`
	PuntajeMaximo    float64         `json:"puntaje_maximo" gorm:"column:puntaje_maximo"`
	IntentosMaximos  *int            `json:"intentos_maximos" gorm:"column:intentos_maximos"`
	Configuracion    json.RawMessage `json:"configuracion" gorm:"column:configuracion;type:jsonb"`
	Activo           bool            `json:"activo" gorm:"column:activo"`
	CreatedBy        *string         `json:"created_by" gorm:"column:created_by"`
	CreatedAt        time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt        time.Time       `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ActividadInteractiva) TableName() string { return "internal.actividad_interactiva" }

type ActividadInteractivaRequest struct {
	LeccionID        string          `json:"leccion_id"`
	Titulo           string          `json:"titulo"`
	Descripcion      *string         `json:"descripcion"`
	Proveedor        string          `json:"proveedor"`
	EmbedURL         string          `json:"embed_url"`
	ReglaCompletitud *string         `json:"regla_completitud"`
	PuntajeMaximo    *float64        `json:"puntaje_maximo"`
	IntentosMaximos  *int            `json:"intentos_maximos"`
	Configuracion    json.RawMessage `json:"configuracion"`
	Activo           *bool           `json:"activo"`
}

type ActividadInteractivaIntento struct {
	ID               string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	ActividadID      string          `json:"actividad_id" gorm:"column:actividad_id"`
	UserID           string          `json:"user_id" gorm:"column:user_id"`
	Completado       bool            `json:"completado" gorm:"column:completado"`
	ScoreObtenido    *float64        `json:"score_obtenido" gorm:"column:score_obtenido"`
	ScoreNormalizado *float64        `json:"score_normalizado" gorm:"column:score_normalizado"`
	TiempoDedicado   int             `json:"tiempo_dedicado" gorm:"column:tiempo_dedicado"`
	Intentos         int             `json:"intentos" gorm:"column:intentos"`
	Metadata         json.RawMessage `json:"metadata" gorm:"column:metadata;type:jsonb"`
	StartedAt        *time.Time      `json:"started_at" gorm:"column:started_at"`
	CompletedAt      *time.Time      `json:"completed_at" gorm:"column:completed_at"`
	CreatedAt        time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt        time.Time       `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ActividadInteractivaIntento) TableName() string {
	return "internal.actividad_interactiva_intento"
}

type UpsertIntentoRequest struct {
	Completado       *bool           `json:"completado"`
	ScoreObtenido    *float64        `json:"score_obtenido"`
	ScoreNormalizado *float64        `json:"score_normalizado"`
	TiempoDedicado   *int            `json:"tiempo_dedicado"`
	Intentos         *int            `json:"intentos"`
	Metadata         json.RawMessage `json:"metadata"`
	StartedAt        *time.Time      `json:"started_at"`
	CompletedAt      *time.Time      `json:"completed_at"`
}

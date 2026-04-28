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
	LibroRecursoID      *string               `json:"libro_recurso_id,omitempty" gorm:"column:libro_recurso_id"`
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

type EstadoLibroRecurso string

const (
	EstadoLibroRecursoPendiente  EstadoLibroRecurso = "pendiente"
	EstadoLibroRecursoProcesando EstadoLibroRecurso = "procesando"
	EstadoLibroRecursoCompletado EstadoLibroRecurso = "completado"
	EstadoLibroRecursoError      EstadoLibroRecurso = "error"
	EstadoLibroRecursoArchivado  EstadoLibroRecurso = "archivado"
)

type LibroRecurso struct {
	ID             string             `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	Titulo         string             `json:"titulo" gorm:"column:titulo"`
	Descripcion    *string            `json:"descripcion" gorm:"column:descripcion"`
	ArchivoURL     *string            `json:"archivo_url" gorm:"column:archivo_url"`
	Idioma         string             `json:"idioma" gorm:"column:idioma"`
	PaginasTotales *int               `json:"paginas_totales" gorm:"column:paginas_totales"`
	HashContenido  string             `json:"hash_contenido" gorm:"column:hash_contenido"`
	HashArchivo    *string            `json:"hash_archivo" gorm:"column:hash_archivo"`
	HashVersion    string             `json:"hash_version" gorm:"column:hash_version"`
	Estado         EstadoLibroRecurso `json:"estado" gorm:"column:estado;type:internal.estado_libro_recurso"`
	EsPublico      bool               `json:"es_publico" gorm:"column:es_publico"`
	Metadata       json.RawMessage    `json:"metadata" gorm:"column:metadata;type:jsonb"`
	CreatedBy      *string            `json:"created_by" gorm:"column:created_by"`
	CreatedAt      time.Time          `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time          `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (LibroRecurso) TableName() string { return "internal.libro_recurso" }

type LibroContenidoPagina struct {
	ID             string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LibroRecursoID string          `json:"libro_recurso_id" gorm:"column:libro_recurso_id"`
	Pagina         int             `json:"pagina" gorm:"column:pagina"`
	Contenido      string          `json:"contenido" gorm:"column:contenido"`
	ImagenBase64   *string         `json:"imagen_base64,omitempty" gorm:"column:imagen_base64"`
	Metadata       json.RawMessage `json:"metadata,omitempty" gorm:"column:metadata;type:jsonb"`
	CreatedAt      time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time       `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (LibroContenidoPagina) TableName() string { return "internal.libro_contenido_pagina" }

type TrabajoLibroRecurso struct {
	TrabajoID      string    `json:"trabajo_id" gorm:"column:trabajo_id;primaryKey"`
	LibroRecursoID string    `json:"libro_recurso_id" gorm:"column:libro_recurso_id"`
	CreatedBy      *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt      time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (TrabajoLibroRecurso) TableName() string { return "internal.trabajo_libro_recurso" }

type TrabajoPregunta struct {
	ID                    string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	TrabajoID             string          `json:"trabajo_id" gorm:"column:trabajo_id"`
	Texto                 string          `json:"texto" gorm:"column:texto"`
	Tipo                  string          `json:"tipo" gorm:"column:tipo;type:internal.tipo_pregunta"`
	Opciones              json.RawMessage `json:"opciones" gorm:"column:opciones;type:jsonb"`
	RespuestaCorrecta     *string         `json:"respuesta_correcta" gorm:"column:respuesta_correcta"`
	PuntajeMaximo         float64         `json:"puntaje_maximo" gorm:"column:puntaje_maximo;default:1"`
	PaginaLibro           *int            `json:"pagina_libro" gorm:"column:pagina_libro"`
	ConfianzaIA           *float64        `json:"confianza_ia" gorm:"column:confianza_ia"`
	ImagenBase64          *string         `json:"imagen_base64" gorm:"column:imagen_base64"`
	ImagenFuente          *string         `json:"imagen_fuente" gorm:"column:imagen_fuente"`
	RespuestaEsperadaTipo *string         `json:"respuesta_esperada_tipo" gorm:"column:respuesta_esperada_tipo"`
	Placeholder           *string         `json:"placeholder" gorm:"column:placeholder"`
	Orden                 int             `json:"orden" gorm:"column:orden"`
	CreatedAt             time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (TrabajoPregunta) TableName() string { return "internal.trabajo_pregunta" }

type Trabajo struct {
	ID              string  `json:"id" gorm:"column:id;primaryKey"`
	Estado          string  `json:"estado" gorm:"column:estado;type:internal.estado_trabajo"`
	NotaMaxima      float64 `json:"nota_maxima" gorm:"column:nota_maxima"`
	ExtraidoDeLibro bool    `json:"extraido_de_libro" gorm:"column:extraido_de_libro"`
	IDExtraccion    *string `json:"id_extraccion" gorm:"column:id_extraccion"`
}

func (Trabajo) TableName() string { return "internal.trabajo" }

type ExtractLibroRequest struct {
	ArchivoURL        *string                      `json:"archivo_url"`
	Contenido         string                       `json:"contenido"`
	HashArchivo       *string                      `json:"hash_archivo,omitempty"`
	HashContenido     *string                      `json:"hash_contenido,omitempty"`
	PaginaInicio      *int                         `json:"pagina_inicio"`
	PaginaFin         *int                         `json:"pagina_fin"`
	Idioma            string                       `json:"idioma"`
	MaxPreguntas      *int                         `json:"max_preguntas"`
	ImagenesPorPagina map[string]string            `json:"imagenes_por_pagina"`
	ImagenesMetadata  map[string]PdfPaginaMetadata `json:"imagenes_metadata_por_pagina"`
}

type PdfTextoRegion struct {
	Texto  string  `json:"texto"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type PdfPaginaMetadata struct {
	ImageWidth  int              `json:"image_width"`
	ImageHeight int              `json:"image_height"`
	TextRegions []PdfTextoRegion `json:"text_regions"`
}

type LibroPreguntaInput struct {
	ID                    string          `json:"id,omitempty"`
	Texto                 string          `json:"texto"`
	Tipo                  string          `json:"tipo"`
	Opciones              json.RawMessage `json:"opciones,omitempty"`
	RespuestaCorrecta     *string         `json:"respuesta_correcta,omitempty"`
	PuntajeMaximo         *float64        `json:"puntaje_maximo,omitempty"`
	PaginaLibro           *int            `json:"pagina_libro,omitempty"`
	ConfianzaIA           *float64        `json:"confianza_ia,omitempty"`
	ImagenBase64          *string         `json:"imagen_base64,omitempty"`
	ImagenFuente          *string         `json:"imagen_fuente,omitempty"`
	ImagenManualOverride  *bool           `json:"imagen_manual_override,omitempty"`
	RespuestaEsperadaTipo *string         `json:"respuesta_esperada_tipo,omitempty"`
	Placeholder           *string         `json:"placeholder,omitempty"`
	Orden                 int             `json:"orden"`
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
	Extraccion     *LibroExtraccion  `json:"extraccion"`
	Preguntas      []TrabajoPregunta `json:"preguntas"`
	Reutilizado    bool              `json:"reutilizado"`
	LibroRecursoID *string           `json:"libro_recurso_id,omitempty"`
}

type ConfirmarLibroResponse struct {
	Trabajo    *Trabajo         `json:"trabajo"`
	Extraccion *LibroExtraccion `json:"extraccion"`
}

type LibroObservabilityResponse struct {
	TrabajoID        string           `json:"trabajo_id"`
	ExtractTotal     int64            `json:"extract_total"`
	FallbackTotal    int64            `json:"fallback_total"`
	ErrorTotal       int64            `json:"error_total"`
	AverageLatencyMs float64          `json:"average_latency_ms"`
	LastLatencyMs    float64          `json:"last_latency_ms"`
	LastDurationMs   float64          `json:"last_duration_ms"`
	LastError        *string          `json:"last_error,omitempty"`
	LastErrorType    *string          `json:"last_error_type,omitempty"`
	ErrorByType      map[string]int64 `json:"error_by_type,omitempty"`
	LastEventAt      *time.Time       `json:"last_event_at,omitempty"`
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
	JobID        string                `json:"job_id"`
	TrabajoID    string                `json:"trabajo_id"`
	Estado       EstadoExtraccionJob   `json:"estado"`
	Progress     int                   `json:"progress"`
	Message      string                `json:"message"`
	Error        *string               `json:"error,omitempty"`
	ErrorType    *string               `json:"error_type,omitempty"`
	ErrorMessage *string               `json:"error_message,omitempty"`
	StartedAt    time.Time             `json:"started_at"`
	UpdatedAt    time.Time             `json:"updated_at"`
	CompletedAt  *time.Time            `json:"completed_at,omitempty"`
	FailedAt     *time.Time            `json:"failed_at,omitempty"`
	DurationMs   int64                 `json:"duration_ms"`
	Result       *ExtractLibroResponse `json:"result,omitempty"`
}

type LibroRecursoListQuery struct {
	Search    string
	Estado    *EstadoLibroRecurso
	EsPublico *bool
	Page      int
	PageSize  int
}

type LibroRecursoListItem struct {
	ID               string             `json:"id"`
	Titulo           string             `json:"titulo"`
	Descripcion      *string            `json:"descripcion,omitempty"`
	Idioma           string             `json:"idioma"`
	PaginasTotales   *int               `json:"paginas_totales,omitempty"`
	Estado           EstadoLibroRecurso `json:"estado"`
	EsPublico        bool               `json:"es_publico"`
	PreguntasTotales int64              `json:"preguntas_totales"`
	CreatedAt        time.Time          `json:"created_at"`
	UpdatedAt        time.Time          `json:"updated_at"`
}

type LibroRecursoListResponse struct {
	Items    []LibroRecursoListItem `json:"items"`
	Total    int64                  `json:"total"`
	Page     int                    `json:"page"`
	PageSize int                    `json:"page_size"`
}

type LibroRecursoDetailResponse struct {
	ID                string             `json:"id"`
	Titulo            string             `json:"titulo"`
	Descripcion       *string            `json:"descripcion,omitempty"`
	Idioma            string             `json:"idioma"`
	PaginasTotales    *int               `json:"paginas_totales,omitempty"`
	Estado            EstadoLibroRecurso `json:"estado"`
	EsPublico         bool               `json:"es_publico"`
	PreguntasTotales  int64              `json:"preguntas_totales"`
	PaginasDetectadas int64              `json:"paginas_detectadas"`
	CreatedAt         time.Time          `json:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at"`
}

type ViewerWatermarkConfig struct {
	Enabled bool   `json:"enabled"`
	Text    string `json:"text"`
}

type ViewerControls struct {
	DisableDownload    bool `json:"disable_download"`
	DisablePrint       bool `json:"disable_print"`
	DisableContextMenu bool `json:"disable_context_menu"`
}

type LibroRecursoPaginaResponse struct {
	LibroRecursoID string                `json:"libro_recurso_id"`
	Pagina         int                   `json:"pagina"`
	TotalPaginas   int                   `json:"total_paginas"`
	Contenido      string                `json:"contenido"`
	ImagenBase64   *string               `json:"imagen_base64,omitempty"`
	Preguntas      []TrabajoPregunta     `json:"preguntas"`
	Watermark      ViewerWatermarkConfig `json:"watermark"`
	Controles      ViewerControls        `json:"controles"`
}

type LibroRecursoView struct {
	ID             string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LibroRecursoID string          `json:"libro_recurso_id" gorm:"column:libro_recurso_id"`
	UserID         *string         `json:"user_id,omitempty" gorm:"column:user_id"`
	Pagina         int             `json:"pagina" gorm:"column:pagina"`
	Metadata       json.RawMessage `json:"metadata,omitempty" gorm:"column:metadata;type:jsonb"`
	ViewedAt       time.Time       `json:"viewed_at" gorm:"column:viewed_at;autoCreateTime"`
}

func (LibroRecursoView) TableName() string { return "internal.libro_recurso_view" }

type LibroRecursoViewsSummary struct {
	RecursoID      string     `json:"recurso_id"`
	VistasTotal    int64      `json:"vistas_total"`
	UsuariosUnicos int64      `json:"usuarios_unicos"`
	UltimaVistaAt  *time.Time `json:"ultima_vista_at,omitempty"`
}

type ChatMessageRole string

const (
	ChatMessageRoleSystem    ChatMessageRole = "system"
	ChatMessageRoleUser      ChatMessageRole = "user"
	ChatMessageRoleAssistant ChatMessageRole = "assistant"
	ChatMessageRoleTool      ChatMessageRole = "tool"
)

type LibroChatSession struct {
	ID             string     `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LibroRecursoID string     `json:"libro_recurso_id" gorm:"column:libro_recurso_id"`
	Titulo         *string    `json:"titulo,omitempty" gorm:"column:titulo"`
	CreatedBy      *string    `json:"created_by,omitempty" gorm:"column:created_by"`
	CreatedAt      time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
	LastMessageAt  *time.Time `json:"last_message_at,omitempty" gorm:"column:last_message_at"`
}

func (LibroChatSession) TableName() string { return "internal.libro_chat_session" }

type LibroChatMessage struct {
	ID           string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	SessionID    string          `json:"session_id" gorm:"column:session_id"`
	Role         ChatMessageRole `json:"role" gorm:"column:role;type:internal.chat_message_role"`
	Content      string          `json:"content" gorm:"column:content"`
	ToolName     *string         `json:"tool_name,omitempty" gorm:"column:tool_name"`
	Metadata     json.RawMessage `json:"metadata,omitempty" gorm:"column:metadata;type:jsonb"`
	Model        *string         `json:"model,omitempty" gorm:"column:model"`
	LatencyMs    *int            `json:"latency_ms,omitempty" gorm:"column:latency_ms"`
	UsedFallback bool            `json:"used_fallback" gorm:"column:used_fallback"`
	CreatedBy    *string         `json:"created_by,omitempty" gorm:"column:created_by"`
	CreatedAt    time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (LibroChatMessage) TableName() string { return "internal.libro_chat_message" }

type LibroChatTelemetria struct {
	ID             string          `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	SessionID      string          `json:"session_id" gorm:"column:session_id"`
	LibroRecursoID string          `json:"libro_recurso_id" gorm:"column:libro_recurso_id"`
	UserID         *string         `json:"user_id,omitempty" gorm:"column:user_id"`
	EventType      string          `json:"event_type" gorm:"column:event_type"`
	LatencyMs      *int            `json:"latency_ms,omitempty" gorm:"column:latency_ms"`
	UsedFallback   bool            `json:"used_fallback" gorm:"column:used_fallback"`
	ErrorCode      *string         `json:"error_code,omitempty" gorm:"column:error_code"`
	Metadata       json.RawMessage `json:"metadata,omitempty" gorm:"column:metadata;type:jsonb"`
	CreatedAt      time.Time       `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (LibroChatTelemetria) TableName() string { return "internal.libro_chat_telemetria" }

type LibroChatSessionListResponse struct {
	Items  []LibroChatSession `json:"items"`
	Total  int64              `json:"total"`
	Limit  int                `json:"limit"`
	Offset int                `json:"offset"`
}

type CreateLibroChatSessionRequest struct {
	Titulo *string `json:"titulo,omitempty"`
}

type LibroChatSendMessageRequest struct {
	Mensaje string `json:"mensaje"`
}

type MCPToolCall struct {
	Name          string          `json:"name"`
	Input         json.RawMessage `json:"input,omitempty"`
	OutputSummary string          `json:"output_summary,omitempty"`
	DurationMs    int64           `json:"duration_ms"`
}

type LibroChatToolUsage struct {
	Name       string `json:"name"`
	UsageCount int64  `json:"usage_count"`
}

type LibroChatReportResponse struct {
	RecursoID          string               `json:"recurso_id"`
	VistasRecursoTotal int64                `json:"vistas_recurso_total"`
	UsuariosVistas     int64                `json:"usuarios_vistas_total"`
	UltimaVistaAt      *time.Time           `json:"ultima_vista_recurso_at,omitempty"`
	SesionesTotal      int64                `json:"sesiones_total"`
	MensajesTotal      int64                `json:"mensajes_total"`
	MensajesUsuario    int64                `json:"mensajes_usuario"`
	MensajesAsistente  int64                `json:"mensajes_asistente"`
	FallbackTotal      int64                `json:"fallback_total"`
	LatenciaPromedioMs float64              `json:"latencia_promedio_ms"`
	UltimoMensajeAt    *time.Time           `json:"ultimo_mensaje_at,omitempty"`
	TopTools           []LibroChatToolUsage `json:"top_tools"`
}

type LibroChatSendMessageResponse struct {
	SessionID    string        `json:"session_id"`
	RecursoID    string        `json:"recurso_id"`
	UserMessage  string        `json:"user_message"`
	Answer       string        `json:"answer"`
	Model        *string       `json:"model,omitempty"`
	UsedFallback bool          `json:"used_fallback"`
	LatencyMs    int64         `json:"latency_ms"`
	ToolCalls    []MCPToolCall `json:"tool_calls"`
}

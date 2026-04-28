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
	TeacherID   *string   `json:"teacher_id" gorm:"column:teacher_id"`
	Orden       int       `json:"orden" gorm:"column:orden;default:0"`
	Activo      bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedAt   time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Curso) TableName() string { return "internal.curso" }

type CursoRequest struct {
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	TeacherID   *string `json:"teacher_id"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Configuración Académica ──────────────────────────────

type ConfiguracionAcademica struct {
	ID                int       `json:"id" gorm:"column:id;primaryKey"`
	AnioEscolarActivo string    `json:"anio_escolar_activo" gorm:"column:anio_escolar_activo"`
	ZonaHoraria       string    `json:"zona_horaria" gorm:"column:zona_horaria"`
	CreatedAt         time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt         time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ConfiguracionAcademica) TableName() string { return "internal.configuracion_academica" }

// ─── Docente-Materia Asignación ───────────────────────────

type DocenteMateriaAsignacion struct {
	ID            string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	DocenteID     string    `json:"docente_id" gorm:"column:docente_id"`
	MateriaID     string    `json:"materia_id" gorm:"column:materia_id"`
	CursoID       string    `json:"curso_id" gorm:"column:curso_id"`
	AnioEscolar   string    `json:"anio_escolar" gorm:"column:anio_escolar"`
	Activo        bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy     *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt     time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt     time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
	DocenteNombre *string   `json:"docente_nombre,omitempty" gorm:"-"`
	DocenteEmail  *string   `json:"docente_email,omitempty" gorm:"-"`
	MateriaNombre string    `json:"materia_nombre,omitempty" gorm:"-"`
	CursoNombre   string    `json:"curso_nombre,omitempty" gorm:"-"`
}

func (DocenteMateriaAsignacion) TableName() string { return "internal.docente_materia_asignacion" }

type DocenteMateriaAsignacionCreateRequest struct {
	DocenteID   string `json:"docente_id"`
	MateriaID   string `json:"materia_id"`
	AnioEscolar string `json:"anio_escolar"`
	Activo      *bool  `json:"activo"`
}

type DocenteMateriaAsignacionUpdateRequest struct {
	DocenteID   *string `json:"docente_id"`
	AnioEscolar *string `json:"anio_escolar"`
	Activo      *bool   `json:"activo"`
}

type CursoAnioMateriaDocenteInput struct {
	MateriaOrigenID string `json:"materia_origen_id"`
	DocenteID       string `json:"docente_id"`
	Activo          *bool  `json:"activo"`
}

type CursoAnioAsignarMaestrosRequest struct {
	AnioEscolarDestino string                         `json:"anio_escolar_destino"`
	AnioEscolarOrigen  *string                        `json:"anio_escolar_origen"`
	Asignaciones       []CursoAnioMateriaDocenteInput `json:"asignaciones"`
}

type CursoAnioAsignarMaestrosDetalle struct {
	MateriaOrigenID  string `json:"materia_origen_id"`
	MateriaDestinoID string `json:"materia_destino_id"`
	MateriaNombre    string `json:"materia_nombre"`
	DocenteID        string `json:"docente_id"`
	Accion           string `json:"accion"`
}

type CursoAnioAsignarMaestrosResult struct {
	CursoID                  string                            `json:"curso_id"`
	AnioEscolarOrigen        string                            `json:"anio_escolar_origen"`
	AnioEscolarDestino       string                            `json:"anio_escolar_destino"`
	MateriasOrigen           int                               `json:"materias_origen"`
	MateriasClonadas         int                               `json:"materias_clonadas"`
	MateriasExistentes       int                               `json:"materias_existentes"`
	AsignacionesCreadas      int                               `json:"asignaciones_creadas"`
	AsignacionesActualizadas int                               `json:"asignaciones_actualizadas"`
	AsignacionesSinCambios   int                               `json:"asignaciones_sin_cambios"`
	Detalle                  []CursoAnioAsignarMaestrosDetalle `json:"detalle"`
}

type DocenteMateriaAsignacionFilter struct {
	DocenteID   *string
	CursoID     *string
	MateriaID   *string
	AnioEscolar *string
	SoloActivas bool
}

type MisCursoDocente struct {
	AsignacionID     string `json:"asignacion_id"`
	DocenteID        string `json:"docente_id"`
	MateriaID        string `json:"materia_id"`
	MateriaNombre    string `json:"materia_nombre"`
	CursoID          string `json:"curso_id"`
	CursoNombre      string `json:"curso_nombre"`
	AnioEscolar      string `json:"anio_escolar"`
	TotalEstudiantes int64  `json:"total_estudiantes"`
	TotalLecciones   int64  `json:"total_lecciones"`
	TotalTrabajos    int64  `json:"total_trabajos"`
}

// ─── Docente-Materia Horario ──────────────────────────────

type DocenteMateriaHorario struct {
	ID           string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	AsignacionID string    `json:"asignacion_id" gorm:"column:asignacion_id"`
	DiaSemana    int       `json:"dia_semana" gorm:"column:dia_semana"`
	HoraInicio   string    `json:"hora_inicio" gorm:"column:hora_inicio"`
	HoraFin      string    `json:"hora_fin" gorm:"column:hora_fin"`
	Aula         *string   `json:"aula" gorm:"column:aula"`
	Activo       bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy    *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt    time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (DocenteMateriaHorario) TableName() string { return "internal.docente_materia_horario" }

type DocenteMateriaHorarioRequest struct {
	DiaSemana  int     `json:"dia_semana"`
	HoraInicio string  `json:"hora_inicio"`
	HoraFin    string  `json:"hora_fin"`
	Aula       *string `json:"aula"`
	Activo     *bool   `json:"activo"`
}

type DocenteMateriaHorarioUpdateRequest struct {
	DiaSemana  *int    `json:"dia_semana"`
	HoraInicio *string `json:"hora_inicio"`
	HoraFin    *string `json:"hora_fin"`
	Aula       *string `json:"aula"`
	Activo     *bool   `json:"activo"`
}

type DocenteMateriaHorarioDetalle struct {
	ID            string  `json:"id"`
	AsignacionID  string  `json:"asignacion_id"`
	DocenteID     string  `json:"docente_id"`
	MateriaID     string  `json:"materia_id"`
	MateriaNombre string  `json:"materia_nombre"`
	CursoID       string  `json:"curso_id"`
	CursoNombre   string  `json:"curso_nombre"`
	AnioEscolar   string  `json:"anio_escolar"`
	DiaSemana     int     `json:"dia_semana"`
	HoraInicio    string  `json:"hora_inicio"`
	HoraFin       string  `json:"hora_fin"`
	Aula          *string `json:"aula"`
	Activo        bool    `json:"activo"`
}

type HorarioConflictoDocente struct {
	HorarioID     string `json:"horario_id"`
	AsignacionID  string `json:"asignacion_id"`
	MateriaNombre string `json:"materia_nombre"`
	CursoNombre   string `json:"curso_nombre"`
	DiaSemana     int    `json:"dia_semana"`
	HoraInicio    string `json:"hora_inicio"`
	HoraFin       string `json:"hora_fin"`
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

// EstudianteCursoDetail is a read-only DTO returned by ListEstudiantesByCurso
// with student profile info joined.
type EstudianteCursoDetail struct {
	ID           string    `json:"id"`
	EstudianteID string    `json:"estudiante_id"`
	CursoID      string    `json:"curso_id"`
	AnioEscolar  *string   `json:"anio_escolar"`
	DisplayName  *string   `json:"display_name"`
	Email        string    `json:"email"`
	CreatedAt    time.Time `json:"created_at"`
}

// ─── Materia ────────────────────────────────────────────────

type Materia struct {
	ID                      string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	CursoID                 string    `json:"curso_id" gorm:"column:curso_id"`
	AnioEscolar             string    `json:"anio_escolar" gorm:"column:anio_escolar"`
	Nombre                  string    `json:"nombre" gorm:"column:nombre"`
	Descripcion             *string   `json:"descripcion" gorm:"column:descripcion"`
	ThumbnailURL            *string   `json:"thumbnail_url" gorm:"column:thumbnail_url"`
	Color                   *string   `json:"color" gorm:"column:color"`
	PesoContenidosPct       float64   `json:"peso_contenidos_pct" gorm:"column:peso_contenidos_pct;default:35"`
	PesoLeccionesPct        float64   `json:"peso_lecciones_pct" gorm:"column:peso_lecciones_pct;default:35"`
	PesoTrabajosPct         float64   `json:"peso_trabajos_pct" gorm:"column:peso_trabajos_pct;default:30"`
	PuntajeTotal            float64   `json:"puntaje_total" gorm:"column:puntaje_total;default:10"`
	PuntajeMinimoAprobacion float64   `json:"puntaje_minimo_aprobacion" gorm:"column:puntaje_minimo_aprobacion;default:6"`
	Orden                   int       `json:"orden" gorm:"column:orden;default:0"`
	Activo                  bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy               *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt               time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt               time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Materia) TableName() string { return "internal.materia" }

type MateriaRequest struct {
	CursoID                 string   `json:"curso_id"`
	AnioEscolar             *string  `json:"anio_escolar"`
	Nombre                  string   `json:"nombre"`
	Descripcion             *string  `json:"descripcion"`
	ThumbnailURL            *string  `json:"thumbnail_url"`
	Color                   *string  `json:"color"`
	PesoContenidosPct       *float64 `json:"peso_contenidos_pct"`
	PesoLeccionesPct        *float64 `json:"peso_lecciones_pct"`
	PesoTrabajosPct         *float64 `json:"peso_trabajos_pct"`
	PuntajeTotal            *float64 `json:"puntaje_total"`
	PuntajeMinimoAprobacion *float64 `json:"puntaje_minimo_aprobacion"`
	Orden                   *int     `json:"orden"`
	Activo                  *bool    `json:"activo"`
}

type MateriaCalificacionAlumno struct {
	EstudianteID           string   `json:"estudiante_id"`
	EstudianteNombre       *string  `json:"estudiante_nombre,omitempty"`
	EstudianteEmail        *string  `json:"estudiante_email,omitempty"`
	PromedioContenidos10   *float64 `json:"promedio_contenidos_10,omitempty"`
	PromedioLecciones10    *float64 `json:"promedio_lecciones_10,omitempty"`
	PromedioTrabajos10     *float64 `json:"promedio_trabajos_10,omitempty"`
	PuntosContenidos       float64  `json:"puntos_contenidos"`
	PuntosLecciones        float64  `json:"puntos_lecciones"`
	PuntosTrabajos         float64  `json:"puntos_trabajos"`
	NotaFinal              float64  `json:"nota_final"`
	EstadoFinal            string   `json:"estado_final"`
	CumpleMinimo           bool     `json:"cumple_minimo"`
	ComponentesCompletos   bool     `json:"componentes_completos"`
	ComponentesCalificados int      `json:"componentes_calificados"`
	ComponentesRequeridos  int      `json:"componentes_requeridos"`
}

type MateriaCalificacionesResponse struct {
	MateriaID               string                      `json:"materia_id"`
	MateriaNombre           string                      `json:"materia_nombre"`
	CursoID                 string                      `json:"curso_id"`
	AnioEscolar             string                      `json:"anio_escolar"`
	PesoContenidosPct       float64                     `json:"peso_contenidos_pct"`
	PesoLeccionesPct        float64                     `json:"peso_lecciones_pct"`
	PesoTrabajosPct         float64                     `json:"peso_trabajos_pct"`
	PuntajeTotal            float64                     `json:"puntaje_total"`
	PuntajeMinimoAprobacion float64                     `json:"puntaje_minimo_aprobacion"`
	Items                   []MateriaCalificacionAlumno `json:"items"`
}

type MateriaCalificacionEstudianteResponse struct {
	MateriaID               string   `json:"materia_id"`
	MateriaNombre           string   `json:"materia_nombre"`
	CursoID                 string   `json:"curso_id"`
	AnioEscolar             string   `json:"anio_escolar"`
	PesoContenidosPct       float64  `json:"peso_contenidos_pct"`
	PesoLeccionesPct        float64  `json:"peso_lecciones_pct"`
	PesoTrabajosPct         float64  `json:"peso_trabajos_pct"`
	PuntajeTotal            float64  `json:"puntaje_total"`
	PuntajeMinimoAprobacion float64  `json:"puntaje_minimo_aprobacion"`
	PromedioContenidos10    *float64 `json:"promedio_contenidos_10,omitempty"`
	PromedioLecciones10     *float64 `json:"promedio_lecciones_10,omitempty"`
	PromedioTrabajos10      *float64 `json:"promedio_trabajos_10,omitempty"`
	PuntosContenidos        float64  `json:"puntos_contenidos"`
	PuntosLecciones         float64  `json:"puntos_lecciones"`
	PuntosTrabajos          float64  `json:"puntos_trabajos"`
	NotaFinal               float64  `json:"nota_final"`
	EstadoFinal             string   `json:"estado_final"`
	CumpleMinimo            bool     `json:"cumple_minimo"`
	ComponentesCompletos    bool     `json:"componentes_completos"`
	ComponentesCalificados  int      `json:"componentes_calificados"`
	ComponentesRequeridos   int      `json:"componentes_requeridos"`
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
	ID                          string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UnidadID                    string    `json:"unidad_id" gorm:"column:unidad_id"`
	Nombre                      string    `json:"nombre" gorm:"column:nombre"`
	Descripcion                 *string   `json:"descripcion" gorm:"column:descripcion"`
	UsarSoloCalificacionLeccion bool      `json:"usar_solo_calificacion_leccion" gorm:"column:usar_solo_calificacion_leccion;default:true"`
	PesoCalificacionLeccion     float64   `json:"peso_calificacion_leccion" gorm:"column:peso_calificacion_leccion;default:100"`
	PesoCalificacionContenido   float64   `json:"peso_calificacion_contenido" gorm:"column:peso_calificacion_contenido;default:0"`
	PuntajeMinimoAprobacion     float64   `json:"puntaje_minimo_aprobacion" gorm:"column:puntaje_minimo_aprobacion;default:60"`
	Orden                       int       `json:"orden" gorm:"column:orden;default:0"`
	Activo                      bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy                   *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt                   time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt                   time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Tema) TableName() string { return "internal.tema" }

type TemaRequest struct {
	UnidadID                    string   `json:"unidad_id"`
	Nombre                      string   `json:"nombre"`
	Descripcion                 *string  `json:"descripcion"`
	UsarSoloCalificacionLeccion *bool    `json:"usar_solo_calificacion_leccion"`
	PesoCalificacionLeccion     *float64 `json:"peso_calificacion_leccion"`
	PesoCalificacionContenido   *float64 `json:"peso_calificacion_contenido"`
	PuntajeMinimoAprobacion     *float64 `json:"puntaje_minimo_aprobacion"`
	Orden                       *int     `json:"orden"`
	Activo                      *bool    `json:"activo"`
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

type ContenidoReciente struct {
	ID            string    `json:"id" gorm:"column:id"`
	Tipo          string    `json:"tipo" gorm:"column:tipo"`
	Titulo        string    `json:"titulo" gorm:"column:titulo"`
	Descripcion   *string   `json:"descripcion,omitempty" gorm:"column:descripcion"`
	CreatedAt     time.Time `json:"created_at" gorm:"column:created_at"`
	LeccionID     *string   `json:"leccion_id,omitempty" gorm:"column:leccion_id"`
	TrabajoID     *string   `json:"trabajo_id,omitempty" gorm:"column:trabajo_id"`
	RecursoID     *string   `json:"recurso_id,omitempty" gorm:"column:recurso_id"`
	MateriaID     *string   `json:"materia_id,omitempty" gorm:"column:materia_id"`
	MateriaNombre *string   `json:"materia_nombre,omitempty" gorm:"column:materia_nombre"`
	CursoID       *string   `json:"curso_id,omitempty" gorm:"column:curso_id"`
	CursoNombre   *string   `json:"curso_nombre,omitempty" gorm:"column:curso_nombre"`
}

// ─── Lección Sección ────────────────────────────────────────

type LeccionSeccion struct {
	ID                     string         `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LeccionID              string         `json:"leccion_id" gorm:"column:leccion_id"`
	Tipo                   string         `json:"tipo" gorm:"column:tipo;type:internal.tipo_seccion"`
	RecursoID              *string        `json:"recurso_id" gorm:"column:recurso_id"`
	TrabajoID              *string        `json:"trabajo_id" gorm:"column:trabajo_id"`
	PruebaID               *string        `json:"prueba_id" gorm:"column:prueba_id"`
	ForoID                 *string        `json:"foro_id" gorm:"column:foro_id"`
	ModeloID               *string        `json:"modelo_id" gorm:"column:modelo_id"`
	ActividadInteractivaID *string        `json:"actividad_interactiva_id" gorm:"column:actividad_interactiva_id"`
	EstadoPublicacion      string         `json:"estado_publicacion" gorm:"column:estado_publicacion;type:internal.estado_publicacion_seccion"`
	PublicadoDesde         *time.Time     `json:"publicado_desde" gorm:"column:publicado_desde"`
	ProgramadoPara         *time.Time     `json:"programado_para" gorm:"column:programado_para"`
	Visible                bool           `json:"visible" gorm:"column:visible;default:true"`
	VisibleDesde           *time.Time     `json:"visible_desde" gorm:"column:visible_desde"`
	VisibleHasta           *time.Time     `json:"visible_hasta" gorm:"column:visible_hasta"`
	AnioEscolar            *string        `json:"anio_escolar" gorm:"column:anio_escolar"`
	NotaMaxima             float64        `json:"nota_maxima" gorm:"column:nota_maxima;default:10"`
	PesoCalif              float64        `json:"peso_calificacion" gorm:"column:peso_calificacion;default:1"`
	Calificable            bool           `json:"calificable" gorm:"column:calificable;default:false"`
	Orden                  int            `json:"orden" gorm:"column:orden;default:0"`
	EsObligatorio          bool           `json:"es_obligatorio" gorm:"column:es_obligatorio;default:true"`
	Requisitos             pq.StringArray `json:"requisitos" gorm:"column:requisitos;type:text[]"`
	CreatedAt              time.Time      `json:"created_at" gorm:"column:created_at;autoCreateTime"`
}

func (LeccionSeccion) TableName() string { return "internal.leccion_seccion" }

type LeccionSeccionRequest struct {
	LeccionID              string     `json:"leccion_id"`
	Tipo                   string     `json:"tipo"`
	RecursoID              *string    `json:"recurso_id"`
	TrabajoID              *string    `json:"trabajo_id"`
	PruebaID               *string    `json:"prueba_id"`
	ForoID                 *string    `json:"foro_id"`
	ModeloID               *string    `json:"modelo_id"`
	ActividadInteractivaID *string    `json:"actividad_interactiva_id"`
	EstadoPublicacion      *string    `json:"estado_publicacion"`
	PublicadoDesde         *time.Time `json:"publicado_desde"`
	ProgramadoPara         *time.Time `json:"programado_para"`
	Visible                *bool      `json:"visible"`
	VisibleDesde           *time.Time `json:"visible_desde"`
	VisibleHasta           *time.Time `json:"visible_hasta"`
	AnioEscolar            *string    `json:"anio_escolar"`
	NotaMaxima             *float64   `json:"nota_maxima"`
	PesoCalif              *float64   `json:"peso_calificacion"`
	Calificable            *bool      `json:"calificable"`
	Orden                  *int       `json:"orden"`
	EsObligatorio          *bool      `json:"es_obligatorio"`
	Requisitos             []string   `json:"requisitos"`
}

type LeccionSeccionLifecyclePatchRequest struct {
	EstadoPublicacion Optional[string]    `json:"estado_publicacion"`
	PublicadoDesde    Optional[time.Time] `json:"publicado_desde"`
	ProgramadoPara    Optional[time.Time] `json:"programado_para"`
	Visible           Optional[bool]      `json:"visible"`
	VisibleDesde      Optional[time.Time] `json:"visible_desde"`
	VisibleHasta      Optional[time.Time] `json:"visible_hasta"`
	AnioEscolar       Optional[string]    `json:"anio_escolar"`
}

// ─── Foro ───────────────────────────────────────────────────

type Foro struct {
	ID          string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	LeccionID   string    `json:"leccion_id" gorm:"column:leccion_id"`
	Titulo      string    `json:"titulo" gorm:"column:titulo"`
	Descripcion *string   `json:"descripcion" gorm:"column:descripcion"`
	Activo      bool      `json:"activo" gorm:"column:activo;default:true"`
	CreatedBy   *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt   time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Foro) TableName() string { return "internal.foro" }

type ForoRequest struct {
	LeccionID   string  `json:"leccion_id"`
	Titulo      string  `json:"titulo"`
	Descripcion *string `json:"descripcion"`
	Activo      *bool   `json:"activo"`
}

type ForoHilo struct {
	ID        string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	ForoID    string    `json:"foro_id" gorm:"column:foro_id"`
	Titulo    string    `json:"titulo" gorm:"column:titulo"`
	Contenido *string   `json:"contenido" gorm:"column:contenido"`
	ImagenURL *string   `json:"imagen_url" gorm:"column:imagen_url"`
	Fijado    bool      `json:"fijado" gorm:"column:fijado;default:false"`
	Cerrado   bool      `json:"cerrado" gorm:"column:cerrado;default:false"`
	CreatedBy *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ForoHilo) TableName() string { return "internal.foro_hilo" }

type ForoHiloRequest struct {
	Titulo    string  `json:"titulo"`
	Contenido *string `json:"contenido"`
	ImagenURL *string `json:"imagen_url"`
	Fijado    *bool   `json:"fijado"`
	Cerrado   *bool   `json:"cerrado"`
}

type ForoMensaje struct {
	ID              string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	HiloID          string    `json:"hilo_id" gorm:"column:hilo_id"`
	ParentMensajeID *string   `json:"parent_mensaje_id" gorm:"column:parent_mensaje_id"`
	Contenido       *string   `json:"contenido" gorm:"column:contenido"`
	ImagenURL       *string   `json:"imagen_url" gorm:"column:imagen_url"`
	CreatedBy       *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt       time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (ForoMensaje) TableName() string { return "internal.foro_mensaje" }

type ForoMensajeRequest struct {
	ParentMensajeID *string `json:"parent_mensaje_id"`
	Contenido       *string `json:"contenido"`
	ImagenURL       *string `json:"imagen_url"`
}

// ─── Video progreso seccion ────────────────────────────────

type LeccionVideoProgreso struct {
	ID               string     `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UserID           string     `json:"user_id" gorm:"column:user_id"`
	LeccionSeccionID string     `json:"leccion_seccion_id" gorm:"column:leccion_seccion_id"`
	YouTubeVideoID   string     `json:"youtube_video_id" gorm:"column:youtube_video_id"`
	WatchedSeconds   int        `json:"watched_seconds" gorm:"column:watched_seconds"`
	TotalSeconds     *int       `json:"total_seconds" gorm:"column:total_seconds"`
	PorcentajeVisto  float64    `json:"porcentaje_visto" gorm:"column:porcentaje_visto"`
	Completado       bool       `json:"completado" gorm:"column:completado"`
	FirstSeenAt      *time.Time `json:"first_seen_at" gorm:"column:first_seen_at"`
	LastSeenAt       time.Time  `json:"last_seen_at" gorm:"column:last_seen_at"`
	CreatedAt        time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt        time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (LeccionVideoProgreso) TableName() string { return "internal.leccion_video_progreso" }

type UpsertVideoProgresoRequest struct {
	LeccionSeccionID string     `json:"leccion_seccion_id"`
	YouTubeVideoID   string     `json:"youtube_video_id"`
	WatchedSeconds   *int       `json:"watched_seconds"`
	TotalSeconds     *int       `json:"total_seconds"`
	PorcentajeVisto  *float64   `json:"porcentaje_visto"`
	FirstSeenAt      *time.Time `json:"first_seen_at"`
	LastSeenAt       *time.Time `json:"last_seen_at"`
}

// ─── Gating PDF por seccion ────────────────────────────────

type LeccionSeccionGatingPDF struct {
	LeccionSeccionID       string    `json:"leccion_seccion_id" gorm:"column:leccion_seccion_id;primaryKey"`
	Habilitado             bool      `json:"habilitado" gorm:"column:habilitado"`
	SeccionPreguntasID     *string   `json:"seccion_preguntas_id" gorm:"column:seccion_preguntas_id"`
	PuntajeMinimo          float64   `json:"puntaje_minimo" gorm:"column:puntaje_minimo"`
	RequiereResponderTodas bool      `json:"requiere_responder_todas" gorm:"column:requiere_responder_todas"`
	CheckpointSegundos     *int      `json:"checkpoint_segundos" gorm:"column:checkpoint_segundos"`
	CreatedBy              *string   `json:"created_by" gorm:"column:created_by"`
	CreatedAt              time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt              time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (LeccionSeccionGatingPDF) TableName() string { return "internal.leccion_seccion_gating_pdf" }

type UpsertSeccionGatingPDFRequest struct {
	Habilitado             *bool    `json:"habilitado"`
	SeccionPreguntasID     *string  `json:"seccion_preguntas_id"`
	PuntajeMinimo          *float64 `json:"puntaje_minimo"`
	RequiereResponderTodas *bool    `json:"requiere_responder_todas"`
	CheckpointSegundos     *int     `json:"checkpoint_segundos"`
}

// ─── Materia Seguimiento ────────────────────────────────────

type MateriaSeguimiento struct {
	ID               string    `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	UsuarioID        string    `json:"usuario_id" gorm:"column:usuario_id"`
	MateriaID        string    `json:"materia_id" gorm:"column:materia_id"`
	FechaSeguimiento time.Time `json:"fecha_seguimiento" gorm:"column:fecha_seguimiento;autoCreateTime"`
}

func (MateriaSeguimiento) TableName() string { return "internal.materia_seguimiento" }

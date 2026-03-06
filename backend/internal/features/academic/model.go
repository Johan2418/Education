package academic

import "time"

// ─── Curso ──────────────────────────────────────────────────

type Curso struct {
	ID          string    `json:"id"`
	Nombre      string    `json:"nombre"`
	Descripcion *string   `json:"descripcion"`
	Orden       int       `json:"orden"`
	Activo      bool      `json:"activo"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CursoRequest struct {
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Estudiante-Curso ───────────────────────────────────────

type EstudianteCurso struct {
	ID           string    `json:"id"`
	EstudianteID string    `json:"estudiante_id"`
	CursoID      string    `json:"curso_id"`
	AnioEscolar  *string   `json:"anio_escolar"`
	CreatedAt    time.Time `json:"created_at"`
}

type EstudianteCursoRequest struct {
	EstudianteID string  `json:"estudiante_id"`
	CursoID      string  `json:"curso_id"`
	AnioEscolar  *string `json:"anio_escolar"`
}

// ─── Materia ────────────────────────────────────────────────

type Materia struct {
	ID           string    `json:"id"`
	CursoID      string    `json:"curso_id"`
	Nombre       string    `json:"nombre"`
	Descripcion  *string   `json:"descripcion"`
	ThumbnailURL *string   `json:"thumbnail_url"`
	Color        *string   `json:"color"`
	Orden        int       `json:"orden"`
	Activo       bool      `json:"activo"`
	CreatedBy    *string   `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

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
	ID          string    `json:"id"`
	MateriaID   string    `json:"materia_id"`
	Nombre      string    `json:"nombre"`
	Descripcion *string   `json:"descripcion"`
	Orden       int       `json:"orden"`
	Activo      bool      `json:"activo"`
	CreatedBy   *string   `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UnidadRequest struct {
	MateriaID   string  `json:"materia_id"`
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Tema ───────────────────────────────────────────────────

type Tema struct {
	ID          string    `json:"id"`
	UnidadID    string    `json:"unidad_id"`
	Nombre      string    `json:"nombre"`
	Descripcion *string   `json:"descripcion"`
	Orden       int       `json:"orden"`
	Activo      bool      `json:"activo"`
	CreatedBy   *string   `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type TemaRequest struct {
	UnidadID    string  `json:"unidad_id"`
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	Orden       *int    `json:"orden"`
	Activo      *bool   `json:"activo"`
}

// ─── Lección ────────────────────────────────────────────────

type Leccion struct {
	ID           string    `json:"id"`
	TemaID       string    `json:"tema_id"`
	Titulo       string    `json:"titulo"`
	Descripcion  *string   `json:"descripcion"`
	ThumbnailURL *string   `json:"thumbnail_url"`
	Orden        int       `json:"orden"`
	Activo       bool      `json:"activo"`
	CreatedBy    *string   `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

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
	ID            string    `json:"id"`
	LeccionID     string    `json:"leccion_id"`
	Tipo          string    `json:"tipo"`
	RecursoID     *string   `json:"recurso_id"`
	PruebaID      *string   `json:"prueba_id"`
	ModeloID      *string   `json:"modelo_id"`
	Orden         int       `json:"orden"`
	EsObligatorio bool      `json:"es_obligatorio"`
	Requisitos    []string  `json:"requisitos"`
	CreatedAt     time.Time `json:"created_at"`
}

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
	ID               string    `json:"id"`
	UsuarioID        string    `json:"usuario_id"`
	MateriaID        string    `json:"materia_id"`
	FechaSeguimiento time.Time `json:"fecha_seguimiento"`
}

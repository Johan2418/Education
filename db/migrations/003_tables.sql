-- ═══════════════════════════════════════════════════════════════
-- 003 · Tablas del esquema interno (datos reales)
-- Las tablas viven en "internal"; el esquema "api" expondrá
-- vistas o funciones que mapean estas tablas.
--
-- JERARQUÍA ACADÉMICA:
--   curso → materia → unidad → tema → leccion → leccion_seccion
--
-- ROLES:
--   student, teacher, resource_manager, admin, super_admin
-- ═══════════════════════════════════════════════════════════════

-- ─── Tipos enumerados ───────────────────────────────────────
CREATE TYPE internal.user_role AS ENUM (
  'student',
  'teacher',
  'resource_manager',   -- puede subir recursos (junto con teacher/admin/super_admin)
  'admin',              -- administrador creado por super_admin
  'super_admin'         -- administrador principal, puede crear admins
);

CREATE TYPE internal.tipo_seccion AS ENUM ('recurso', 'prueba', 'modelo');
CREATE TYPE internal.tipo_pregunta AS ENUM (
  'opcion_multiple',
  'verdadero_falso',
  'respuesta_corta',
  'completar'
);
CREATE TYPE internal.tipo_recurso AS ENUM (
  'documento',
  'video',
  'imagen',
  'audio',
  'presentacion',
  'enlace',
  'otro'
);

-- ═══════════════════════════════════════════════════════════════
-- USUARIOS
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. profiles ────────────────────────────────────────────
CREATE TABLE internal.profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  role           internal.user_role NOT NULL DEFAULT 'student',
  display_name   TEXT,
  phone          TEXT,
  role_requested internal.user_role,
  is_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url     TEXT,
  created_by     UUID REFERENCES internal.profiles(id) ON DELETE SET NULL, -- quién creó este usuario (para admins)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON internal.profiles (email);
CREATE INDEX idx_profiles_role  ON internal.profiles (role);

-- ═══════════════════════════════════════════════════════════════
-- JERARQUÍA ACADÉMICA
-- ═══════════════════════════════════════════════════════════════

-- ─── 2. curso (año académico / grado) ───────────────────────
CREATE TABLE internal.curso (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL UNIQUE,     -- ej: "5to Año", "3er Año"
  descripcion   TEXT,
  orden         INT NOT NULL DEFAULT 0,   -- para ordenar visualmente
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. estudiante_curso (M2M: estudiante ↔ curso) ─────────
CREATE TABLE internal.estudiante_curso (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudiante_id UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  curso_id      UUID NOT NULL REFERENCES internal.curso(id)    ON DELETE CASCADE,
  anio_escolar  TEXT,                     -- ej: "2025-2026"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estudiante_id, curso_id, anio_escolar)
);

CREATE INDEX idx_est_curso_estudiante ON internal.estudiante_curso (estudiante_id);
CREATE INDEX idx_est_curso_curso      ON internal.estudiante_curso (curso_id);

-- ─── 4. materia (antes "contenido") ─────────────────────────
CREATE TABLE internal.materia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id      UUID NOT NULL REFERENCES internal.curso(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,            -- ej: "Matemáticas", "Química"
  descripcion   TEXT,
  thumbnail_url TEXT,
  color         TEXT,                     -- color de UI (hex)
  orden         INT NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materia_curso      ON internal.materia (curso_id);
CREATE INDEX idx_materia_created_by ON internal.materia (created_by);

-- ─── 5. unidad ──────────────────────────────────────────────
CREATE TABLE internal.unidad (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id    UUID NOT NULL REFERENCES internal.materia(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,            -- ej: "Unidad 1: Aritmética Básica"
  descripcion   TEXT,
  orden         INT NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_unidad_materia ON internal.unidad (materia_id);

-- ─── 6. tema ────────────────────────────────────────────────
CREATE TABLE internal.tema (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id     UUID NOT NULL REFERENCES internal.unidad(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,            -- ej: "Suma y Resta"
  descripcion   TEXT,
  orden         INT NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tema_unidad ON internal.tema (unidad_id);

-- ─── 7. leccion ─────────────────────────────────────────────
CREATE TABLE internal.leccion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id       UUID NOT NULL REFERENCES internal.tema(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  thumbnail_url TEXT,
  orden         INT NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leccion_tema       ON internal.leccion (tema_id);
CREATE INDEX idx_leccion_created_by ON internal.leccion (created_by);

-- ═══════════════════════════════════════════════════════════════
-- RECURSOS COMPARTIDOS (pool reutilizable)
-- ═══════════════════════════════════════════════════════════════

-- ─── 8. recurso ─────────────────────────────────────────────
--   Pool global de recursos reutilizables por cualquier profesor.
--   Solo resource_manager, teacher, admin y super_admin pueden crear.
CREATE TABLE internal.recurso (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  tipo          internal.tipo_recurso NOT NULL DEFAULT 'otro',
  archivo_url   TEXT,
  texto_html    TEXT,                     -- contenido enriquecido (para tipo documento)
  tags          TEXT[],
  es_publico    BOOLEAN NOT NULL DEFAULT TRUE,  -- visible para todos los profesores
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurso_tipo       ON internal.recurso (tipo);
CREATE INDEX idx_recurso_created_by ON internal.recurso (created_by);
CREATE INDEX idx_recurso_tags       ON internal.recurso USING GIN (tags);

-- ─── 9. modelo_ra (modelos 3D / AR) ────────────────────────
--   También forma parte del pool de recursos compartidos.
CREATE TABLE internal.modelo_ra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_modelo     TEXT NOT NULL,
  archivo_url       TEXT,
  tipo              TEXT,
  keywords          TEXT[],
  molecule_formula  TEXT,
  categoria         TEXT,
  es_publico        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modelo_keywords ON internal.modelo_ra USING GIN (keywords);

-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS Y EVALUACIONES
-- ═══════════════════════════════════════════════════════════════

-- ─── 10. prueba ─────────────────────────────────────────────
CREATE TABLE internal.prueba (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id      UUID REFERENCES internal.leccion(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  tiempo_limite   INT,                    -- segundos, NULL = sin límite
  puntaje_minimo  NUMERIC(5,2) DEFAULT 0,
  orden           INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prueba_leccion ON internal.prueba (leccion_id);

-- ─── 11. pregunta ───────────────────────────────────────────
CREATE TABLE internal.pregunta (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prueba_id   UUID NOT NULL REFERENCES internal.prueba(id) ON DELETE CASCADE,
  texto       TEXT NOT NULL,
  tipo        internal.tipo_pregunta NOT NULL DEFAULT 'opcion_multiple',
  orden       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pregunta_prueba ON internal.pregunta (prueba_id);

-- ─── 13. respuesta ──────────────────────────────────────────
CREATE TABLE internal.respuesta (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id   UUID NOT NULL REFERENCES internal.pregunta(id) ON DELETE CASCADE,
  texto         TEXT NOT NULL,
  es_correcta   BOOLEAN NOT NULL DEFAULT FALSE,
  orden         INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_respuesta_pregunta ON internal.respuesta (pregunta_id);

-- ═══════════════════════════════════════════════════════════════
-- SECCIONES DE LECCIÓN (vinculan lección con recursos/pruebas/modelos)
-- ═══════════════════════════════════════════════════════════════

-- ─── 13. leccion_seccion ────────────────────────────────────
CREATE TABLE internal.leccion_seccion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id      UUID NOT NULL REFERENCES internal.leccion(id)    ON DELETE CASCADE,
  tipo            internal.tipo_seccion NOT NULL,
  recurso_id      UUID REFERENCES internal.recurso(id)    ON DELETE SET NULL,
  prueba_id       UUID REFERENCES internal.prueba(id)     ON DELETE SET NULL,
  modelo_id       UUID REFERENCES internal.modelo_ra(id)  ON DELETE SET NULL,
  orden           INT NOT NULL DEFAULT 0,
  es_obligatorio  BOOLEAN NOT NULL DEFAULT TRUE,
  requisitos      UUID[],                  -- IDs de secciones previas requeridas
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seccion_leccion ON internal.leccion_seccion (leccion_id);

-- ═══════════════════════════════════════════════════════════════
-- PROGRESO Y RESULTADOS
-- ═══════════════════════════════════════════════════════════════

-- ─── 14. progreso (nivel lección) ───────────────────────────
CREATE TABLE internal.progreso (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id          UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  leccion_id          UUID NOT NULL REFERENCES internal.leccion(id)  ON DELETE CASCADE,
  completado          BOOLEAN NOT NULL DEFAULT FALSE,
  puntaje             NUMERIC(5,2),
  fecha_ultimo_acceso TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, leccion_id)
);

-- ─── 15. progreso_seccion (nivel sección) ───────────────────
CREATE TABLE internal.progreso_seccion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES internal.profiles(id)          ON DELETE CASCADE,
  leccion_seccion_id UUID NOT NULL REFERENCES internal.leccion_seccion(id)   ON DELETE CASCADE,
  completado         BOOLEAN NOT NULL DEFAULT FALSE,
  puntuacion         NUMERIC(5,2),
  tiempo_dedicado    INT DEFAULT 0,        -- segundos acumulados
  intentos           INT DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, leccion_seccion_id)
);

-- ─── 16. resultado_prueba ───────────────────────────────────
CREATE TABLE internal.resultado_prueba (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prueba_id         UUID NOT NULL REFERENCES internal.prueba(id)    ON DELETE CASCADE,
  usuario_id        UUID NOT NULL REFERENCES internal.profiles(id)  ON DELETE CASCADE,
  puntaje_obtenido  NUMERIC(5,2) NOT NULL DEFAULT 0,
  aprobado          BOOLEAN NOT NULL DEFAULT FALSE,
  respuestas        JSONB,                 -- snapshot de las respuestas dadas
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resultado_prueba   ON internal.resultado_prueba (prueba_id);
CREATE INDEX idx_resultado_usuario  ON internal.resultado_prueba (usuario_id);

-- ─── 17. materia_seguimiento (seguimiento de materias) ──────
CREATE TABLE internal.materia_seguimiento (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  materia_id        UUID NOT NULL REFERENCES internal.materia(id)  ON DELETE CASCADE,
  fecha_seguimiento TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, materia_id)
);

CREATE INDEX idx_seguimiento_usuario ON internal.materia_seguimiento (usuario_id);
CREATE INDEX idx_seguimiento_materia ON internal.materia_seguimiento (materia_id);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: auto-actualizar updated_at
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION internal.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles', 'curso', 'materia', 'unidad', 'tema',
    'leccion', 'recurso', 'modelo_ra', 'prueba',
    'progreso', 'progreso_seccion'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
         BEFORE UPDATE ON internal.%I
         FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END
$$;

-- 016: Catalogo global de libros reutilizables + licencias de acceso

-- ─── Tipos ──────────────────────────────────────────────────
CREATE TYPE internal.estado_libro_recurso AS ENUM (
  'pendiente',
  'procesando',
  'completado',
  'error',
  'archivado'
);

-- ─── Catalogo global de libros (reutilizable) ───────────────
CREATE TABLE internal.libro_recurso (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo             TEXT NOT NULL,
  descripcion        TEXT,
  archivo_url        TEXT,
  idioma             TEXT NOT NULL DEFAULT 'es',
  paginas_totales    INT,
  hash_contenido     TEXT NOT NULL,
  hash_archivo       TEXT,
  hash_version       TEXT NOT NULL DEFAULT 'v1',
  estado             internal.estado_libro_recurso NOT NULL DEFAULT 'pendiente',
  es_publico         BOOLEAN NOT NULL DEFAULT FALSE,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hash_contenido, hash_version),
  UNIQUE (hash_archivo)
);

CREATE INDEX idx_libro_recurso_estado ON internal.libro_recurso (estado);
CREATE INDEX idx_libro_recurso_publico ON internal.libro_recurso (es_publico);
CREATE INDEX idx_libro_recurso_hash_contenido ON internal.libro_recurso (hash_contenido);

CREATE TRIGGER trg_libro_recurso_updated_at
  BEFORE UPDATE ON internal.libro_recurso
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- ─── Licencias de uso por libro ─────────────────────────────
CREATE TABLE internal.libro_recurso_licencia (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libro_recurso_id   UUID NOT NULL REFERENCES internal.libro_recurso(id) ON DELETE CASCADE,
  nombre             TEXT NOT NULL,
  proveedor          TEXT,
  codigo             TEXT,
  fecha_inicio       TIMESTAMPTZ,
  fecha_fin          TIMESTAMPTZ,
  activa             BOOLEAN NOT NULL DEFAULT TRUE,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT libro_recurso_licencia_fechas_validas CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_libro_recurso_licencia_libro ON internal.libro_recurso_licencia (libro_recurso_id);
CREATE INDEX idx_libro_recurso_licencia_activa ON internal.libro_recurso_licencia (activa);

CREATE TRIGGER trg_libro_recurso_licencia_updated_at
  BEFORE UPDATE ON internal.libro_recurso_licencia
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- ─── Asignaciones de licencia a usuarios ────────────────────
CREATE TABLE internal.libro_recurso_licencia_profile (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licencia_id        UUID NOT NULL REFERENCES internal.libro_recurso_licencia(id) ON DELETE CASCADE,
  profile_id         UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  created_by         UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (licencia_id, profile_id)
);

CREATE INDEX idx_lr_lic_profile_licencia ON internal.libro_recurso_licencia_profile (licencia_id);
CREATE INDEX idx_lr_lic_profile_profile ON internal.libro_recurso_licencia_profile (profile_id);

-- ─── Asignaciones de licencia a cursos ──────────────────────
CREATE TABLE internal.libro_recurso_licencia_curso (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licencia_id        UUID NOT NULL REFERENCES internal.libro_recurso_licencia(id) ON DELETE CASCADE,
  curso_id           UUID NOT NULL REFERENCES internal.curso(id) ON DELETE CASCADE,
  created_by         UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (licencia_id, curso_id)
);

CREATE INDEX idx_lr_lic_curso_licencia ON internal.libro_recurso_licencia_curso (licencia_id);
CREATE INDEX idx_lr_lic_curso_curso ON internal.libro_recurso_licencia_curso (curso_id);

-- ─── Relacion trabajo ↔ libro_recurso reutilizado ───────────
CREATE TABLE internal.trabajo_libro_recurso (
  trabajo_id         UUID PRIMARY KEY REFERENCES internal.trabajo(id) ON DELETE CASCADE,
  libro_recurso_id   UUID NOT NULL REFERENCES internal.libro_recurso(id) ON DELETE RESTRICT,
  created_by         UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trabajo_libro_recurso_libro ON internal.trabajo_libro_recurso (libro_recurso_id);

ALTER TABLE internal.libro_extraccion
  ADD COLUMN IF NOT EXISTS libro_recurso_id UUID REFERENCES internal.libro_recurso(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_libro_extraccion_libro_recurso ON internal.libro_extraccion (libro_recurso_id);

-- ─── Funciones auxiliares de acceso ─────────────────────────
CREATE OR REPLACE FUNCTION internal.licencia_vigente(p_licencia_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM internal.libro_recurso_licencia l
    WHERE l.id = p_licencia_id
      AND l.activa = TRUE
      AND (l.fecha_inicio IS NULL OR l.fecha_inicio <= now())
      AND (l.fecha_fin IS NULL OR l.fecha_fin >= now())
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION internal.can_access_libro_recurso(p_libro_recurso_id UUID)
RETURNS BOOLEAN AS $$
  SELECT (
    -- Admins y super admins siempre pueden ver
    internal.current_user_role() IN ('admin', 'super_admin')

    -- Resource manager puede revisar catalogo completo
    OR internal.current_user_role() = 'resource_manager'

    -- Libro publico
    OR EXISTS (
      SELECT 1
      FROM internal.libro_recurso lr
      WHERE lr.id = p_libro_recurso_id
        AND lr.es_publico = TRUE
    )

    -- Licencia asignada directamente al usuario
    OR EXISTS (
      SELECT 1
      FROM internal.libro_recurso_licencia l
      JOIN internal.libro_recurso_licencia_profile lp ON lp.licencia_id = l.id
      WHERE l.libro_recurso_id = p_libro_recurso_id
        AND lp.profile_id = internal.current_user_id()
        AND internal.licencia_vigente(l.id)
    )

    -- Licencia asignada al curso del docente
    OR EXISTS (
      SELECT 1
      FROM internal.libro_recurso_licencia l
      JOIN internal.libro_recurso_licencia_curso lc ON lc.licencia_id = l.id
      JOIN internal.curso c ON c.id = lc.curso_id
      WHERE l.libro_recurso_id = p_libro_recurso_id
        AND c.teacher_id = internal.current_user_id()
        AND internal.current_user_role() = 'teacher'
        AND internal.licencia_vigente(l.id)
    )

    -- Licencia asignada al curso del estudiante
    OR EXISTS (
      SELECT 1
      FROM internal.libro_recurso_licencia l
      JOIN internal.libro_recurso_licencia_curso lc ON lc.licencia_id = l.id
      JOIN internal.estudiante_curso ec ON ec.curso_id = lc.curso_id
      WHERE l.libro_recurso_id = p_libro_recurso_id
        AND ec.estudiante_id = internal.current_user_id()
        AND internal.current_user_role() = 'student'
        AND internal.licencia_vigente(l.id)
    )
  );
$$ LANGUAGE sql STABLE;

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE internal.libro_recurso ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.libro_recurso_licencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.libro_recurso_licencia_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.libro_recurso_licencia_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.trabajo_libro_recurso ENABLE ROW LEVEL SECURITY;

CREATE POLICY libro_recurso_select ON internal.libro_recurso
  FOR SELECT USING (internal.can_access_libro_recurso(id));

CREATE POLICY libro_recurso_modify ON internal.libro_recurso
  FOR ALL USING (internal.can_upload_resources())
  WITH CHECK (internal.can_upload_resources());

CREATE POLICY libro_recurso_licencia_select ON internal.libro_recurso_licencia
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin', 'resource_manager')
    OR (
      internal.current_user_role() = 'teacher'
      AND EXISTS (
        SELECT 1
        FROM internal.libro_recurso lr
        WHERE lr.id = libro_recurso_id
          AND internal.can_access_libro_recurso(lr.id)
      )
    )
  );

CREATE POLICY libro_recurso_licencia_modify ON internal.libro_recurso_licencia
  FOR ALL USING (internal.can_upload_resources())
  WITH CHECK (internal.can_upload_resources());

CREATE POLICY libro_recurso_lic_profile_select ON internal.libro_recurso_licencia_profile
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin', 'resource_manager')
    OR profile_id = internal.current_user_id()
  );

CREATE POLICY libro_recurso_lic_profile_modify ON internal.libro_recurso_licencia_profile
  FOR ALL USING (internal.can_upload_resources())
  WITH CHECK (internal.can_upload_resources());

CREATE POLICY libro_recurso_lic_curso_select ON internal.libro_recurso_licencia_curso
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin', 'resource_manager')
    OR (
      internal.current_user_role() = 'teacher'
      AND EXISTS (
        SELECT 1
        FROM internal.curso c
        WHERE c.id = curso_id
          AND c.teacher_id = internal.current_user_id()
      )
    )
    OR (
      internal.current_user_role() = 'student'
      AND EXISTS (
        SELECT 1
        FROM internal.estudiante_curso ec
        WHERE ec.curso_id = curso_id
          AND ec.estudiante_id = internal.current_user_id()
      )
    )
  );

CREATE POLICY libro_recurso_lic_curso_modify ON internal.libro_recurso_licencia_curso
  FOR ALL USING (internal.can_upload_resources())
  WITH CHECK (internal.can_upload_resources());

CREATE POLICY trabajo_libro_recurso_select ON internal.trabajo_libro_recurso
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM internal.trabajo t
      WHERE t.id = trabajo_id
    )
  );

CREATE POLICY trabajo_libro_recurso_modify ON internal.trabajo_libro_recurso
  FOR ALL USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  ) WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

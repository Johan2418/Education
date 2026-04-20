-- 022: Recursos 360 - publicacion/visibilidad, foro, video tracking y gating PDF

-- ─── Tipos extendidos ──────────────────────────────────────
ALTER TYPE internal.tipo_seccion ADD VALUE IF NOT EXISTS 'trabajo';
ALTER TYPE internal.tipo_seccion ADD VALUE IF NOT EXISTS 'foro';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estado_publicacion_seccion'
      AND n.nspname = 'internal'
  ) THEN
    CREATE TYPE internal.estado_publicacion_seccion AS ENUM (
      'borrador',
      'programado',
      'publicado',
      'despublicado'
    );
  END IF;
END
$$;

-- ─── Foro ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.foro (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id    UUID NOT NULL REFERENCES internal.leccion(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foro_leccion ON internal.foro (leccion_id);
CREATE INDEX IF NOT EXISTS idx_foro_created_by ON internal.foro (created_by);

CREATE TABLE IF NOT EXISTS internal.foro_hilo (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foro_id        UUID NOT NULL REFERENCES internal.foro(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  contenido     TEXT,
  imagen_url    TEXT,
  fijado        BOOLEAN NOT NULL DEFAULT FALSE,
  cerrado       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT foro_hilo_contenido_check CHECK (
    (contenido IS NOT NULL AND btrim(contenido) <> '')
    OR (imagen_url IS NOT NULL AND btrim(imagen_url) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_foro_hilo_foro ON internal.foro_hilo (foro_id);
CREATE INDEX IF NOT EXISTS idx_foro_hilo_created_by ON internal.foro_hilo (created_by);
CREATE INDEX IF NOT EXISTS idx_foro_hilo_created_at ON internal.foro_hilo (created_at DESC);

CREATE TABLE IF NOT EXISTS internal.foro_mensaje (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hilo_id           UUID NOT NULL REFERENCES internal.foro_hilo(id) ON DELETE CASCADE,
  parent_mensaje_id UUID REFERENCES internal.foro_mensaje(id) ON DELETE CASCADE,
  contenido         TEXT,
  imagen_url        TEXT,
  created_by        UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT foro_mensaje_contenido_check CHECK (
    (contenido IS NOT NULL AND btrim(contenido) <> '')
    OR (imagen_url IS NOT NULL AND btrim(imagen_url) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_foro_mensaje_hilo ON internal.foro_mensaje (hilo_id);
CREATE INDEX IF NOT EXISTS idx_foro_mensaje_parent ON internal.foro_mensaje (parent_mensaje_id);
CREATE INDEX IF NOT EXISTS idx_foro_mensaje_created_by ON internal.foro_mensaje (created_by);
CREATE INDEX IF NOT EXISTS idx_foro_mensaje_created_at ON internal.foro_mensaje (created_at);

CREATE TABLE IF NOT EXISTS internal.foro_mensaje_reaccion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id    UUID NOT NULL REFERENCES internal.foro_mensaje(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'like',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mensaje_id, user_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_foro_reaccion_mensaje ON internal.foro_mensaje_reaccion (mensaje_id);
CREATE INDEX IF NOT EXISTS idx_foro_reaccion_user ON internal.foro_mensaje_reaccion (user_id);

-- ─── Seccion: publicacion, visibilidad, anio y vinculos ─────
ALTER TABLE internal.leccion_seccion
  ADD COLUMN IF NOT EXISTS trabajo_id UUID REFERENCES internal.trabajo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foro_id UUID REFERENCES internal.foro(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado_publicacion internal.estado_publicacion_seccion NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS publicado_desde TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS programado_para TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS visible_desde TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visible_hasta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anio_escolar TEXT;

CREATE INDEX IF NOT EXISTS idx_seccion_trabajo ON internal.leccion_seccion (trabajo_id);
CREATE INDEX IF NOT EXISTS idx_seccion_foro ON internal.leccion_seccion (foro_id);
CREATE INDEX IF NOT EXISTS idx_seccion_estado_publicacion ON internal.leccion_seccion (estado_publicacion);
CREATE INDEX IF NOT EXISTS idx_seccion_programado_para ON internal.leccion_seccion (programado_para);
CREATE INDEX IF NOT EXISTS idx_seccion_visible ON internal.leccion_seccion (visible);
CREATE INDEX IF NOT EXISTS idx_seccion_anio_escolar ON internal.leccion_seccion (anio_escolar);

ALTER TABLE internal.leccion_seccion
  DROP CONSTRAINT IF EXISTS leccion_seccion_publicacion_programada_check;

ALTER TABLE internal.leccion_seccion
  ADD CONSTRAINT leccion_seccion_publicacion_programada_check
  CHECK (
    estado_publicacion <> 'programado'::internal.estado_publicacion_seccion
    OR programado_para IS NOT NULL
  );

ALTER TABLE internal.leccion_seccion
  DROP CONSTRAINT IF EXISTS leccion_seccion_visible_range_check;

ALTER TABLE internal.leccion_seccion
  ADD CONSTRAINT leccion_seccion_visible_range_check
  CHECK (
    visible_hasta IS NULL
    OR visible_desde IS NULL
    OR visible_hasta >= visible_desde
  );

-- ─── Tracking YouTube por seccion ───────────────────────────
CREATE TABLE IF NOT EXISTS internal.leccion_video_progreso (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  leccion_seccion_id UUID NOT NULL REFERENCES internal.leccion_seccion(id) ON DELETE CASCADE,
  youtube_video_id  TEXT NOT NULL,
  watched_seconds   INT NOT NULL DEFAULT 0,
  total_seconds     INT,
  porcentaje_visto  NUMERIC(5,2) NOT NULL DEFAULT 0,
  completado        BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at     TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, leccion_seccion_id, youtube_video_id),
  CONSTRAINT leccion_video_progreso_watched_check CHECK (watched_seconds >= 0),
  CONSTRAINT leccion_video_progreso_total_check CHECK (total_seconds IS NULL OR total_seconds >= 0),
  CONSTRAINT leccion_video_progreso_porcentaje_check CHECK (porcentaje_visto >= 0 AND porcentaje_visto <= 100)
);

CREATE INDEX IF NOT EXISTS idx_video_progreso_user ON internal.leccion_video_progreso (user_id);
CREATE INDEX IF NOT EXISTS idx_video_progreso_seccion ON internal.leccion_video_progreso (leccion_seccion_id);
CREATE INDEX IF NOT EXISTS idx_video_progreso_completado ON internal.leccion_video_progreso (completado);

-- ─── Gating de PDF por preguntas obligatorias ───────────────
CREATE TABLE IF NOT EXISTS internal.leccion_seccion_gating_pdf (
  leccion_seccion_id      UUID PRIMARY KEY REFERENCES internal.leccion_seccion(id) ON DELETE CASCADE,
  habilitado              BOOLEAN NOT NULL DEFAULT FALSE,
  seccion_preguntas_id    UUID REFERENCES internal.leccion_seccion(id) ON DELETE SET NULL,
  puntaje_minimo          NUMERIC(5,2) NOT NULL DEFAULT 0,
  requiere_responder_todas BOOLEAN NOT NULL DEFAULT TRUE,
  created_by              UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leccion_seccion_gating_pdf_puntaje_check CHECK (puntaje_minimo >= 0 AND puntaje_minimo <= 100)
);

CREATE INDEX IF NOT EXISTS idx_gating_pdf_seccion_preguntas ON internal.leccion_seccion_gating_pdf (seccion_preguntas_id);

-- ─── Triggers updated_at ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_foro_updated_at ON internal.foro;
CREATE TRIGGER trg_foro_updated_at
  BEFORE UPDATE ON internal.foro
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

DROP TRIGGER IF EXISTS trg_foro_hilo_updated_at ON internal.foro_hilo;
CREATE TRIGGER trg_foro_hilo_updated_at
  BEFORE UPDATE ON internal.foro_hilo
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

DROP TRIGGER IF EXISTS trg_foro_mensaje_updated_at ON internal.foro_mensaje;
CREATE TRIGGER trg_foro_mensaje_updated_at
  BEFORE UPDATE ON internal.foro_mensaje
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

DROP TRIGGER IF EXISTS trg_video_progreso_updated_at ON internal.leccion_video_progreso;
CREATE TRIGGER trg_video_progreso_updated_at
  BEFORE UPDATE ON internal.leccion_video_progreso
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

DROP TRIGGER IF EXISTS trg_gating_pdf_updated_at ON internal.leccion_seccion_gating_pdf;
CREATE TRIGGER trg_gating_pdf_updated_at
  BEFORE UPDATE ON internal.leccion_seccion_gating_pdf
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- ─── Funciones de disponibilidad (publicacion + visibilidad) ─
CREATE OR REPLACE FUNCTION internal.is_seccion_publicada(
  p_estado internal.estado_publicacion_seccion,
  p_publicado_desde TIMESTAMPTZ,
  p_programado_para TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p_estado = 'publicado'::internal.estado_publicacion_seccion THEN
      (p_publicado_desde IS NULL OR p_publicado_desde <= now())
    WHEN p_estado = 'programado'::internal.estado_publicacion_seccion THEN
      (p_programado_para IS NOT NULL AND p_programado_para <= now())
    ELSE FALSE
  END;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION internal.is_seccion_visible(
  p_visible BOOLEAN,
  p_visible_desde TIMESTAMPTZ,
  p_visible_hasta TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
  SELECT (
    p_visible = TRUE
    AND (p_visible_desde IS NULL OR p_visible_desde <= now())
    AND (p_visible_hasta IS NULL OR p_visible_hasta >= now())
  );
$$ LANGUAGE sql STABLE;

-- ─── RLS: tablas nuevas ─────────────────────────────────────
ALTER TABLE internal.foro ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.foro_hilo ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.foro_mensaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.foro_mensaje_reaccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.leccion_video_progreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.leccion_seccion_gating_pdf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS foro_select ON internal.foro;
CREATE POLICY foro_select ON internal.foro
  FOR SELECT USING (true);

DROP POLICY IF EXISTS foro_modify ON internal.foro;
CREATE POLICY foro_modify ON internal.foro
  FOR ALL USING (internal.is_editor())
  WITH CHECK (internal.is_editor());

DROP POLICY IF EXISTS foro_hilo_select ON internal.foro_hilo;
CREATE POLICY foro_hilo_select ON internal.foro_hilo
  FOR SELECT USING (true);

DROP POLICY IF EXISTS foro_hilo_insert ON internal.foro_hilo;
CREATE POLICY foro_hilo_insert ON internal.foro_hilo
  FOR INSERT WITH CHECK (internal.current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS foro_hilo_update ON internal.foro_hilo;
CREATE POLICY foro_hilo_update ON internal.foro_hilo
  FOR UPDATE USING (
    created_by = internal.current_user_id()
    OR internal.is_editor()
  );

DROP POLICY IF EXISTS foro_hilo_delete ON internal.foro_hilo;
CREATE POLICY foro_hilo_delete ON internal.foro_hilo
  FOR DELETE USING (
    created_by = internal.current_user_id()
    OR internal.is_editor()
  );

DROP POLICY IF EXISTS foro_mensaje_select ON internal.foro_mensaje;
CREATE POLICY foro_mensaje_select ON internal.foro_mensaje
  FOR SELECT USING (true);

DROP POLICY IF EXISTS foro_mensaje_insert ON internal.foro_mensaje;
CREATE POLICY foro_mensaje_insert ON internal.foro_mensaje
  FOR INSERT WITH CHECK (internal.current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS foro_mensaje_update ON internal.foro_mensaje;
CREATE POLICY foro_mensaje_update ON internal.foro_mensaje
  FOR UPDATE USING (
    created_by = internal.current_user_id()
    OR internal.is_editor()
  );

DROP POLICY IF EXISTS foro_mensaje_delete ON internal.foro_mensaje;
CREATE POLICY foro_mensaje_delete ON internal.foro_mensaje
  FOR DELETE USING (
    created_by = internal.current_user_id()
    OR internal.is_editor()
  );

DROP POLICY IF EXISTS foro_reaccion_select ON internal.foro_mensaje_reaccion;
CREATE POLICY foro_reaccion_select ON internal.foro_mensaje_reaccion
  FOR SELECT USING (true);

DROP POLICY IF EXISTS foro_reaccion_insert ON internal.foro_mensaje_reaccion;
CREATE POLICY foro_reaccion_insert ON internal.foro_mensaje_reaccion
  FOR INSERT WITH CHECK (
    user_id = internal.current_user_id()
  );

DROP POLICY IF EXISTS foro_reaccion_delete ON internal.foro_mensaje_reaccion;
CREATE POLICY foro_reaccion_delete ON internal.foro_mensaje_reaccion
  FOR DELETE USING (
    user_id = internal.current_user_id()
    OR internal.is_editor()
  );

DROP POLICY IF EXISTS video_progreso_select ON internal.leccion_video_progreso;
CREATE POLICY video_progreso_select ON internal.leccion_video_progreso
  FOR SELECT USING (
    user_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS video_progreso_insert ON internal.leccion_video_progreso;
CREATE POLICY video_progreso_insert ON internal.leccion_video_progreso
  FOR INSERT WITH CHECK (user_id = internal.current_user_id());

DROP POLICY IF EXISTS video_progreso_update ON internal.leccion_video_progreso;
CREATE POLICY video_progreso_update ON internal.leccion_video_progreso
  FOR UPDATE USING (user_id = internal.current_user_id());

DROP POLICY IF EXISTS gating_pdf_select ON internal.leccion_seccion_gating_pdf;
CREATE POLICY gating_pdf_select ON internal.leccion_seccion_gating_pdf
  FOR SELECT USING (true);

DROP POLICY IF EXISTS gating_pdf_modify ON internal.leccion_seccion_gating_pdf;
CREATE POLICY gating_pdf_modify ON internal.leccion_seccion_gating_pdf
  FOR ALL USING (internal.is_editor())
  WITH CHECK (internal.is_editor());

-- ─── RLS: ajuste de seleccion de secciones para estudiantes ─
DROP POLICY IF EXISTS leccion_seccion_select ON internal.leccion_seccion;
CREATE POLICY leccion_seccion_select ON internal.leccion_seccion
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    OR (
      internal.current_user_role() = 'student'
      AND internal.is_seccion_publicada(estado_publicacion, publicado_desde, programado_para)
      AND internal.is_seccion_visible(visible, visible_desde, visible_hasta)
    )
  );

-- ─── Vista API actualizada para exponer nuevas columnas ─────
CREATE OR REPLACE VIEW api.leccion_seccion AS
  SELECT * FROM internal.leccion_seccion;

-- 013: Extraccion de preguntas desde libro (Sprint 3)

-- ─── Tipos ──────────────────────────────────────────────────
CREATE TYPE internal.estado_extraccion_libro AS ENUM (
  'pendiente',
  'extrayendo',
  'completado',
  'en_revision',
  'aprobado',
  'cancelado'
);

-- ─── Sesion de extraccion por trabajo ───────────────────────
CREATE TABLE internal.libro_extraccion (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id          UUID NOT NULL UNIQUE REFERENCES internal.trabajo(id) ON DELETE CASCADE,
  archivo_url         TEXT,
  idioma              TEXT NOT NULL DEFAULT 'es',
  pagina_inicio       INT NOT NULL DEFAULT 1,
  pagina_fin          INT,
  estado              internal.estado_extraccion_libro NOT NULL DEFAULT 'pendiente',
  preguntas_detectadas INT NOT NULL DEFAULT 0,
  confianza_promedio  NUMERIC(4,3),
  notas_extraccion    TEXT,
  notas_revision      TEXT,
  usado_fallback      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  revisado_por        UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  confirmado_por      UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_libro_extraccion_trabajo ON internal.libro_extraccion(trabajo_id);
CREATE INDEX idx_libro_extraccion_estado ON internal.libro_extraccion(estado);

CREATE TRIGGER trg_libro_extraccion_updated_at
  BEFORE UPDATE ON internal.libro_extraccion
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- ─── Vinculacion con trabajo ────────────────────────────────
ALTER TABLE internal.trabajo
  ADD COLUMN extraido_de_libro BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN id_extraccion UUID REFERENCES internal.libro_extraccion(id) ON DELETE SET NULL;

CREATE INDEX idx_trabajo_id_extraccion ON internal.trabajo(id_extraccion);

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE internal.libro_extraccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY libro_extraccion_select ON internal.libro_extraccion
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR (
      internal.current_user_role() = 'teacher'
      AND EXISTS (
        SELECT 1
        FROM internal.trabajo tr
        JOIN internal.leccion l ON l.id = tr.leccion_id
        JOIN internal.tema t ON t.id = l.tema_id
        JOIN internal.unidad u ON u.id = t.unidad_id
        JOIN internal.materia m ON m.id = u.materia_id
        JOIN internal.curso c ON c.id = m.curso_id
        WHERE tr.id = trabajo_id
          AND c.teacher_id = internal.current_user_id()
      )
    )
  );

CREATE POLICY libro_extraccion_modify ON internal.libro_extraccion
  FOR ALL USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  ) WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

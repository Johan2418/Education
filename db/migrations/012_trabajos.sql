-- 012: Trabajos (MVP Sprint 1)

-- ─── Tipos ──────────────────────────────────────────────────
CREATE TYPE internal.estado_trabajo AS ENUM ('borrador', 'publicado', 'cerrado');
CREATE TYPE internal.estado_entrega_trabajo AS ENUM ('enviada', 'revisada', 'calificada');

-- ─── Trabajo ────────────────────────────────────────────────
CREATE TABLE internal.trabajo (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id       UUID NOT NULL REFERENCES internal.leccion(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  descripcion      TEXT,
  instrucciones    TEXT,
  fecha_vencimiento TIMESTAMPTZ,
  estado           internal.estado_trabajo NOT NULL DEFAULT 'borrador',
  created_by       UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trabajo_leccion ON internal.trabajo (leccion_id);
CREATE INDEX idx_trabajo_estado ON internal.trabajo (estado);
CREATE INDEX idx_trabajo_created_by ON internal.trabajo (created_by);

-- ─── Preguntas del trabajo ──────────────────────────────────
CREATE TABLE internal.trabajo_pregunta (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id       UUID NOT NULL REFERENCES internal.trabajo(id) ON DELETE CASCADE,
  texto            TEXT NOT NULL,
  tipo             internal.tipo_pregunta NOT NULL DEFAULT 'respuesta_corta',
  opciones         JSONB,
  pagina_libro     INT,
  confianza_ia     NUMERIC(4,3),
  orden            INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trabajo_pregunta_trabajo ON internal.trabajo_pregunta (trabajo_id);

-- ─── Entregas ───────────────────────────────────────────────
CREATE TABLE internal.trabajo_entrega (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id       UUID NOT NULL REFERENCES internal.trabajo(id) ON DELETE CASCADE,
  estudiante_id    UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  respuestas       JSONB NOT NULL DEFAULT '{}'::jsonb,
  archivo_url      TEXT,
  comentario       TEXT,
  estado           internal.estado_entrega_trabajo NOT NULL DEFAULT 'enviada',
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trabajo_id, estudiante_id)
);

CREATE INDEX idx_trabajo_entrega_trabajo ON internal.trabajo_entrega (trabajo_id);
CREATE INDEX idx_trabajo_entrega_estudiante ON internal.trabajo_entrega (estudiante_id);
CREATE INDEX idx_trabajo_entrega_estado ON internal.trabajo_entrega (estado);

-- ─── Calificaciones ─────────────────────────────────────────
CREATE TABLE internal.trabajo_calificacion (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id       UUID NOT NULL UNIQUE REFERENCES internal.trabajo_entrega(id) ON DELETE CASCADE,
  docente_id       UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  puntaje          NUMERIC(5,2) NOT NULL,
  feedback         TEXT,
  sugerencia_ia    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trabajo_calificacion_docente ON internal.trabajo_calificacion (docente_id);

-- ─── Triggers updated_at ────────────────────────────────────
CREATE TRIGGER trg_trabajo_updated_at
  BEFORE UPDATE ON internal.trabajo
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

CREATE TRIGGER trg_trabajo_entrega_updated_at
  BEFORE UPDATE ON internal.trabajo_entrega
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

CREATE TRIGGER trg_trabajo_calificacion_updated_at
  BEFORE UPDATE ON internal.trabajo_calificacion
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE internal.trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.trabajo_pregunta ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.trabajo_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.trabajo_calificacion ENABLE ROW LEVEL SECURITY;

-- Trabajo: docentes/admin gestionan; estudiantes solo ven publicados/cerrados de su curso.
CREATE POLICY trabajo_select ON internal.trabajo
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    OR (
      internal.current_user_role() = 'student'
      AND estado IN ('publicado', 'cerrado')
      AND EXISTS (
        SELECT 1
        FROM internal.leccion l
        JOIN internal.tema t ON t.id = l.tema_id
        JOIN internal.unidad u ON u.id = t.unidad_id
        JOIN internal.materia m ON m.id = u.materia_id
        JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id
        WHERE l.id = leccion_id
          AND ec.estudiante_id = internal.current_user_id()
      )
    )
  );

CREATE POLICY trabajo_insert ON internal.trabajo
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY trabajo_update ON internal.trabajo
  FOR UPDATE USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY trabajo_delete ON internal.trabajo
  FOR DELETE USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

-- Preguntas del trabajo: se heredan permisos de trabajo.
CREATE POLICY trabajo_pregunta_select ON internal.trabajo_pregunta
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM internal.trabajo t
      WHERE t.id = trabajo_id
    )
  );

CREATE POLICY trabajo_pregunta_modify ON internal.trabajo_pregunta
  FOR ALL USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

-- Entregas: estudiante dueño y docentes/admin del sistema.
CREATE POLICY trabajo_entrega_select ON internal.trabajo_entrega
  FOR SELECT USING (
    estudiante_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY trabajo_entrega_insert ON internal.trabajo_entrega
  FOR INSERT WITH CHECK (
    estudiante_id = internal.current_user_id()
  );

CREATE POLICY trabajo_entrega_update ON internal.trabajo_entrega
  FOR UPDATE USING (
    estudiante_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

-- Calificacion: docentes/admin escriben, estudiante solo lee su propia entrega.
CREATE POLICY trabajo_calificacion_select ON internal.trabajo_calificacion
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.trabajo_entrega te
      WHERE te.id = entrega_id
        AND te.estudiante_id = internal.current_user_id()
    )
  );

CREATE POLICY trabajo_calificacion_insert ON internal.trabajo_calificacion
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY trabajo_calificacion_update ON internal.trabajo_calificacion
  FOR UPDATE USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

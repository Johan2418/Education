-- 025: docente por materia + horario semanal sin solapes por profesor

-- Legacy constraint no longer applies with subject-based assignment.
ALTER TABLE internal.curso
  DROP CONSTRAINT IF EXISTS uq_curso_teacher;

-- Academic runtime configuration (single-row table).
CREATE TABLE IF NOT EXISTS internal.configuracion_academica (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  anio_escolar_activo TEXT NOT NULL,
  zona_horaria       TEXT NOT NULL DEFAULT 'America/Guayaquil',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_configuracion_academica_updated_at
  BEFORE UPDATE ON internal.configuracion_academica
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

INSERT INTO internal.configuracion_academica (id, anio_escolar_activo, zona_horaria)
VALUES (
  1,
  (EXTRACT(YEAR FROM CURRENT_DATE)::INT)::TEXT || '-' || ((EXTRACT(YEAR FROM CURRENT_DATE)::INT) + 1)::TEXT,
  'America/Guayaquil'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS internal.docente_materia_asignacion (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  docente_id     UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  materia_id     UUID NOT NULL REFERENCES internal.materia(id) ON DELETE CASCADE,
  curso_id       UUID NOT NULL REFERENCES internal.curso(id) ON DELETE CASCADE,
  anio_escolar   TEXT NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_docente_materia_anio_escolar_format CHECK (anio_escolar ~ '^[0-9]{4}-[0-9]{4}$'),
  CONSTRAINT uq_docente_materia_curso_anio UNIQUE (docente_id, materia_id, curso_id, anio_escolar),
  CONSTRAINT uq_materia_curso_anio_docente UNIQUE (materia_id, curso_id, anio_escolar)
);

CREATE INDEX IF NOT EXISTS idx_docente_materia_asignacion_docente
  ON internal.docente_materia_asignacion (docente_id, anio_escolar);
CREATE INDEX IF NOT EXISTS idx_docente_materia_asignacion_materia
  ON internal.docente_materia_asignacion (materia_id, anio_escolar);
CREATE INDEX IF NOT EXISTS idx_docente_materia_asignacion_curso
  ON internal.docente_materia_asignacion (curso_id, anio_escolar);

CREATE OR REPLACE FUNCTION internal.sync_asignacion_curso_id()
RETURNS TRIGGER AS $$
DECLARE
  v_curso_id UUID;
BEGIN
  SELECT m.curso_id INTO v_curso_id
  FROM internal.materia m
  WHERE m.id = NEW.materia_id;

  IF v_curso_id IS NULL THEN
    RAISE EXCEPTION 'Materia no encontrada para la asignacion';
  END IF;

  NEW.curso_id = v_curso_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_docente_materia_asignacion_sync_curso
  BEFORE INSERT OR UPDATE OF materia_id ON internal.docente_materia_asignacion
  FOR EACH ROW EXECUTE FUNCTION internal.sync_asignacion_curso_id();

CREATE TRIGGER trg_docente_materia_asignacion_updated_at
  BEFORE UPDATE ON internal.docente_materia_asignacion
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- Initial migration: convert legacy curso.teacher_id into subject-level assignments.
INSERT INTO internal.docente_materia_asignacion (
  docente_id,
  materia_id,
  curso_id,
  anio_escolar,
  activo
)
SELECT
  c.teacher_id,
  m.id,
  m.curso_id,
  cfg.anio_escolar_activo,
  TRUE
FROM internal.curso c
JOIN internal.materia m ON m.curso_id = c.id
JOIN internal.configuracion_academica cfg ON cfg.id = 1
WHERE c.teacher_id IS NOT NULL
ON CONFLICT (materia_id, curso_id, anio_escolar) DO NOTHING;

CREATE TABLE IF NOT EXISTS internal.docente_materia_horario (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id  UUID NOT NULL REFERENCES internal.docente_materia_asignacion(id) ON DELETE CASCADE,
  dia_semana     SMALLINT NOT NULL,
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  aula           TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_docente_materia_horario_dia CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT chk_docente_materia_horario_rango CHECK (hora_fin > hora_inicio),
  CONSTRAINT uq_docente_materia_horario_slot UNIQUE (asignacion_id, dia_semana, hora_inicio, hora_fin)
);

CREATE INDEX IF NOT EXISTS idx_docente_materia_horario_asignacion
  ON internal.docente_materia_horario (asignacion_id, dia_semana);

CREATE TRIGGER trg_docente_materia_horario_updated_at
  BEFORE UPDATE ON internal.docente_materia_horario
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

-- RLS
ALTER TABLE internal.configuracion_academica ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.docente_materia_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.docente_materia_horario ENABLE ROW LEVEL SECURITY;

CREATE POLICY configuracion_academica_select ON internal.configuracion_academica
  FOR SELECT USING (true);

CREATE POLICY configuracion_academica_modify ON internal.configuracion_academica
  FOR ALL USING (internal.is_admin())
  WITH CHECK (internal.is_admin());

CREATE POLICY docente_materia_asignacion_select ON internal.docente_materia_asignacion
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR docente_id = internal.current_user_id()
  );

CREATE POLICY docente_materia_asignacion_modify ON internal.docente_materia_asignacion
  FOR ALL USING (internal.is_admin())
  WITH CHECK (internal.is_admin());

CREATE POLICY docente_materia_horario_select ON internal.docente_materia_horario
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.docente_materia_asignacion dma
      WHERE dma.id = asignacion_id
        AND dma.docente_id = internal.current_user_id()
    )
  );

CREATE POLICY docente_materia_horario_modify ON internal.docente_materia_horario
  FOR ALL USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.docente_materia_asignacion dma
      WHERE dma.id = asignacion_id
        AND dma.docente_id = internal.current_user_id()
    )
  )
  WITH CHECK (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.docente_materia_asignacion dma
      WHERE dma.id = asignacion_id
        AND dma.docente_id = internal.current_user_id()
    )
  );

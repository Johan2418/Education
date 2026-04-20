-- 024: Recursos personales docentes + acoples a materia/seccion/trabajo

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tipo_recurso_personal'
      AND n.nspname = 'internal'
  ) THEN
    CREATE TYPE internal.tipo_recurso_personal AS ENUM (
      'presentacion',
      'documento',
      'video_url',
      'enlace',
      'html_embed',
      'texto'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS internal.recurso_personal (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_teacher_id   UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  titulo             TEXT NOT NULL,
  descripcion        TEXT,
  tipo               internal.tipo_recurso_personal NOT NULL,
  url                TEXT,
  html_contenido     TEXT,
  texto_contenido    TEXT,
  tags               TEXT[],
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recurso_personal_contenido_check CHECK (
    (tipo IN ('presentacion', 'documento', 'video_url', 'enlace') AND url IS NOT NULL AND btrim(url) <> '')
    OR (tipo = 'html_embed' AND html_contenido IS NOT NULL AND btrim(html_contenido) <> '')
    OR (tipo = 'texto' AND texto_contenido IS NOT NULL AND btrim(texto_contenido) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_recurso_personal_owner_teacher ON internal.recurso_personal (owner_teacher_id);
CREATE INDEX IF NOT EXISTS idx_recurso_personal_tipo ON internal.recurso_personal (tipo);
CREATE INDEX IF NOT EXISTS idx_recurso_personal_activo ON internal.recurso_personal (activo);
CREATE INDEX IF NOT EXISTS idx_recurso_personal_tags ON internal.recurso_personal USING GIN (tags);

DROP TRIGGER IF EXISTS trg_recurso_personal_updated_at ON internal.recurso_personal;
CREATE TRIGGER trg_recurso_personal_updated_at
  BEFORE UPDATE ON internal.recurso_personal
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

CREATE TABLE IF NOT EXISTS internal.materia_recurso_personal (
  materia_id            UUID NOT NULL REFERENCES internal.materia(id) ON DELETE CASCADE,
  recurso_personal_id   UUID NOT NULL REFERENCES internal.recurso_personal(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (materia_id, recurso_personal_id)
);

CREATE INDEX IF NOT EXISTS idx_materia_recurso_personal_recurso ON internal.materia_recurso_personal (recurso_personal_id);

CREATE TABLE IF NOT EXISTS internal.seccion_recurso_personal (
  seccion_id            UUID NOT NULL REFERENCES internal.leccion_seccion(id) ON DELETE CASCADE,
  recurso_personal_id   UUID NOT NULL REFERENCES internal.recurso_personal(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (seccion_id, recurso_personal_id)
);

CREATE INDEX IF NOT EXISTS idx_seccion_recurso_personal_recurso ON internal.seccion_recurso_personal (recurso_personal_id);

CREATE TABLE IF NOT EXISTS internal.trabajo_recurso_personal (
  trabajo_id            UUID NOT NULL REFERENCES internal.trabajo(id) ON DELETE CASCADE,
  recurso_personal_id   UUID NOT NULL REFERENCES internal.recurso_personal(id) ON DELETE CASCADE,
  created_by            UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trabajo_id, recurso_personal_id)
);

CREATE INDEX IF NOT EXISTS idx_trabajo_recurso_personal_recurso ON internal.trabajo_recurso_personal (recurso_personal_id);

ALTER TABLE internal.recurso_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.materia_recurso_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.seccion_recurso_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.trabajo_recurso_personal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurso_personal_select ON internal.recurso_personal;
CREATE POLICY recurso_personal_select ON internal.recurso_personal
  FOR SELECT USING (
    owner_teacher_id = internal.current_user_id()
    OR internal.current_user_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS recurso_personal_insert ON internal.recurso_personal;
CREATE POLICY recurso_personal_insert ON internal.recurso_personal
  FOR INSERT WITH CHECK (
    owner_teacher_id = internal.current_user_id()
    AND internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS recurso_personal_update ON internal.recurso_personal;
CREATE POLICY recurso_personal_update ON internal.recurso_personal
  FOR UPDATE USING (
    owner_teacher_id = internal.current_user_id()
    OR internal.current_user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    owner_teacher_id = internal.current_user_id()
    OR internal.current_user_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS recurso_personal_delete ON internal.recurso_personal;
CREATE POLICY recurso_personal_delete ON internal.recurso_personal
  FOR DELETE USING (
    owner_teacher_id = internal.current_user_id()
    OR internal.current_user_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS materia_recurso_personal_select ON internal.materia_recurso_personal;
CREATE POLICY materia_recurso_personal_select ON internal.materia_recurso_personal
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.recurso_personal rp
      WHERE rp.id = recurso_personal_id
        AND rp.owner_teacher_id = internal.current_user_id()
    )
  );

DROP POLICY IF EXISTS materia_recurso_personal_insert ON internal.materia_recurso_personal;
CREATE POLICY materia_recurso_personal_insert ON internal.materia_recurso_personal
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    AND (
      internal.current_user_role() IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1
        FROM internal.recurso_personal rp
        WHERE rp.id = recurso_personal_id
          AND rp.owner_teacher_id = internal.current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS materia_recurso_personal_delete ON internal.materia_recurso_personal;
CREATE POLICY materia_recurso_personal_delete ON internal.materia_recurso_personal
  FOR DELETE USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.recurso_personal rp
      WHERE rp.id = recurso_personal_id
        AND rp.owner_teacher_id = internal.current_user_id()
    )
  );

DROP POLICY IF EXISTS seccion_recurso_personal_select ON internal.seccion_recurso_personal;
CREATE POLICY seccion_recurso_personal_select ON internal.seccion_recurso_personal
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.recurso_personal rp
      WHERE rp.id = recurso_personal_id
        AND rp.owner_teacher_id = internal.current_user_id()
    )
  );

DROP POLICY IF EXISTS seccion_recurso_personal_insert ON internal.seccion_recurso_personal;
CREATE POLICY seccion_recurso_personal_insert ON internal.seccion_recurso_personal
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    AND (
      internal.current_user_role() IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1
        FROM internal.recurso_personal rp
        WHERE rp.id = recurso_personal_id
          AND rp.owner_teacher_id = internal.current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS seccion_recurso_personal_delete ON internal.seccion_recurso_personal;
CREATE POLICY seccion_recurso_personal_delete ON internal.seccion_recurso_personal
  FOR DELETE USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.recurso_personal rp
      WHERE rp.id = recurso_personal_id
        AND rp.owner_teacher_id = internal.current_user_id()
    )
  );

DROP POLICY IF EXISTS trabajo_recurso_personal_select ON internal.trabajo_recurso_personal;
CREATE POLICY trabajo_recurso_personal_select ON internal.trabajo_recurso_personal
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.recurso_personal rp
      WHERE rp.id = recurso_personal_id
        AND rp.owner_teacher_id = internal.current_user_id()
    )
  );

DROP POLICY IF EXISTS trabajo_recurso_personal_insert ON internal.trabajo_recurso_personal;
CREATE POLICY trabajo_recurso_personal_insert ON internal.trabajo_recurso_personal
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    AND (
      internal.current_user_role() IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1
        FROM internal.recurso_personal rp
        WHERE rp.id = recurso_personal_id
          AND rp.owner_teacher_id = internal.current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS trabajo_recurso_personal_delete ON internal.trabajo_recurso_personal;
CREATE POLICY trabajo_recurso_personal_delete ON internal.trabajo_recurso_personal
  FOR DELETE USING (
    internal.current_user_role() IN ('admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.recurso_personal rp
      WHERE rp.id = recurso_personal_id
        AND rp.owner_teacher_id = internal.current_user_id()
    )
  );

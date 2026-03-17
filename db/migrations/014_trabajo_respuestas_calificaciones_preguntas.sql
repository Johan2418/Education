-- 014: Respuestas y calificacion por pregunta (compatibilidad con JSON legado)

CREATE TABLE internal.trabajo_respuesta_pregunta (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id       UUID NOT NULL REFERENCES internal.trabajo_entrega(id) ON DELETE CASCADE,
  pregunta_id      UUID NOT NULL REFERENCES internal.trabajo_pregunta(id) ON DELETE CASCADE,
  respuesta_texto  TEXT,
  respuesta_opcion TEXT,
  orden            INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entrega_id, pregunta_id)
);

CREATE INDEX idx_trabajo_resp_pregunta_entrega ON internal.trabajo_respuesta_pregunta (entrega_id);
CREATE INDEX idx_trabajo_resp_pregunta_pregunta ON internal.trabajo_respuesta_pregunta (pregunta_id);

CREATE TABLE internal.trabajo_calificacion_pregunta (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calificacion_id  UUID NOT NULL REFERENCES internal.trabajo_calificacion(id) ON DELETE CASCADE,
  pregunta_id      UUID NOT NULL REFERENCES internal.trabajo_pregunta(id) ON DELETE CASCADE,
  puntaje          NUMERIC(8,2) NOT NULL DEFAULT 0,
  feedback         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calificacion_id, pregunta_id)
);

CREATE INDEX idx_trabajo_calif_pregunta_calif ON internal.trabajo_calificacion_pregunta (calificacion_id);
CREATE INDEX idx_trabajo_calif_pregunta_pregunta ON internal.trabajo_calificacion_pregunta (pregunta_id);

CREATE TRIGGER trg_trabajo_resp_pregunta_updated_at
  BEFORE UPDATE ON internal.trabajo_respuesta_pregunta
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

CREATE TRIGGER trg_trabajo_calif_pregunta_updated_at
  BEFORE UPDATE ON internal.trabajo_calificacion_pregunta
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

ALTER TABLE internal.trabajo_respuesta_pregunta ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.trabajo_calificacion_pregunta ENABLE ROW LEVEL SECURITY;

CREATE POLICY trabajo_resp_pregunta_select ON internal.trabajo_respuesta_pregunta
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM internal.trabajo_entrega te
      WHERE te.id = entrega_id
        AND (
          te.estudiante_id = internal.current_user_id()
          OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
        )
    )
  );

CREATE POLICY trabajo_resp_pregunta_insert ON internal.trabajo_respuesta_pregunta
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM internal.trabajo_entrega te
      WHERE te.id = entrega_id
        AND (
          te.estudiante_id = internal.current_user_id()
          OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
        )
    )
  );

CREATE POLICY trabajo_resp_pregunta_update ON internal.trabajo_respuesta_pregunta
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM internal.trabajo_entrega te
      WHERE te.id = entrega_id
        AND (
          te.estudiante_id = internal.current_user_id()
          OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
        )
    )
  );

CREATE POLICY trabajo_resp_pregunta_delete ON internal.trabajo_respuesta_pregunta
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM internal.trabajo_entrega te
      WHERE te.id = entrega_id
        AND (
          te.estudiante_id = internal.current_user_id()
          OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
        )
    )
  );

CREATE POLICY trabajo_calif_pregunta_select ON internal.trabajo_calificacion_pregunta
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.trabajo_calificacion tc
      JOIN internal.trabajo_entrega te ON te.id = tc.entrega_id
      WHERE tc.id = calificacion_id
        AND te.estudiante_id = internal.current_user_id()
    )
  );

CREATE POLICY trabajo_calif_pregunta_modify ON internal.trabajo_calificacion_pregunta
  FOR ALL USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  ) WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

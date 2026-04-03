-- 020: Historial auditable de calificaciones de trabajos (Sprint 2)

CREATE TABLE IF NOT EXISTS internal.trabajo_calificacion_historial (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id        UUID NOT NULL REFERENCES internal.trabajo_entrega(id) ON DELETE CASCADE,
  calificacion_id   UUID REFERENCES internal.trabajo_calificacion(id) ON DELETE SET NULL,
  actor_id          UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE RESTRICT,
  actor_role        TEXT NOT NULL,
  tipo_cambio       TEXT NOT NULL DEFAULT 'manual',
  motivo            TEXT,
  puntaje_anterior  NUMERIC(8,2),
  puntaje_nuevo     NUMERIC(8,2) NOT NULL,
  feedback_anterior TEXT,
  feedback_nuevo    TEXT,
  detalle_anterior  JSONB,
  detalle_nuevo     JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trabajo_calif_hist_tipo_check
    CHECK (tipo_cambio IN ('manual', 'manual_override', 'auto_objetiva', 'auto_heuristica')),
  CONSTRAINT trabajo_calif_hist_actor_role_check
    CHECK (actor_role IN ('teacher', 'admin', 'super_admin')),
  CONSTRAINT trabajo_calif_hist_motivo_override_check
    CHECK (
      CASE
        WHEN tipo_cambio = 'manual_override' THEN COALESCE(length(trim(motivo)), 0) > 0
        ELSE TRUE
      END
    ),
  CONSTRAINT trabajo_calif_hist_puntaje_nuevo_check
    CHECK (puntaje_nuevo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_trabajo_calif_hist_entrega
  ON internal.trabajo_calificacion_historial (entrega_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trabajo_calif_hist_calificacion
  ON internal.trabajo_calificacion_historial (calificacion_id);

ALTER TABLE internal.trabajo_calificacion_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY trabajo_calif_hist_select ON internal.trabajo_calificacion_historial
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM internal.trabajo_entrega te
      WHERE te.id = entrega_id
        AND te.estudiante_id = internal.current_user_id()
    )
  );

CREATE POLICY trabajo_calif_hist_insert ON internal.trabajo_calificacion_historial
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

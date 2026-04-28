-- 029: telemetria de vistas de libro_recurso para reportes y contexto MCP

CREATE TABLE IF NOT EXISTS internal.libro_recurso_view (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libro_recurso_id UUID NOT NULL REFERENCES internal.libro_recurso(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  pagina           INT NOT NULL CHECK (pagina > 0),
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  viewed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_libro_recurso_view_recurso
  ON internal.libro_recurso_view (libro_recurso_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_libro_recurso_view_user
  ON internal.libro_recurso_view (user_id, viewed_at DESC);

ALTER TABLE internal.libro_recurso_view ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS libro_recurso_view_select ON internal.libro_recurso_view;
CREATE POLICY libro_recurso_view_select ON internal.libro_recurso_view
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

DROP POLICY IF EXISTS libro_recurso_view_insert ON internal.libro_recurso_view;
CREATE POLICY libro_recurso_view_insert ON internal.libro_recurso_view
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
    AND (user_id IS NULL OR user_id = internal.current_user_id())
  );

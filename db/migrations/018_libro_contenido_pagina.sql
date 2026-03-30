-- 018: Persistencia de contenido por pagina para visor de recursos y contexto MCP completo

CREATE TABLE internal.libro_contenido_pagina (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libro_recurso_id UUID NOT NULL REFERENCES internal.libro_recurso(id) ON DELETE CASCADE,
  pagina           INT NOT NULL CHECK (pagina > 0),
  contenido        TEXT NOT NULL,
  imagen_base64    TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (libro_recurso_id, pagina)
);

CREATE INDEX idx_libro_contenido_pagina_recurso ON internal.libro_contenido_pagina (libro_recurso_id, pagina);
CREATE INDEX idx_libro_contenido_pagina_search ON internal.libro_contenido_pagina USING gin (to_tsvector('spanish', contenido));

CREATE TRIGGER trg_libro_contenido_pagina_updated_at
  BEFORE UPDATE ON internal.libro_contenido_pagina
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

ALTER TABLE internal.libro_contenido_pagina ENABLE ROW LEVEL SECURITY;

CREATE POLICY libro_contenido_pagina_select ON internal.libro_contenido_pagina
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

CREATE POLICY libro_contenido_pagina_insert ON internal.libro_contenido_pagina
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

CREATE POLICY libro_contenido_pagina_update ON internal.libro_contenido_pagina
  FOR UPDATE USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

CREATE POLICY libro_contenido_pagina_delete ON internal.libro_contenido_pagina
  FOR DELETE USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

-- 017: Chat contextual por libro_recurso con orquestacion MCP y telemetria basica

CREATE TYPE internal.chat_message_role AS ENUM (
  'system',
  'user',
  'assistant',
  'tool'
);

CREATE TABLE internal.libro_chat_session (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libro_recurso_id UUID NOT NULL REFERENCES internal.libro_recurso(id) ON DELETE CASCADE,
  titulo           TEXT,
  created_by       UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at  TIMESTAMPTZ
);

CREATE INDEX idx_libro_chat_session_recurso ON internal.libro_chat_session (libro_recurso_id);
CREATE INDEX idx_libro_chat_session_created_by ON internal.libro_chat_session (created_by);
CREATE INDEX idx_libro_chat_session_last_msg ON internal.libro_chat_session (last_message_at DESC NULLS LAST);

CREATE TRIGGER trg_libro_chat_session_updated_at
  BEFORE UPDATE ON internal.libro_chat_session
  FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

CREATE TABLE internal.libro_chat_message (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES internal.libro_chat_session(id) ON DELETE CASCADE,
  role             internal.chat_message_role NOT NULL,
  content          TEXT NOT NULL,
  tool_name        TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  model            TEXT,
  latency_ms       INT,
  used_fallback    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by       UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_libro_chat_message_session ON internal.libro_chat_message (session_id, created_at);
CREATE INDEX idx_libro_chat_message_role ON internal.libro_chat_message (role);

CREATE TABLE internal.libro_chat_telemetria (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES internal.libro_chat_session(id) ON DELETE CASCADE,
  libro_recurso_id UUID NOT NULL REFERENCES internal.libro_recurso(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,
  latency_ms       INT,
  used_fallback    BOOLEAN NOT NULL DEFAULT FALSE,
  error_code       TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_libro_chat_telemetria_session ON internal.libro_chat_telemetria (session_id, created_at DESC);
CREATE INDEX idx_libro_chat_telemetria_recurso ON internal.libro_chat_telemetria (libro_recurso_id, created_at DESC);
CREATE INDEX idx_libro_chat_telemetria_event ON internal.libro_chat_telemetria (event_type);

ALTER TABLE internal.libro_chat_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.libro_chat_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.libro_chat_telemetria ENABLE ROW LEVEL SECURITY;

CREATE POLICY libro_chat_session_select ON internal.libro_chat_session
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

CREATE POLICY libro_chat_session_insert ON internal.libro_chat_session
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
    AND (created_by IS NULL OR created_by = internal.current_user_id())
  );

CREATE POLICY libro_chat_session_update ON internal.libro_chat_session
  FOR UPDATE USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
  );

CREATE POLICY libro_chat_message_select ON internal.libro_chat_message
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM internal.libro_chat_session s
      WHERE s.id = session_id
        AND internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
        AND internal.can_access_libro_recurso(s.libro_recurso_id)
    )
  );

CREATE POLICY libro_chat_message_insert ON internal.libro_chat_message
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM internal.libro_chat_session s
      WHERE s.id = session_id
        AND internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
        AND internal.can_access_libro_recurso(s.libro_recurso_id)
    )
    AND (created_by IS NULL OR created_by = internal.current_user_id())
  );

CREATE POLICY libro_chat_telemetria_select ON internal.libro_chat_telemetria
  FOR SELECT USING (
    internal.current_user_role() IN ('admin', 'super_admin', 'resource_manager')
    OR (
      internal.current_user_role() = 'teacher'
      AND EXISTS (
        SELECT 1
        FROM internal.libro_chat_session s
        WHERE s.id = session_id
          AND internal.can_access_libro_recurso(s.libro_recurso_id)
      )
    )
  );

CREATE POLICY libro_chat_telemetria_insert ON internal.libro_chat_telemetria
  FOR INSERT WITH CHECK (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin', 'resource_manager')
    AND internal.can_access_libro_recurso(libro_recurso_id)
    AND (user_id IS NULL OR user_id = internal.current_user_id())
  );

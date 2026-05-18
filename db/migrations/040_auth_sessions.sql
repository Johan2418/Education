-- 040: refresh-token sessions for backend auth

CREATE TABLE IF NOT EXISTS internal.auth_session (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  remember_me        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at         TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  last_used_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_session_refresh_token_hash
  ON internal.auth_session (refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_id
  ON internal.auth_session (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_session_revoked_at
  ON internal.auth_session (revoked_at);

DROP TRIGGER IF EXISTS trg_auth_session_updated_at ON internal.auth_session;
CREATE TRIGGER trg_auth_session_updated_at
  BEFORE UPDATE ON internal.auth_session
  FOR EACH ROW
  EXECUTE FUNCTION internal.set_updated_at();

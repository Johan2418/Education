-- 010: Add verification token columns to profiles
ALTER TABLE internal.profiles
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_token
  ON internal.profiles (verification_token)
  WHERE verification_token IS NOT NULL;

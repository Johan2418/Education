-- ═══════════════════════════════════════════════════════════════
-- 002 · Extensiones y funciones JWT
-- ═══════════════════════════════════════════════════════════════

-- UUID v4 para claves primarias + bcrypt + hmac
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Búsqueda full-text mejorada
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ═══════════════════════════════════════════════════════════════
-- Implementación de sign/verify JWT (reemplaza la extensión pgjwt
-- que no viene incluida en postgres:16-alpine)
-- ═══════════════════════════════════════════════════════════════

-- Helper: base64url encode (sin padding, sin saltos de línea)
CREATE OR REPLACE FUNCTION internal.url_encode(data BYTEA)
RETURNS TEXT AS $$
  SELECT translate(
    replace(replace(encode(data, 'base64'), E'\n', ''), E'\r', ''),
    '+/=', '-_'
  );
$$ LANGUAGE sql IMMUTABLE;

-- Helper: base64url decode
CREATE OR REPLACE FUNCTION internal.url_decode(data TEXT)
RETURNS BYTEA AS $$
  WITH t AS (SELECT translate(data, '-_', '+/') AS val)
  SELECT decode(
    t.val || repeat('=', (4 - length(t.val) % 4) % 4),
    'base64'
  ) FROM t;
$$ LANGUAGE sql IMMUTABLE;

-- Algoritmo HS256 (HMAC-SHA256)
CREATE OR REPLACE FUNCTION internal.algorithm_sign(
  signables TEXT,
  secret    TEXT,
  algorithm TEXT
)
RETURNS TEXT AS $$
  WITH alg AS (
    SELECT CASE
      WHEN algorithm = 'HS256' THEN 'sha256'
      WHEN algorithm = 'HS384' THEN 'sha384'
      WHEN algorithm = 'HS512' THEN 'sha512'
      ELSE '' END AS id
  )
  SELECT internal.url_encode(
    hmac(signables, secret, alg.id)
  ) FROM alg;
$$ LANGUAGE sql IMMUTABLE;

-- sign(payload JSON, secret TEXT, algorithm TEXT DEFAULT 'HS256') → TEXT
-- Compatible con la API de pgjwt
CREATE OR REPLACE FUNCTION sign(
  payload   JSON,
  secret    TEXT,
  algorithm TEXT DEFAULT 'HS256'
)
RETURNS TEXT AS $$
  WITH
    header AS (
      SELECT internal.url_encode(
        convert_to('{"alg":"' || algorithm || '","typ":"JWT"}', 'utf8')
      ) AS data
    ),
    payload_encoded AS (
      SELECT internal.url_encode(convert_to(payload::TEXT, 'utf8')) AS data
    ),
    signables AS (
      SELECT header.data || '.' || payload_encoded.data AS data
      FROM header, payload_encoded
    )
  SELECT signables.data || '.' ||
         internal.algorithm_sign(signables.data, secret, algorithm)
  FROM signables;
$$ LANGUAGE sql IMMUTABLE;

-- verify(token TEXT, secret TEXT, algorithm TEXT DEFAULT 'HS256') → TABLE
CREATE OR REPLACE FUNCTION verify(
  token     TEXT,
  secret    TEXT,
  algorithm TEXT DEFAULT 'HS256'
)
RETURNS TABLE(header JSON, payload JSON, valid BOOLEAN) AS $$
  SELECT
    convert_from(internal.url_decode(r[1]), 'utf8')::JSON AS header,
    convert_from(internal.url_decode(r[2]), 'utf8')::JSON AS payload,
    r[3] = internal.algorithm_sign(r[1] || '.' || r[2], secret, algorithm) AS valid
  FROM regexp_split_to_array(token, '\.') r;
$$ LANGUAGE sql IMMUTABLE;

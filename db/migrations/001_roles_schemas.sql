-- ═══════════════════════════════════════════════════════════════
-- 001 · Roles y esquemas
-- Se ejecuta como superusuario (POSTGRES_USER) al crear la BD.
-- ═══════════════════════════════════════════════════════════════

-- Esquema expuesto por PostgREST (API pública)
CREATE SCHEMA IF NOT EXISTS api;

-- Esquema interno para funciones/triggers que NO se exponen
CREATE SCHEMA IF NOT EXISTS internal;

-- ─── Rol anónimo (peticiones sin JWT) ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
END
$$;

-- ─── Rol autenticado (peticiones con JWT válido) ────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- ─── Rol de login que PostgREST usa para conectarse ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'web_anon_pass';
  END IF;
END
$$;

GRANT web_anon       TO authenticator;
GRANT authenticated  TO authenticator;

-- Permisos base sobre el esquema api
GRANT USAGE ON SCHEMA api TO web_anon;
GRANT USAGE ON SCHEMA api TO authenticated;

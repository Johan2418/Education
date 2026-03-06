-- ═══════════════════════════════════════════════════════════════
-- 004 · Vistas en el esquema "api" (lo que PostgREST expone)
--
-- Cada vista es 1:1 con la tabla interna. Esto permite:
--   • Ocultar columnas sensibles (password_hash)
--   • Agregar RLS a nivel de vista
--   • Cambiar la estructura interna sin romper la API
-- ═══════════════════════════════════════════════════════════════

-- ─── profiles (sin password_hash) ───────────────────────────
CREATE OR REPLACE VIEW api.profiles AS
  SELECT id, email, role, display_name, phone,
         role_requested, is_verified, avatar_url,
         created_by, created_at, updated_at
  FROM internal.profiles;

-- ─── curso ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.curso AS
  SELECT * FROM internal.curso;

-- ─── estudiante_curso ───────────────────────────────────────
CREATE OR REPLACE VIEW api.estudiante_curso AS
  SELECT * FROM internal.estudiante_curso;

-- ─── materia ────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.materia AS
  SELECT * FROM internal.materia;

-- ─── unidad ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.unidad AS
  SELECT * FROM internal.unidad;

-- ─── tema ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.tema AS
  SELECT * FROM internal.tema;

-- ─── leccion ────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.leccion AS
  SELECT * FROM internal.leccion;

-- ─── recurso ────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.recurso AS
  SELECT * FROM internal.recurso;

-- ─── modelo_ra ──────────────────────────────────────────────
CREATE OR REPLACE VIEW api.modelo_ra AS
  SELECT * FROM internal.modelo_ra;

-- ─── leccion_seccion ────────────────────────────────────────
CREATE OR REPLACE VIEW api.leccion_seccion AS
  SELECT * FROM internal.leccion_seccion;

-- ─── prueba ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.prueba AS
  SELECT * FROM internal.prueba;

-- ─── pregunta ───────────────────────────────────────────────
CREATE OR REPLACE VIEW api.pregunta AS
  SELECT * FROM internal.pregunta;

-- ─── respuesta ──────────────────────────────────────────────
CREATE OR REPLACE VIEW api.respuesta AS
  SELECT * FROM internal.respuesta;

-- ─── progreso ───────────────────────────────────────────────
CREATE OR REPLACE VIEW api.progreso AS
  SELECT * FROM internal.progreso;

-- ─── progreso_seccion ───────────────────────────────────────
CREATE OR REPLACE VIEW api.progreso_seccion AS
  SELECT * FROM internal.progreso_seccion;

-- ─── resultado_prueba ───────────────────────────────────────
CREATE OR REPLACE VIEW api.resultado_prueba AS
  SELECT * FROM internal.resultado_prueba;

-- ─── materia_seguimiento ────────────────────────────────────
CREATE OR REPLACE VIEW api.materia_seguimiento AS
  SELECT * FROM internal.materia_seguimiento;

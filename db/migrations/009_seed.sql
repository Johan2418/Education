-- ═══════════════════════════════════════════════════════════════
-- 009 · Datos semilla
-- ═══════════════════════════════════════════════════════════════

-- ─── Super administrador inicial ────────────────────────────
INSERT INTO internal.profiles (email, password_hash, role, display_name, is_verified)
VALUES (
  'superadmin@arcanea.local',
  crypt('SuperAdmin12345!', gen_salt('bf', 10)),
  'super_admin',
  'Super Administrador',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- ─── Cursos de ejemplo ──────────────────────────────────────
INSERT INTO internal.curso (nombre, descripcion, orden) VALUES
  ('1er Año', 'Primer año de educación media', 1),
  ('2do Año', 'Segundo año de educación media', 2),
  ('3er Año', 'Tercer año de educación media',  3),
  ('4to Año', 'Cuarto año de educación media',  4),
  ('5to Año', 'Quinto año de educación media',  5)
ON CONFLICT (nombre) DO NOTHING;

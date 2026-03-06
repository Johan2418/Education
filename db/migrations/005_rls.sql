-- ═══════════════════════════════════════════════════════════════
-- 005 · Row Level Security (RLS)
-- PostgREST inyecta request.jwt.claims en current_setting,
-- lo que permite filtrar filas por usuario autenticado.
--
-- Roles de app almacenados en el claim "user_role":
--   student, teacher, resource_manager, admin, super_admin
-- ═══════════════════════════════════════════════════════════════

-- Función auxiliar: obtiene el user_id del JWT actual
CREATE OR REPLACE FUNCTION internal.current_user_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::UUID;
$$ LANGUAGE sql STABLE;

-- Función auxiliar: obtiene el rol de aplicación del JWT actual
CREATE OR REPLACE FUNCTION internal.current_user_role()
RETURNS TEXT AS $$
  SELECT current_setting('request.jwt.claims', true)::json->>'user_role';
$$ LANGUAGE sql STABLE;

-- Macro: ¿es un rol con permisos de escritura académica?
CREATE OR REPLACE FUNCTION internal.is_editor()
RETURNS BOOLEAN AS $$
  SELECT internal.current_user_role() IN ('teacher', 'admin', 'super_admin');
$$ LANGUAGE sql STABLE;

-- Macro: ¿puede subir recursos?
CREATE OR REPLACE FUNCTION internal.can_upload_resources()
RETURNS BOOLEAN AS $$
  SELECT internal.current_user_role() IN ('resource_manager', 'teacher', 'admin', 'super_admin');
$$ LANGUAGE sql STABLE;

-- Macro: ¿es administrador (admin o super_admin)?
CREATE OR REPLACE FUNCTION internal.is_admin()
RETURNS BOOLEAN AS $$
  SELECT internal.current_user_role() IN ('admin', 'super_admin');
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════════
-- RLS POR TABLA
-- ═══════════════════════════════════════════════════════════════

-- ─── profiles ───────────────────────────────────────────────
ALTER TABLE internal.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON internal.profiles
  FOR SELECT USING (true);

CREATE POLICY profiles_update_own ON internal.profiles
  FOR UPDATE USING (
    id = internal.current_user_id()
    OR internal.current_user_role() = 'super_admin'
  );

-- Solo super_admin puede crear nuevos admins (INSERT con role='admin')
CREATE POLICY profiles_insert_admin ON internal.profiles
  FOR INSERT WITH CHECK (
    internal.current_user_role() = 'super_admin'
    OR role NOT IN ('admin', 'super_admin')
  );

-- ─── curso (solo admin/super_admin gestionan) ───────────────
ALTER TABLE internal.curso ENABLE ROW LEVEL SECURITY;

CREATE POLICY curso_select ON internal.curso
  FOR SELECT USING (true);

CREATE POLICY curso_modify ON internal.curso
  FOR ALL USING (internal.is_admin());

-- ─── estudiante_curso ───────────────────────────────────────
ALTER TABLE internal.estudiante_curso ENABLE ROW LEVEL SECURITY;

CREATE POLICY est_curso_select ON internal.estudiante_curso
  FOR SELECT USING (
    estudiante_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY est_curso_modify ON internal.estudiante_curso
  FOR ALL USING (internal.is_admin());

-- ─── progreso ───────────────────────────────────────────────
ALTER TABLE internal.progreso ENABLE ROW LEVEL SECURITY;

CREATE POLICY progreso_select ON internal.progreso
  FOR SELECT USING (
    usuario_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY progreso_insert ON internal.progreso
  FOR INSERT WITH CHECK (usuario_id = internal.current_user_id());

CREATE POLICY progreso_update ON internal.progreso
  FOR UPDATE USING (usuario_id = internal.current_user_id());

-- ─── progreso_seccion ───────────────────────────────────────
ALTER TABLE internal.progreso_seccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY progreso_seccion_select ON internal.progreso_seccion
  FOR SELECT USING (
    user_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY progreso_seccion_insert ON internal.progreso_seccion
  FOR INSERT WITH CHECK (user_id = internal.current_user_id());

CREATE POLICY progreso_seccion_update ON internal.progreso_seccion
  FOR UPDATE USING (user_id = internal.current_user_id());

-- ─── resultado_prueba ───────────────────────────────────────
ALTER TABLE internal.resultado_prueba ENABLE ROW LEVEL SECURITY;

CREATE POLICY resultado_select ON internal.resultado_prueba
  FOR SELECT USING (
    usuario_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY resultado_insert ON internal.resultado_prueba
  FOR INSERT WITH CHECK (usuario_id = internal.current_user_id());

-- ─── materia_seguimiento ────────────────────────────────────
ALTER TABLE internal.materia_seguimiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY seguimiento_select ON internal.materia_seguimiento
  FOR SELECT USING (
    usuario_id = internal.current_user_id()
    OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
  );

CREATE POLICY seguimiento_insert ON internal.materia_seguimiento
  FOR INSERT WITH CHECK (usuario_id = internal.current_user_id());

CREATE POLICY seguimiento_delete ON internal.materia_seguimiento
  FOR DELETE USING (usuario_id = internal.current_user_id());

-- ─── Jerarquía académica: lectura pública, escritura editor ─
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'materia', 'unidad', 'tema', 'leccion',
    'prueba', 'pregunta', 'respuesta',
    'leccion_seccion'
  ]
  LOOP
    EXECUTE format('ALTER TABLE internal.%I ENABLE ROW LEVEL SECURITY;', tbl);

    EXECUTE format(
      'CREATE POLICY %I_select ON internal.%I FOR SELECT USING (true);',
      tbl, tbl
    );

    EXECUTE format(
      'CREATE POLICY %I_modify ON internal.%I
         FOR ALL USING (internal.is_editor());',
      tbl, tbl
    );
  END LOOP;
END
$$;

-- ─── Recursos compartidos: lectura pública, escritura por roles con permiso ─
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['recurso', 'modelo_ra']
  LOOP
    EXECUTE format('ALTER TABLE internal.%I ENABLE ROW LEVEL SECURITY;', tbl);

    EXECUTE format(
      'CREATE POLICY %I_select ON internal.%I FOR SELECT USING (true);',
      tbl, tbl
    );

    -- resource_manager, teacher, admin y super_admin pueden crear/editar
    EXECUTE format(
      'CREATE POLICY %I_modify ON internal.%I
         FOR ALL USING (internal.can_upload_resources());',
      tbl, tbl
    );
  END LOOP;
END
$$;

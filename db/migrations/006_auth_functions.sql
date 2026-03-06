-- ═══════════════════════════════════════════════════════════════
-- 006 · Funciones de autenticación expuestas vía PostgREST
-- IMPORTANTE: pgjwt debe estar instalado (ver 002_extensions.sql)
--
-- Roles permitidos en registro público:
--   student (default), teacher, resource_manager
-- Los roles admin y super_admin solo los asigna un super_admin.
-- ═══════════════════════════════════════════════════════════════

-- Tipo devuelto por login/register
CREATE TYPE api.jwt_token AS (
  token TEXT
);

-- ─── Registro (público) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION api.register(
  p_email          TEXT,
  p_password       TEXT,
  p_display_name   TEXT DEFAULT NULL,
  p_phone          TEXT DEFAULT NULL,
  p_role_requested TEXT DEFAULT NULL
)
RETURNS api.jwt_token AS $$
DECLARE
  v_user   internal.profiles;
  v_secret TEXT;
  v_token  TEXT;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'El email es obligatorio';
  END IF;
  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
  END IF;

  INSERT INTO internal.profiles (email, password_hash, display_name, phone, role_requested)
  VALUES (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf', 10)),
    p_display_name,
    p_phone,
    CASE
      WHEN p_role_requested IN ('teacher', 'resource_manager')
        THEN p_role_requested::internal.user_role
      ELSE NULL
    END
  )
  RETURNING * INTO v_user;

  v_secret := current_setting('app.jwt_secret');
  v_token  := sign(
    json_build_object(
      'sub',       v_user.id,
      'role',      'authenticated',
      'user_role', v_user.role::TEXT,
      'email',     v_user.email,
      'exp',       extract(epoch FROM now() + interval '7 days')::INTEGER
    )::json,
    v_secret
  );

  RETURN ROW(v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Login ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.login(
  p_email    TEXT,
  p_password TEXT
)
RETURNS api.jwt_token AS $$
DECLARE
  v_user   internal.profiles;
  v_secret TEXT;
  v_token  TEXT;
BEGIN
  SELECT * INTO v_user
  FROM internal.profiles
  WHERE email = lower(trim(p_email));

  IF v_user IS NULL OR v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RAISE EXCEPTION 'Credenciales inválidas';
  END IF;

  UPDATE internal.profiles SET updated_at = now() WHERE id = v_user.id;

  v_secret := current_setting('app.jwt_secret');
  v_token  := sign(
    json_build_object(
      'sub',       v_user.id,
      'role',      'authenticated',
      'user_role', v_user.role::TEXT,
      'email',     v_user.email,
      'exp',       extract(epoch FROM now() + interval '7 days')::INTEGER
    )::json,
    v_secret
  );

  RETURN ROW(v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Perfil del usuario actual ──────────────────────────────
CREATE OR REPLACE FUNCTION api.me()
RETURNS api.profiles AS $$
  SELECT * FROM api.profiles
  WHERE id = internal.current_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Crear admin (solo super_admin) ─────────────────────────
CREATE OR REPLACE FUNCTION api.create_admin(
  p_email        TEXT,
  p_password     TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS api.profiles AS $$
DECLARE
  v_caller_role TEXT;
  v_new_user    internal.profiles;
BEGIN
  v_caller_role := internal.current_user_role();
  IF v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Solo un super_admin puede crear administradores';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
  END IF;

  INSERT INTO internal.profiles (email, password_hash, role, display_name, is_verified, created_by)
  VALUES (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf', 10)),
    'admin',
    p_display_name,
    TRUE,
    internal.current_user_id()
  )
  RETURNING * INTO v_new_user;

  RETURN (SELECT row(p.*)::api.profiles FROM api.profiles p WHERE p.id = v_new_user.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Cambiar rol de usuario (solo admin/super_admin) ────────
CREATE OR REPLACE FUNCTION api.change_user_role(
  p_user_id  UUID,
  p_new_role TEXT
)
RETURNS api.profiles AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  v_caller_role := internal.current_user_role();

  -- Solo admin y super_admin pueden cambiar roles
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'No tienes permisos para cambiar roles';
  END IF;

  -- Solo super_admin puede asignar roles admin o super_admin
  IF p_new_role IN ('admin', 'super_admin') AND v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Solo un super_admin puede asignar el rol de administrador';
  END IF;

  -- Validar que el rol existe
  IF p_new_role NOT IN ('student', 'teacher', 'resource_manager', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Rol inválido: %', p_new_role;
  END IF;

  UPDATE internal.profiles
  SET role = p_new_role::internal.user_role,
      role_requested = NULL
  WHERE id = p_user_id;

  RETURN (SELECT row(p.*)::api.profiles FROM api.profiles p WHERE p.id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 007 · Permisos sobre vistas y funciones del esquema "api"
-- ═══════════════════════════════════════════════════════════════

-- ─── Funciones públicas (login, register) ───────────────────
GRANT EXECUTE ON FUNCTION api.login(TEXT, TEXT)                       TO web_anon;
GRANT EXECUTE ON FUNCTION api.register(TEXT, TEXT, TEXT, TEXT, TEXT)   TO web_anon;

-- ─── Funciones autenticadas ─────────────────────────────────
GRANT EXECUTE ON FUNCTION api.me()                                    TO authenticated;
GRANT EXECUTE ON FUNCTION api.create_admin(TEXT, TEXT, TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION api.change_user_role(UUID, TEXT)            TO authenticated;

-- ─── Vistas: lectura para anónimos ──────────────────────────
GRANT SELECT ON api.curso             TO web_anon;
GRANT SELECT ON api.materia           TO web_anon;
GRANT SELECT ON api.unidad            TO web_anon;
GRANT SELECT ON api.tema              TO web_anon;
GRANT SELECT ON api.leccion           TO web_anon;
GRANT SELECT ON api.leccion_seccion   TO web_anon;
GRANT SELECT ON api.recurso           TO web_anon;
GRANT SELECT ON api.modelo_ra         TO web_anon;
GRANT SELECT ON api.prueba            TO web_anon;
GRANT SELECT ON api.pregunta          TO web_anon;
GRANT SELECT ON api.respuesta         TO web_anon;
GRANT SELECT ON api.profiles          TO web_anon;

-- ─── Vistas: CRUD para autenticados ─────────────────────────
-- Jerarquía académica (RLS controla quién puede escribir)
GRANT SELECT, INSERT, UPDATE, DELETE ON api.curso             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.estudiante_curso  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.materia           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.unidad            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.tema              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.leccion           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.leccion_seccion   TO authenticated;

-- Pruebas y evaluaciones
GRANT SELECT, INSERT, UPDATE, DELETE ON api.prueba            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.pregunta          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.respuesta         TO authenticated;

-- Recursos compartidos
GRANT SELECT, INSERT, UPDATE, DELETE ON api.recurso           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.modelo_ra         TO authenticated;

-- Perfiles
GRANT SELECT, INSERT, UPDATE         ON api.profiles          TO authenticated;

-- Progreso y resultados
GRANT SELECT, INSERT, UPDATE         ON api.progreso              TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON api.progreso_seccion      TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON api.resultado_prueba      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON api.materia_seguimiento   TO authenticated;

-- ─── Secuencias (necesarias para INSERT vía vistas) ─────────
GRANT USAGE ON ALL SEQUENCES IN SCHEMA internal TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA api      TO authenticated;

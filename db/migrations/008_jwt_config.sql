-- ═══════════════════════════════════════════════════════════════
-- 008 · Configuración del JWT secret a nivel de base de datos
-- PostgREST lo pasa como parámetro, pero las funciones PL/pgSQL
-- necesitan acceder a él vía current_setting('app.jwt_secret').
-- ═══════════════════════════════════════════════════════════════

-- El valor real se establece en la conexión de PostgREST.
-- Aquí solo definimos el valor por defecto para pruebas locales.
-- Usamos current_database() para no depender del nombre hardcodeado.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET "app.jwt_secret" TO %L',
    current_database(),
    'nrIqtHlnp9PaFmpuIEEnDcDig/fDq7Z2dac7OZQ1730='
  );
END $$;

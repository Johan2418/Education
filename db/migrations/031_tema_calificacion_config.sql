-- 031: Configuracion de calificacion por tema

ALTER TABLE internal.tema
  ADD COLUMN IF NOT EXISTS usar_solo_calificacion_leccion BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS peso_calificacion_leccion NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS peso_calificacion_contenido NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS puntaje_minimo_aprobacion NUMERIC(5,2) NOT NULL DEFAULT 60.00;

UPDATE internal.tema
SET
  usar_solo_calificacion_leccion = COALESCE(usar_solo_calificacion_leccion, TRUE),
  peso_calificacion_leccion = COALESCE(peso_calificacion_leccion, 100.00),
  peso_calificacion_contenido = COALESCE(peso_calificacion_contenido, 0.00),
  puntaje_minimo_aprobacion = COALESCE(puntaje_minimo_aprobacion, 60.00);

ALTER TABLE internal.tema
  DROP CONSTRAINT IF EXISTS tema_pesos_calificacion_rango_check;

ALTER TABLE internal.tema
  ADD CONSTRAINT tema_pesos_calificacion_rango_check CHECK (
    peso_calificacion_leccion >= 0 AND peso_calificacion_leccion <= 100
    AND peso_calificacion_contenido >= 0 AND peso_calificacion_contenido <= 100
  );

ALTER TABLE internal.tema
  DROP CONSTRAINT IF EXISTS tema_puntaje_minimo_aprobacion_check;

ALTER TABLE internal.tema
  ADD CONSTRAINT tema_puntaje_minimo_aprobacion_check CHECK (
    puntaje_minimo_aprobacion >= 0 AND puntaje_minimo_aprobacion <= 100
  );

-- 021: Pesos de calificacion por recurso (Sprint 3)

ALTER TABLE internal.prueba
  ADD COLUMN IF NOT EXISTS peso_calificacion NUMERIC(8,4) NOT NULL DEFAULT 1.0000;

ALTER TABLE internal.prueba
  DROP CONSTRAINT IF EXISTS prueba_peso_calificacion_check;

ALTER TABLE internal.prueba
  ADD CONSTRAINT prueba_peso_calificacion_check
  CHECK (peso_calificacion >= 0);

ALTER TABLE internal.trabajo
  ADD COLUMN IF NOT EXISTS peso_calificacion NUMERIC(8,4) NOT NULL DEFAULT 1.0000;

ALTER TABLE internal.trabajo
  DROP CONSTRAINT IF EXISTS trabajo_peso_calificacion_check;

ALTER TABLE internal.trabajo
  ADD CONSTRAINT trabajo_peso_calificacion_check
  CHECK (peso_calificacion >= 0);

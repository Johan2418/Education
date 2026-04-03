-- 019: Base de calificaciones unificadas (Sprint 1)

ALTER TABLE internal.leccion_seccion
  ADD COLUMN IF NOT EXISTS nota_maxima NUMERIC(8,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS peso_calificacion NUMERIC(8,4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS calificable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE internal.leccion_seccion
  DROP CONSTRAINT IF EXISTS leccion_seccion_nota_maxima_check;

ALTER TABLE internal.leccion_seccion
  ADD CONSTRAINT leccion_seccion_nota_maxima_check
  CHECK (nota_maxima > 0);

ALTER TABLE internal.leccion_seccion
  DROP CONSTRAINT IF EXISTS leccion_seccion_peso_calificacion_check;

ALTER TABLE internal.leccion_seccion
  ADD CONSTRAINT leccion_seccion_peso_calificacion_check
  CHECK (peso_calificacion >= 0);

UPDATE internal.leccion_seccion
SET calificable = TRUE
WHERE tipo = 'prueba'::internal.tipo_seccion;

ALTER TABLE internal.prueba
  ADD COLUMN IF NOT EXISTS nota_maxima NUMERIC(8,2) NOT NULL DEFAULT 10.00;

ALTER TABLE internal.prueba
  DROP CONSTRAINT IF EXISTS prueba_nota_maxima_check;

ALTER TABLE internal.prueba
  ADD CONSTRAINT prueba_nota_maxima_check
  CHECK (nota_maxima > 0);

ALTER TABLE internal.trabajo
  ADD COLUMN IF NOT EXISTS nota_maxima NUMERIC(8,2) NOT NULL DEFAULT 10.00;

ALTER TABLE internal.trabajo
  DROP CONSTRAINT IF EXISTS trabajo_nota_maxima_check;

ALTER TABLE internal.trabajo
  ADD CONSTRAINT trabajo_nota_maxima_check
  CHECK (nota_maxima > 0);

ALTER TABLE internal.pregunta
  ADD COLUMN IF NOT EXISTS puntaje_maximo NUMERIC(8,2) NOT NULL DEFAULT 1.00;

ALTER TABLE internal.pregunta
  DROP CONSTRAINT IF EXISTS pregunta_puntaje_maximo_check;

ALTER TABLE internal.pregunta
  ADD CONSTRAINT pregunta_puntaje_maximo_check
  CHECK (puntaje_maximo > 0);

ALTER TABLE internal.trabajo_pregunta
  ADD COLUMN IF NOT EXISTS puntaje_maximo NUMERIC(8,2) NOT NULL DEFAULT 1.00;

ALTER TABLE internal.trabajo_pregunta
  DROP CONSTRAINT IF EXISTS trabajo_pregunta_puntaje_maximo_check;

ALTER TABLE internal.trabajo_pregunta
  ADD CONSTRAINT trabajo_pregunta_puntaje_maximo_check
  CHECK (puntaje_maximo > 0);
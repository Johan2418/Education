-- 015: Metadatos de ilustracion PDF para preguntas de trabajo

ALTER TABLE internal.trabajo_pregunta
  ADD COLUMN IF NOT EXISTS imagen_base64 TEXT,
  ADD COLUMN IF NOT EXISTS imagen_fuente TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_esperada_tipo TEXT,
  ADD COLUMN IF NOT EXISTS placeholder TEXT;

ALTER TABLE internal.trabajo_pregunta
  DROP CONSTRAINT IF EXISTS trabajo_pregunta_respuesta_esperada_tipo_check;

ALTER TABLE internal.trabajo_pregunta
  ADD CONSTRAINT trabajo_pregunta_respuesta_esperada_tipo_check
  CHECK (
    respuesta_esperada_tipo IS NULL
    OR respuesta_esperada_tipo IN ('abierta', 'opciones')
  );

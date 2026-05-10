-- 031: Trabajos Enhancements - Assignment System Improvements

-- ─── Tipos de trabajo ──────────────────────────────────────────────────
CREATE TYPE internal.tipo_trabajo AS ENUM ('preguntas', 'archivo', 'mixto');

-- ─── Enhance trabajo table ────────────────────────────────────────
ALTER TABLE internal.trabajo 
ADD COLUMN tipo_trabajo internal.tipo_trabajo NOT NULL DEFAULT 'preguntas',
ADD COLUMN permite_archivo BOOLEAN DEFAULT false,
ADD COLUMN calificacion_automatica BOOLEAN DEFAULT false,
ADD COLUMN peso_calificacion DECIMAL(5,2) DEFAULT 1.0,
ADD COLUMN configuracion_calificacion JSONB DEFAULT '{}';

-- ─── Enhance trabajo_pregunta table ──────────────────────────────────
ALTER TABLE internal.trabajo_pregunta 
ADD COLUMN respuesta_correcta_validada BOOLEAN DEFAULT false,
ADD COLUMN feedback_automatico TEXT,
ADD COLUMN puntaje_maximo DECIMAL(5,2) DEFAULT 10.0,
ADD COLUMN obligatoria BOOLEAN DEFAULT true;

-- Update existing questions to have default max scores
UPDATE internal.trabajo_pregunta 
SET puntaje_maximo = 10.0 
WHERE puntaje_maximo IS NULL;

-- ─── Indexes for performance ───────────────────────────────────────
CREATE INDEX idx_trabajo_tipo ON internal.trabajo (tipo_trabajo);
CREATE INDEX idx_trabajo_calificacion_automatica ON internal.trabajo (calificacion_automatica);
CREATE INDEX idx_trabajo_pregunta_obligatoria ON internal.trabajo_pregunta (obligatoria);

-- ─── Function to validate trabajo configuration ───────────────────────
CREATE OR REPLACE FUNCTION internal.validar_configuracion_trabajo(trabajo_uuid UUID)
RETURNS TABLE(
  valid BOOLEAN,
  errors TEXT[]
) LANGUAGE plpgsql AS $$
DECLARE
  trabajo_record RECORD;
  pregunta_count INTEGER;
  preguntas_validas INTEGER;
  error_list TEXT[] := '{}';
BEGIN
  -- Get trabajo data
  SELECT * INTO trabajo_record 
  FROM internal.trabajo 
  WHERE id = trabajo_uuid;
  
  IF NOT FOUND THEN
    error_list := array_append(error_list, 'Trabajo no encontrado');
    RETURN QUERY SELECT false, error_list;
    RETURN;
  END IF;
  
  -- Validate based on type
  IF trabajo_record.tipo_trabajo = 'preguntas' THEN
    -- Count questions
    SELECT COUNT(*) INTO pregunta_count
    FROM internal.trabajo_pregunta
    WHERE trabajo_id = trabajo_uuid;
    
    IF pregunta_count = 0 THEN
      error_list := array_append(error_list, 'Los trabajos de tipo preguntas deben tener al menos una pregunta');
    END IF;
    
    -- Count valid questions for auto-grading
    IF trabajo_record.calificacion_automatica THEN
      SELECT COUNT(*) INTO preguntas_validas
      FROM internal.trabajo_pregunta
      WHERE trabajo_id = trabajo_uuid 
        AND tipo IN ('opcion_multiple', 'verdadero_falso')
        AND respuesta_correcta IS NOT NULL
        AND respuesta_correcta != '';
        
      IF preguntas_validas = 0 THEN
        error_list := array_append(error_list, 'Para calificación automática debe haber preguntas con respuesta correcta configurada');
      END IF;
    END IF;
    
  ELSIF trabajo_record.tipo_trabajo = 'archivo' THEN
    -- File uploads should allow files
    IF NOT trabajo_record.permite_archivo THEN
      error_list := array_append(error_list, 'Los trabajos de tipo archivo deben permitir subida de archivos');
    END IF;
    
  ELSIF trabajo_record.tipo_trabajo = 'mixto' THEN
    -- Mixed type should have both questions and file upload enabled
    SELECT COUNT(*) INTO pregunta_count
    FROM internal.trabajo_pregunta
    WHERE trabajo_id = trabajo_uuid;
    
    IF pregunta_count = 0 THEN
      error_list := array_append(error_list, 'Los trabajos de tipo mixto deben tener preguntas configuradas');
    END IF;
    
    IF NOT trabajo_record.permite_archivo THEN
      error_list := array_append(error_list, 'Los trabajos de tipo mixto deben permitir subida de archivos');
    END IF;
  END IF;
  
  -- Validate due date is in future for published works
  IF trabajo_record.estado = 'publicado' 
     AND trabajo_record.fecha_vencimiento IS NOT NULL
     AND trabajo_record.fecha_vencimiento < NOW() THEN
    error_list := array_append(error_list, 'La fecha de vencimiento no puede estar en el pasado para trabajos publicados');
  END IF;
  
  RETURN QUERY SELECT (array_length(error_list, 1) IS NULL), error_list;
END;
$$;

-- ─── Function to auto-close expired trabajos ───────────────────────────
CREATE OR REPLACE FUNCTION internal.cerrar_trabajos_vencidos()
RETURNS INTEGER AS $$
DECLARE
  closed_count INTEGER := 0;
BEGIN
  UPDATE internal.trabajo 
  SET estado = 'cerrado', updated_at = NOW()
  WHERE estado = 'publicado' 
    AND fecha_vencimiento IS NOT NULL 
    AND fecha_vencimiento <= NOW()
    AND estado != 'cerrado';
    
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$ LANGUAGE plpgsql;

-- ─── Trigger to auto-validate on publish ───────────────────────────────
CREATE OR REPLACE FUNCTION internal.validar_trabajo_al_publicar()
RETURNS TRIGGER AS $$
DECLARE
  validation_result RECORD;
BEGIN
  IF NEW.estado = 'publicado' AND OLD.estado != 'publicado' THEN
    SELECT * INTO validation_result 
    FROM internal.validar_configuracion_trabajo(NEW.id);
    
    IF NOT validation_result.valid THEN
      RAISE EXCEPTION 'No se puede publicar el trabajo: %', array_to_string(validation_result.errors, ', ');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trabajo_validate_on_publish
  BEFORE UPDATE ON internal.trabajo
  FOR EACH ROW EXECUTE FUNCTION internal.validar_trabajo_al_publicar();

-- ─── Update RLS policies for new fields ─────────────────────────────────
-- No changes needed as existing policies cover all fields

-- ─── Function to get trabajo statistics ─────────────────────────────────
CREATE OR REPLACE FUNCTION internal.get_trabajo_estadisticas(trabajo_uuid UUID)
RETURNS TABLE(
  total_entregas INTEGER,
  entregas_pendientes INTEGER,
  entregas_revisadas INTEGER,
  entregas_calificadas INTEGER,
  promedio_calificacion DECIMAL(5,2),
  ultima_entrega TIMESTAMPTZ
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(te.id) as total_entregas,
    COUNT(CASE WHEN te.estado = 'enviada' THEN 1 END) as entregas_pendientes,
    COUNT(CASE WHEN te.estado = 'revisada' THEN 1 END) as entregas_revisadas,
    COUNT(CASE WHEN te.estado = 'calificada' THEN 1 END) as entregas_calificadas,
    COALESCE(AVG(tc.puntaje), 0) as promedio_calificacion,
    MAX(te.submitted_at) as ultima_entrega
  FROM internal.trabajo_entrega te
  LEFT JOIN internal.trabajo_calificacion tc ON te.id = tc.entrega_id
  WHERE te.trabajo_id = trabajo_uuid;
END;
$$;

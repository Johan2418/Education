-- 032 · Agregar campo nivel a lección para distinguir contenido de tema de evaluaciones finales
ALTER TABLE internal.leccion
ADD COLUMN nivel TEXT;

-- Normalizar lecciones existentes que contienen recursos o actividades interactiva como contenido de tema.
UPDATE internal.leccion l
SET nivel = 'tema_contenido'
WHERE EXISTS (
  SELECT 1
  FROM internal.leccion_seccion s
  WHERE s.leccion_id = l.id
    AND s.tipo IN ('recurso', 'modelo', 'actividad_interactiva')
);

-- Cleanup script to remove all trabajos and recursos for fresh testing
-- This script removes all work-related and resource data to test the new implementation with a clean database

-- Step 1: Drop foreign key constraints temporarily to allow deletion
ALTER TABLE internal.trabajo_pregunta DROP CONSTRAINT IF EXISTS trabajo_pregunta_trabajo_id_fkey CASCADE;
ALTER TABLE internal.trabajo_libro_recurso DROP CONSTRAINT IF EXISTS trabajo_libro_recurso_trabajo_id_fkey CASCADE;
ALTER TABLE internal.trabajo_libro_recurso DROP CONSTRAINT IF EXISTS trabajo_libro_recurso_libro_recurso_id_fkey CASCADE;
ALTER TABLE internal.libro_extraccion DROP CONSTRAINT IF EXISTS libro_extraccion_trabajo_id_fkey CASCADE;
ALTER TABLE internal.libro_extraccion DROP CONSTRAINT IF EXISTS libro_extraccion_libro_recurso_id_fkey CASCADE;
ALTER TABLE internal.trabajo_calificacion_pregunta DROP CONSTRAINT IF EXISTS trabajo_calificacion_pregunta_trabajo_pregunta_id_fkey CASCADE;
ALTER TABLE internal.trabajo_respuesta_pregunta DROP CONSTRAINT IF EXISTS trabajo_respuesta_pregunta_trabajo_pregunta_id_fkey CASCADE;
ALTER TABLE internal.trabajo_entrega DROP CONSTRAINT IF EXISTS trabajo_entrega_trabajo_id_fkey CASCADE;
ALTER TABLE internal.trabajo_calificacion DROP CONSTRAINT IF EXISTS trabajo_calificacion_trabajo_id_fkey CASCADE;
ALTER TABLE internal.libro_chat_session DROP CONSTRAINT IF EXISTS libro_chat_session_libro_recurso_id_fkey CASCADE;
ALTER TABLE internal.libro_chat_message DROP CONSTRAINT IF EXISTS libro_chat_message_sesion_id_fkey CASCADE;

-- Step 2: Clear work-related data in correct order (respecting remaining FK constraints)
DELETE FROM internal.libro_chat_message;
DELETE FROM internal.libro_chat_session;
DELETE FROM internal.trabajo_respuesta_pregunta;
DELETE FROM internal.trabajo_calificacion_pregunta;
DELETE FROM internal.trabajo_calificacion;
DELETE FROM internal.trabajo_entrega;
DELETE FROM internal.trabajo_pregunta;
DELETE FROM internal.libro_extraccion;
DELETE FROM internal.trabajo_libro_recurso;
DELETE FROM internal.trabajo;
DELETE FROM internal.libro_recurso;

-- Step 3: Re-enable foreign key constraints
ALTER TABLE internal.trabajo_pregunta ADD CONSTRAINT trabajo_pregunta_trabajo_id_fkey 
  FOREIGN KEY (trabajo_id) REFERENCES internal.trabajo(id) ON DELETE CASCADE;
  
ALTER TABLE internal.trabajo_libro_recurso ADD CONSTRAINT trabajo_libro_recurso_trabajo_id_fkey 
  FOREIGN KEY (trabajo_id) REFERENCES internal.trabajo(id) ON DELETE CASCADE;
  
ALTER TABLE internal.trabajo_libro_recurso ADD CONSTRAINT trabajo_libro_recurso_libro_recurso_id_fkey 
  FOREIGN KEY (libro_recurso_id) REFERENCES internal.libro_recurso(id) ON DELETE CASCADE;
  
ALTER TABLE internal.libro_extraccion ADD CONSTRAINT libro_extraccion_trabajo_id_fkey 
  FOREIGN KEY (trabajo_id) REFERENCES internal.trabajo(id) ON DELETE CASCADE;
  
ALTER TABLE internal.libro_extraccion ADD CONSTRAINT libro_extraccion_libro_recurso_id_fkey 
  FOREIGN KEY (libro_recurso_id) REFERENCES internal.libro_recurso(id) ON DELETE SET NULL;
  
ALTER TABLE internal.trabajo_calificacion_pregunta ADD CONSTRAINT trabajo_calificacion_pregunta_trabajo_pregunta_id_fkey
  FOREIGN KEY (trabajo_pregunta_id) REFERENCES internal.trabajo_pregunta(id) ON DELETE CASCADE;
  
ALTER TABLE internal.trabajo_respuesta_pregunta ADD CONSTRAINT trabajo_respuesta_pregunta_trabajo_pregunta_id_fkey
  FOREIGN KEY (trabajo_pregunta_id) REFERENCES internal.trabajo_pregunta(id) ON DELETE CASCADE;
  
ALTER TABLE internal.trabajo_entrega ADD CONSTRAINT trabajo_entrega_trabajo_id_fkey
  FOREIGN KEY (trabajo_id) REFERENCES internal.trabajo(id) ON DELETE CASCADE;
  
ALTER TABLE internal.trabajo_calificacion ADD CONSTRAINT trabajo_calificacion_trabajo_id_fkey
  FOREIGN KEY (trabajo_id) REFERENCES internal.trabajo(id) ON DELETE CASCADE;
  
ALTER TABLE internal.libro_chat_session ADD CONSTRAINT libro_chat_session_libro_recurso_id_fkey
  FOREIGN KEY (libro_recurso_id) REFERENCES internal.libro_recurso(id) ON DELETE CASCADE;
  
ALTER TABLE internal.libro_chat_message ADD CONSTRAINT libro_chat_message_sesion_id_fkey
  FOREIGN KEY (sesion_id) REFERENCES internal.libro_chat_session(id) ON DELETE CASCADE;

-- Step 4: Verify cleanup
SELECT 'trabajo' as table_name, COUNT(*) as count FROM internal.trabajo
UNION ALL
SELECT 'trabajo_pregunta', COUNT(*) FROM internal.trabajo_pregunta
UNION ALL
SELECT 'libro_recurso', COUNT(*) FROM internal.libro_recurso
UNION ALL
SELECT 'libro_extraccion', COUNT(*) FROM internal.libro_extraccion
UNION ALL
SELECT 'trabajo_libro_recurso', COUNT(*) FROM internal.trabajo_libro_recurso
UNION ALL
SELECT 'libro_chat_session', COUNT(*) FROM internal.libro_chat_session
UNION ALL
SELECT 'libro_chat_message', COUNT(*) FROM internal.libro_chat_message
ORDER BY table_name;

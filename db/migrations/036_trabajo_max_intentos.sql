-- 036: Add max_intentos to trabajo table and intentos_usados to trabajo_entrega table
-- This allows teachers to define the number of submission attempts (intentos) for assignments

-- Add max_intentos column to trabajo table
ALTER TABLE internal.trabajo 
ADD COLUMN max_intentos INTEGER;

-- Add comment to document the purpose
COMMENT ON COLUMN internal.trabajo.max_intentos IS 'Número máximo de intentos de entrega permitidos. Si es NULL, no hay límite de intentos.';

-- Add intentos_usados column to trabajo_entrega table
ALTER TABLE internal.trabajo_entrega 
ADD COLUMN intentos_usados INTEGER DEFAULT 1;

-- Add comment to document the purpose
COMMENT ON COLUMN internal.trabajo_entrega.intentos_usados IS 'Número de intentos de entrega realizados por el estudiante. Se incrementa en cada nueva entrega.';

-- Update existing records to set default intentos_usados
UPDATE internal.trabajo_entrega 
SET intentos_usados = 1 
WHERE intentos_usados IS NULL;

-- 035: Add permite_entrega_tardia to trabajo table
-- This allows teachers to configure whether late submissions are allowed after the deadline

-- Add the permite_entrega_tardia column to trabajo table
ALTER TABLE internal.trabajo 
ADD COLUMN permite_entrega_tardia BOOLEAN DEFAULT false;

-- Add comment to document the purpose
COMMENT ON COLUMN internal.trabajo.permite_entrega_tardia IS 'Permite a los estudiantes enviar entregas después de la fecha de vencimiento. Por defecto false (no permite entregas tardías).';

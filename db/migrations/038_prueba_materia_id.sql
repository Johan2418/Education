-- 038: Examenes ligados a materia (sin leccion obligatoria)
ALTER TABLE internal.prueba
  ADD COLUMN IF NOT EXISTS materia_id UUID REFERENCES internal.materia(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_prueba_materia ON internal.prueba (materia_id);

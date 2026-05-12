-- 037: Examenes programables, visibilidad de resultados y calificacion docente

ALTER TABLE internal.prueba
  ADD COLUMN IF NOT EXISTS descripcion TEXT,
  ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS fecha_publicacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_activacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mostrar_resultado_inmediato BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS requiere_revision_docente BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_prueba_fecha_publicacion ON internal.prueba (fecha_publicacion);
CREATE INDEX IF NOT EXISTS idx_prueba_fecha_activacion ON internal.prueba (fecha_activacion);

ALTER TABLE internal.resultado_prueba
  ADD COLUMN IF NOT EXISTS calificado_por_docente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calificado_by UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calificado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_docente TEXT,
  ADD COLUMN IF NOT EXISTS mostrar_puntaje_estudiante BOOLEAN NOT NULL DEFAULT TRUE;


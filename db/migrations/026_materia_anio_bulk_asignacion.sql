-- 026: Materias por año escolar

ALTER TABLE internal.materia
  ADD COLUMN IF NOT EXISTS anio_escolar TEXT;

UPDATE internal.materia
SET anio_escolar = COALESCE(
  (
    SELECT c.anio_escolar_activo
    FROM internal.configuracion_academica c
    WHERE c.id = 1
  ),
  (EXTRACT(YEAR FROM CURRENT_DATE)::INT)::TEXT || '-' || ((EXTRACT(YEAR FROM CURRENT_DATE)::INT) + 1)::TEXT
)
WHERE anio_escolar IS NULL OR btrim(anio_escolar) = '';

ALTER TABLE internal.materia
  ALTER COLUMN anio_escolar SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_materia_anio_escolar_format'
  ) THEN
    ALTER TABLE internal.materia
      ADD CONSTRAINT chk_materia_anio_escolar_format
      CHECK (anio_escolar ~ '^[0-9]{4}-[0-9]{4}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_materia_curso_anio
  ON internal.materia (curso_id, anio_escolar);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'internal'
      AND indexname = 'uq_materia_curso_nombre_anio'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM internal.materia
      GROUP BY curso_id, nombre, anio_escolar
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'No se crea uq_materia_curso_nombre_anio porque existen duplicados previos.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX uq_materia_curso_nombre_anio ON internal.materia (curso_id, nombre, anio_escolar)';
    END IF;
  END IF;
END
$$;
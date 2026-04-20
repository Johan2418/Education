-- 027: Guardas para anio_escolar en materia (default + anti-null)

-- Resolve default school year from runtime config when available.
CREATE OR REPLACE FUNCTION internal.resolve_anio_escolar_default()
RETURNS TEXT AS $$
DECLARE
  v_anio TEXT;
BEGIN
  BEGIN
    SELECT c.anio_escolar_activo
      INTO v_anio
    FROM internal.configuracion_academica c
    WHERE c.id = 1;
  EXCEPTION
    WHEN undefined_table THEN
      v_anio := NULL;
  END;

  IF v_anio IS NULL OR btrim(v_anio) = '' THEN
    v_anio := (EXTRACT(YEAR FROM CURRENT_DATE)::INT)::TEXT || '-' || ((EXTRACT(YEAR FROM CURRENT_DATE)::INT) + 1)::TEXT;
  END IF;

  RETURN v_anio;
END;
$$ LANGUAGE plpgsql STABLE;

-- Fill historical rows if any legacy insert produced null/blank values.
UPDATE internal.materia
SET anio_escolar = internal.resolve_anio_escolar_default()
WHERE anio_escolar IS NULL OR btrim(anio_escolar) = '';

ALTER TABLE internal.materia
  ALTER COLUMN anio_escolar SET NOT NULL;

-- Default for inserts that omit the column.
ALTER TABLE internal.materia
  ALTER COLUMN anio_escolar SET DEFAULT internal.resolve_anio_escolar_default();

-- Guard for explicit NULL or blank values provided by old clients.
CREATE OR REPLACE FUNCTION internal.materia_set_anio_escolar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.anio_escolar IS NULL OR btrim(NEW.anio_escolar) = '' THEN
    NEW.anio_escolar := internal.resolve_anio_escolar_default();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_materia_set_anio_escolar ON internal.materia;
CREATE TRIGGER trg_materia_set_anio_escolar
BEFORE INSERT OR UPDATE OF anio_escolar ON internal.materia
FOR EACH ROW EXECUTE FUNCTION internal.materia_set_anio_escolar();

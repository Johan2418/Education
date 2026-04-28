-- 030: Respuesta correcta en trabajos + ponderacion final por materia

ALTER TABLE internal.trabajo_pregunta
  ADD COLUMN IF NOT EXISTS respuesta_correcta TEXT;

ALTER TABLE internal.materia
  ADD COLUMN IF NOT EXISTS peso_contenidos_pct NUMERIC(5,2) NOT NULL DEFAULT 35.00,
  ADD COLUMN IF NOT EXISTS peso_lecciones_pct NUMERIC(5,2) NOT NULL DEFAULT 35.00,
  ADD COLUMN IF NOT EXISTS peso_trabajos_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  ADD COLUMN IF NOT EXISTS puntaje_total NUMERIC(8,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS puntaje_minimo_aprobacion NUMERIC(8,2) NOT NULL DEFAULT 6.00;

UPDATE internal.materia
SET
  peso_contenidos_pct = COALESCE(peso_contenidos_pct, 35.00),
  peso_lecciones_pct = COALESCE(peso_lecciones_pct, 35.00),
  peso_trabajos_pct = COALESCE(peso_trabajos_pct, 30.00),
  puntaje_total = COALESCE(puntaje_total, 10.00),
  puntaje_minimo_aprobacion = COALESCE(puntaje_minimo_aprobacion, 6.00);

ALTER TABLE internal.materia
  DROP CONSTRAINT IF EXISTS materia_pesos_rango_check;

ALTER TABLE internal.materia
  ADD CONSTRAINT materia_pesos_rango_check CHECK (
    peso_contenidos_pct >= 0 AND peso_contenidos_pct <= 100
    AND peso_lecciones_pct >= 0 AND peso_lecciones_pct <= 100
    AND peso_trabajos_pct >= 0 AND peso_trabajos_pct <= 100
  );

ALTER TABLE internal.materia
  DROP CONSTRAINT IF EXISTS materia_pesos_suma_check;

ALTER TABLE internal.materia
  ADD CONSTRAINT materia_pesos_suma_check CHECK (
    ROUND((peso_contenidos_pct + peso_lecciones_pct + peso_trabajos_pct)::numeric, 2) = 100.00
  );

ALTER TABLE internal.materia
  DROP CONSTRAINT IF EXISTS materia_puntaje_total_check;

ALTER TABLE internal.materia
  ADD CONSTRAINT materia_puntaje_total_check CHECK (puntaje_total > 0);

ALTER TABLE internal.materia
  DROP CONSTRAINT IF EXISTS materia_puntaje_minimo_check;

ALTER TABLE internal.materia
  ADD CONSTRAINT materia_puntaje_minimo_check CHECK (
    puntaje_minimo_aprobacion >= 0
    AND puntaje_minimo_aprobacion <= puntaje_total
  );

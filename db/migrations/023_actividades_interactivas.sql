-- 023: Actividades interactivas (H5P, Genially, Educaplay)

ALTER TYPE internal.tipo_seccion ADD VALUE IF NOT EXISTS 'actividad_interactiva';

CREATE TABLE IF NOT EXISTS internal.actividad_interactiva (
	id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	leccion_id             UUID NOT NULL REFERENCES internal.leccion(id) ON DELETE CASCADE,
	titulo                 TEXT NOT NULL,
	descripcion            TEXT,
	proveedor              TEXT NOT NULL,
	embed_url              TEXT NOT NULL,
	regla_completitud      TEXT NOT NULL DEFAULT 'manual',
	puntaje_maximo         NUMERIC(8,2) NOT NULL DEFAULT 100,
	intentos_maximos       INT,
	configuracion          JSONB NOT NULL DEFAULT '{}'::jsonb,
	activo                 BOOLEAN NOT NULL DEFAULT TRUE,
	created_by             UUID REFERENCES internal.profiles(id) ON DELETE SET NULL,
	created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT actividad_interactiva_proveedor_check CHECK (
		proveedor IN ('h5p', 'genially', 'educaplay')
	),
	CONSTRAINT actividad_interactiva_regla_check CHECK (
		regla_completitud IN ('manual', 'evento', 'puntaje')
	),
	CONSTRAINT actividad_interactiva_puntaje_check CHECK (puntaje_maximo > 0),
	CONSTRAINT actividad_interactiva_intentos_check CHECK (intentos_maximos IS NULL OR intentos_maximos > 0),
	CONSTRAINT actividad_interactiva_embed_check CHECK (btrim(embed_url) <> '')
);

CREATE INDEX IF NOT EXISTS idx_actividad_interactiva_leccion ON internal.actividad_interactiva (leccion_id);
CREATE INDEX IF NOT EXISTS idx_actividad_interactiva_proveedor ON internal.actividad_interactiva (proveedor);
CREATE INDEX IF NOT EXISTS idx_actividad_interactiva_activo ON internal.actividad_interactiva (activo);

CREATE TABLE IF NOT EXISTS internal.actividad_interactiva_intento (
	id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	actividad_id           UUID NOT NULL REFERENCES internal.actividad_interactiva(id) ON DELETE CASCADE,
	user_id                UUID NOT NULL REFERENCES internal.profiles(id) ON DELETE CASCADE,
	completado             BOOLEAN NOT NULL DEFAULT FALSE,
	score_obtenido         NUMERIC(8,2),
	score_normalizado      NUMERIC(8,2),
	tiempo_dedicado        INT NOT NULL DEFAULT 0,
	intentos               INT NOT NULL DEFAULT 0,
	metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
	started_at             TIMESTAMPTZ,
	completed_at           TIMESTAMPTZ,
	created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (actividad_id, user_id),
	CONSTRAINT actividad_interactiva_intento_tiempo_check CHECK (tiempo_dedicado >= 0),
	CONSTRAINT actividad_interactiva_intento_intentos_check CHECK (intentos >= 0),
	CONSTRAINT actividad_interactiva_intento_score_norm_check CHECK (
		score_normalizado IS NULL OR (score_normalizado >= 0 AND score_normalizado <= 100)
	)
);

CREATE INDEX IF NOT EXISTS idx_actividad_intento_actividad ON internal.actividad_interactiva_intento (actividad_id);
CREATE INDEX IF NOT EXISTS idx_actividad_intento_user ON internal.actividad_interactiva_intento (user_id);
CREATE INDEX IF NOT EXISTS idx_actividad_intento_completado ON internal.actividad_interactiva_intento (completado);

ALTER TABLE internal.leccion_seccion
	ADD COLUMN IF NOT EXISTS actividad_interactiva_id UUID REFERENCES internal.actividad_interactiva(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seccion_actividad_interactiva ON internal.leccion_seccion (actividad_interactiva_id);

ALTER TABLE internal.actividad_interactiva ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.actividad_interactiva_intento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actividad_interactiva_select ON internal.actividad_interactiva;
CREATE POLICY actividad_interactiva_select ON internal.actividad_interactiva
	FOR SELECT USING (true);

DROP POLICY IF EXISTS actividad_interactiva_modify ON internal.actividad_interactiva;
CREATE POLICY actividad_interactiva_modify ON internal.actividad_interactiva
	FOR ALL USING (internal.is_editor())
	WITH CHECK (internal.is_editor());

DROP POLICY IF EXISTS actividad_interactiva_intento_select ON internal.actividad_interactiva_intento;
CREATE POLICY actividad_interactiva_intento_select ON internal.actividad_interactiva_intento
	FOR SELECT USING (
		user_id = internal.current_user_id()
		OR internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
	);

DROP POLICY IF EXISTS actividad_interactiva_intento_insert ON internal.actividad_interactiva_intento;
CREATE POLICY actividad_interactiva_intento_insert ON internal.actividad_interactiva_intento
	FOR INSERT WITH CHECK (user_id = internal.current_user_id());

DROP POLICY IF EXISTS actividad_interactiva_intento_update ON internal.actividad_interactiva_intento;
CREATE POLICY actividad_interactiva_intento_update ON internal.actividad_interactiva_intento
	FOR UPDATE USING (user_id = internal.current_user_id());

DROP TRIGGER IF EXISTS trg_actividad_interactiva_updated_at ON internal.actividad_interactiva;
CREATE TRIGGER trg_actividad_interactiva_updated_at
	BEFORE UPDATE ON internal.actividad_interactiva
	FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

DROP TRIGGER IF EXISTS trg_actividad_interactiva_intento_updated_at ON internal.actividad_interactiva_intento;
CREATE TRIGGER trg_actividad_interactiva_intento_updated_at
	BEFORE UPDATE ON internal.actividad_interactiva_intento
	FOR EACH ROW EXECUTE FUNCTION internal.set_updated_at();

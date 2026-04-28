-- 028: Checkpoint de video por seccion + proveedor interactivo nativo

ALTER TABLE internal.leccion_seccion_gating_pdf
	ADD COLUMN IF NOT EXISTS checkpoint_segundos INT;

ALTER TABLE internal.leccion_seccion_gating_pdf
	DROP CONSTRAINT IF EXISTS leccion_seccion_gating_pdf_checkpoint_segundos_check;

ALTER TABLE internal.leccion_seccion_gating_pdf
	ADD CONSTRAINT leccion_seccion_gating_pdf_checkpoint_segundos_check
	CHECK (checkpoint_segundos IS NULL OR checkpoint_segundos > 0);

ALTER TABLE internal.actividad_interactiva
	DROP CONSTRAINT IF EXISTS actividad_interactiva_proveedor_check;

ALTER TABLE internal.actividad_interactiva
	ADD CONSTRAINT actividad_interactiva_proveedor_check
	CHECK (proveedor IN ('h5p', 'genially', 'educaplay', 'nativo'));

ALTER TABLE internal.actividad_interactiva
	DROP CONSTRAINT IF EXISTS actividad_interactiva_embed_check;

ALTER TABLE internal.actividad_interactiva
	ADD CONSTRAINT actividad_interactiva_embed_check
	CHECK (
		(proveedor = 'nativo')
		OR btrim(embed_url) <> ''
	);

-- 033: Deprecar y eliminar soporte para proveedores viejos de actividades interactivas
-- Este migration limpia todas las actividades con proveedores deprecated (h5p, genially, educaplay)
-- y deja solo el soporte para actividades nativas (proveedor='nativo')

BEGIN;

-- 1. Registrar actividades que serán eliminadas (para auditoría)
CREATE TEMPORARY TABLE deprecated_actividades_backup AS
SELECT 
	id, 
	leccion_id, 
	titulo, 
	proveedor, 
	embed_url, 
	configuracion,
	created_at, 
	created_by
FROM internal.actividad_interactiva 
WHERE proveedor IN ('h5p', 'genially', 'educaplay');

-- 2. Crear tabla de auditoría si no existe
CREATE TABLE IF NOT EXISTS internal.actividad_interactiva_deprecated_log (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	actividad_id UUID NOT NULL,
	leccion_id UUID,
	titulo TEXT,
	proveedor TEXT,
	embed_url TEXT,
	configuracion JSONB,
	created_at TIMESTAMPTZ,
	created_by UUID,
	deleted_at TIMESTAMPTZ DEFAULT now(),
	nota TEXT DEFAULT 'Eliminada por deprecación de proveedor h5p/genially/educaplay'
);

-- 3. Guardar en auditoría las actividades que se eliminarán
INSERT INTO internal.actividad_interactiva_deprecated_log 
	(actividad_id, leccion_id, titulo, proveedor, embed_url, configuracion, created_at, created_by)
SELECT 
	id, leccion_id, titulo, proveedor, embed_url, configuracion, created_at, created_by
FROM deprecated_actividades_backup;

-- 4. Limpiar referencias de secciones a actividades deprecated
UPDATE internal.leccion_seccion
SET actividad_interactiva_id = NULL
WHERE actividad_interactiva_id IN (
	SELECT id FROM internal.actividad_interactiva 
	WHERE proveedor IN ('h5p', 'genially', 'educaplay')
);

-- 5. Eliminar todas las actividades con proveedores viejos
DELETE FROM internal.actividad_interactiva
WHERE proveedor IN ('h5p', 'genially', 'educaplay');

-- 6. Actualizar constraint para solo permitir 'nativo'
ALTER TABLE internal.actividad_interactiva
	DROP CONSTRAINT IF EXISTS actividad_interactiva_proveedor_check;

ALTER TABLE internal.actividad_interactiva
	ADD CONSTRAINT actividad_interactiva_proveedor_check
	CHECK (proveedor = 'nativo');

-- 7. Hacer embed_url requerido solo para información histórica, pero no para nuevas actividades
-- Ya que todas deben ser 'nativo', el check se mantiene simple
ALTER TABLE internal.actividad_interactiva
	DROP CONSTRAINT IF EXISTS actividad_interactiva_embed_check;

ALTER TABLE internal.actividad_interactiva
	ADD CONSTRAINT actividad_interactiva_embed_check
	CHECK (embed_url = '' OR embed_url IS NOT NULL);

-- 8. Crear índice en tabla de auditoría
CREATE INDEX IF NOT EXISTS idx_deprecated_log_deleted_at 
	ON internal.actividad_interactiva_deprecated_log (deleted_at);

CREATE INDEX IF NOT EXISTS idx_deprecated_log_proveedor 
	ON internal.actividad_interactiva_deprecated_log (proveedor);

-- Log de auditoria
COMMENT ON TABLE internal.actividad_interactiva_deprecated_log 
IS 'Registro de actividades interactivas eliminadas por deprecación de proveedores h5p, genially, educaplay. Mantener para auditoría histórica.';

COMMIT;

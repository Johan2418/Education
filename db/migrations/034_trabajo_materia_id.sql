-- 034: Agregar materia_id a trabajo y hacer leccion_id nullable

-- Agregar columna materia_id a trabajo
ALTER TABLE internal.trabajo ADD COLUMN materia_id UUID REFERENCES internal.materia(id) ON DELETE SET NULL;

-- Hacer leccion_id nullable
ALTER TABLE internal.trabajo ALTER COLUMN leccion_id DROP NOT NULL;

-- Crear índice para materia_id
CREATE INDEX idx_trabajo_materia ON internal.trabajo (materia_id);

-- Actualizar política RLS para incluir materia_id
DROP POLICY IF EXISTS trabajo_select ON internal.trabajo;

CREATE POLICY trabajo_select ON internal.trabajo
  FOR SELECT USING (
    internal.current_user_role() IN ('teacher', 'admin', 'super_admin')
    OR (
      internal.current_user_role() = 'student'
      AND estado IN ('publicado', 'cerrado')
      AND (
        -- Por lección (antiguo)
        EXISTS (
          SELECT 1
          FROM internal.leccion l
          JOIN internal.tema t ON t.id = l.tema_id
          JOIN internal.unidad u ON u.id = t.unidad_id
          JOIN internal.materia m ON m.id = u.materia_id
          JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id
          WHERE l.id = leccion_id
            AND ec.estudiante_id = internal.current_user_id()
        )
        -- Por materia (nuevo)
        OR EXISTS (
          SELECT 1
          FROM internal.materia m
          JOIN internal.estudiante_curso ec ON ec.curso_id = m.curso_id
          WHERE m.id = materia_id
            AND ec.estudiante_id = internal.current_user_id()
        )
      )
    )
  );

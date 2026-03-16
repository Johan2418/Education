-- 011: Add teacher_id to curso (1:1 teacher-course assignment)

ALTER TABLE internal.curso
  ADD COLUMN teacher_id UUID REFERENCES internal.profiles(id) ON DELETE SET NULL;

-- Unique constraint: one teacher can only be assigned to one course
ALTER TABLE internal.curso
  ADD CONSTRAINT uq_curso_teacher UNIQUE (teacher_id);

CREATE INDEX idx_curso_teacher ON internal.curso (teacher_id);

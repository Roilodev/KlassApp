CREATE TABLE class_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  teacher_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id)
    REFERENCES classes (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, teacher_id, class_id)
    REFERENCES teacher_class_assignments (school_id, user_id, class_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  CHECK (starts_at < ends_at),
  UNIQUE (school_id, id)
);

CREATE INDEX class_schedules_school_day_time_idx
  ON class_schedules (school_id, day_of_week, starts_at);

CREATE INDEX class_schedules_teacher_day_time_idx
  ON class_schedules (school_id, teacher_id, day_of_week, starts_at)
  WHERE teacher_id IS NOT NULL;

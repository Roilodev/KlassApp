CREATE TABLE behavior_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  class_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  category text NOT NULL CHECK (
    category IN ('participation', 'collaboration', 'responsibility', 'learning', 'positive', 'other')
  ),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1200),
  occurred_on date NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, enrollment_id, student_id, class_id, academic_year_id)
    REFERENCES student_enrollments
      (school_id, id, student_id, class_id, academic_year_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX behavior_records_school_student_date_idx
  ON behavior_records (school_id, student_id, occurred_on DESC, created_at DESC);

CREATE INDEX behavior_records_school_class_date_idx
  ON behavior_records (school_id, class_id, occurred_on DESC);

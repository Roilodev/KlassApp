CREATE UNIQUE INDEX student_enrollments_school_identity_idx
  ON student_enrollments
    (school_id, id, student_id, class_id, academic_year_id);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  scheduled_on date NOT NULL,
  max_points numeric(7, 2) NOT NULL CHECK (max_points > 0 AND max_points <= 10000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id, academic_year_id)
    REFERENCES classes (school_id, id, academic_year_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  UNIQUE (school_id, id, class_id, academic_year_id)
);

CREATE INDEX assessments_school_class_date_idx
  ON assessments (school_id, class_id, scheduled_on DESC);

CREATE TABLE assessment_results (
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  class_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  student_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  score numeric(7, 2) NOT NULL CHECK (score >= 0),
  recorded_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, assessment_id, student_id),
  FOREIGN KEY (school_id, assessment_id, class_id, academic_year_id)
    REFERENCES assessments (school_id, id, class_id, academic_year_id)
    ON DELETE CASCADE,
  FOREIGN KEY (school_id, enrollment_id, student_id, class_id, academic_year_id)
    REFERENCES student_enrollments
      (school_id, id, student_id, class_id, academic_year_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (school_id, recorded_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX assessment_results_school_student_idx
  ON assessment_results (school_id, student_id, updated_at DESC);

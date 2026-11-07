CREATE TABLE school_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT ''
    CHECK (length(description) <= 2000),
  starts_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT ''
    CHECK (length(location) <= 160),
  audience_type text NOT NULL CHECK (audience_type IN ('grade', 'class')),
  academic_year_id uuid,
  grade_id uuid,
  class_id uuid,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid,
  cancelled_at timestamptz,
  FOREIGN KEY (school_id, academic_year_id)
    REFERENCES academic_years (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, grade_id)
    REFERENCES grades (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, class_id)
    REFERENCES classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, cancelled_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (audience_type = 'class'
      AND class_id IS NOT NULL
      AND academic_year_id IS NULL
      AND grade_id IS NULL)
    OR
    (audience_type = 'grade'
      AND class_id IS NULL
      AND academic_year_id IS NOT NULL
      AND grade_id IS NOT NULL)
  ),
  CHECK (
    (status = 'published' AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX school_events_school_starts_idx
  ON school_events (school_id, starts_at DESC);

CREATE INDEX school_events_school_class_idx
  ON school_events (school_id, class_id, starts_at)
  WHERE class_id IS NOT NULL;

CREATE INDEX school_events_school_grade_idx
  ON school_events (school_id, grade_id, academic_year_id, starts_at)
  WHERE grade_id IS NOT NULL;

CREATE TABLE school_class_session_periods (
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session IN ('morning', 'afternoon')),
  period_order smallint NOT NULL CHECK (period_order > 0),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, session, period_order),
  FOREIGN KEY (school_id, updated_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  CHECK (starts_at < ends_at)
);

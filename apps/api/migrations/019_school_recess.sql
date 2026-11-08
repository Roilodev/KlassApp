CREATE TABLE school_recesses (
  school_id uuid PRIMARY KEY REFERENCES schools (id) ON DELETE CASCADE,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, updated_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  CHECK (starts_at < ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS classes_school_id_id_unique
  ON classes (school_id, id);

CREATE TABLE teacher_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  token_hash text NOT NULL UNIQUE,
  class_ids uuid[] NOT NULL CHECK (cardinality(class_ids) > 0),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id)
);

CREATE UNIQUE INDEX teacher_invitations_pending_email_unique
  ON teacher_invitations (school_id, email)
  WHERE accepted_at IS NULL;

CREATE TABLE teacher_class_assignments (
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id, class_id),
  FOREIGN KEY (school_id, user_id)
    REFERENCES school_memberships (school_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, class_id)
    REFERENCES classes (school_id, id) ON DELETE CASCADE
);

CREATE INDEX teacher_class_assignments_user_idx
  ON teacher_class_assignments (school_id, user_id);

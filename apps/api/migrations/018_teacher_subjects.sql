CREATE TABLE teacher_subject_assignments (
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id, subject_id),
  FOREIGN KEY (school_id, user_id)
    REFERENCES school_memberships (school_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, subject_id)
    REFERENCES school_subjects (school_id, id) ON DELETE CASCADE
);

ALTER TABLE teacher_invitations
  ADD COLUMN subject_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX teacher_subject_assignments_subject_idx
  ON teacher_subject_assignments (school_id, subject_id, user_id);

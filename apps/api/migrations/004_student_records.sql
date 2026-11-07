CREATE UNIQUE INDEX IF NOT EXISTS classes_school_id_id_year_unique
  ON classes (school_id, id, academic_year_id);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'transferred', 'completed')),
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  ended_at date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, class_id, academic_year_id)
    REFERENCES classes (school_id, id, academic_year_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status <> 'active')
  )
);

CREATE UNIQUE INDEX student_one_active_enrollment_per_year
  ON student_enrollments (school_id, student_id, academic_year_id)
  WHERE status = 'active';

CREATE INDEX student_enrollments_class_idx
  ON student_enrollments (school_id, class_id, status);

CREATE TABLE responsible_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+55[1-9][0-9]{9,10}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id)
);

CREATE TABLE student_responsibles (
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  responsible_id uuid NOT NULL,
  relationship text NOT NULL CHECK (length(trim(relationship)) BETWEEN 1 AND 80),
  notification_authorized boolean NOT NULL DEFAULT false,
  authorization_recorded_by uuid,
  authorization_recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, student_id, responsible_id),
  FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, responsible_id)
    REFERENCES responsible_contacts (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, authorization_recorded_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (notification_authorized = false
      AND authorization_recorded_by IS NULL
      AND authorization_recorded_at IS NULL)
    OR
    (notification_authorized = true
      AND authorization_recorded_by IS NOT NULL
      AND authorization_recorded_at IS NOT NULL)
  )
);

CREATE INDEX student_responsibles_contact_idx
  ON student_responsibles (school_id, responsible_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, actor_id)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX audit_logs_school_created_idx
  ON audit_logs (school_id, created_at DESC);

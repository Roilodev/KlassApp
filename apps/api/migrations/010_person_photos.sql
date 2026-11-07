ALTER TABLE students
  ADD COLUMN photo_data bytea,
  ADD COLUMN photo_mime_type text,
  ADD COLUMN photo_authorized_by uuid,
  ADD COLUMN photo_authorized_at timestamptz,
  ADD CONSTRAINT students_photo_authorized_by_fk
    FOREIGN KEY (school_id, photo_authorized_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT students_photo_pair_check CHECK (
    (photo_data IS NULL AND photo_mime_type IS NULL
      AND photo_authorized_by IS NULL AND photo_authorized_at IS NULL)
    OR (
      photo_data IS NOT NULL
      AND photo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND octet_length(photo_data) BETWEEN 1 AND 5242880
      AND photo_authorized_by IS NOT NULL
      AND photo_authorized_at IS NOT NULL
    )
  );

CREATE TABLE teacher_photos (
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  photo_data bytea NOT NULL CHECK (octet_length(photo_data) BETWEEN 1 AND 5242880),
  photo_mime_type text NOT NULL
    CHECK (photo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id),
  FOREIGN KEY (school_id, user_id)
    REFERENCES school_memberships (school_id, user_id) ON DELETE CASCADE
);

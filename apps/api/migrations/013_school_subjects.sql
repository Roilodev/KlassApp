CREATE TABLE school_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, created_by)
    REFERENCES school_memberships (school_id, user_id) ON DELETE RESTRICT,
  UNIQUE (school_id, id)
);

CREATE UNIQUE INDEX school_subjects_school_name_lower_idx
  ON school_subjects (school_id, lower(name));

WITH legacy_subjects AS (
  SELECT school_id, trim(subject) AS name, created_by FROM class_schedules
  UNION ALL
  SELECT school_id, trim(subject) AS name, created_by FROM assessments
),
distinct_subjects AS (
  SELECT DISTINCT ON (school_id, lower(name)) school_id, name, created_by
  FROM legacy_subjects
  ORDER BY school_id, lower(name), name
)
INSERT INTO school_subjects (school_id, name, created_by)
SELECT school_id, name, created_by
FROM distinct_subjects;

ALTER TABLE class_schedules ADD COLUMN subject_id uuid;
UPDATE class_schedules
SET subject_id = school_subjects.id
FROM school_subjects
WHERE school_subjects.school_id = class_schedules.school_id
  AND lower(school_subjects.name) = lower(trim(class_schedules.subject));
ALTER TABLE class_schedules ALTER COLUMN subject_id SET NOT NULL;
ALTER TABLE class_schedules
  ADD CONSTRAINT class_schedules_subject_fk
  FOREIGN KEY (school_id, subject_id)
  REFERENCES school_subjects (school_id, id) ON DELETE RESTRICT;
CREATE INDEX class_schedules_school_subject_idx
  ON class_schedules (school_id, subject_id);
ALTER TABLE class_schedules DROP COLUMN subject;

ALTER TABLE assessments ADD COLUMN subject_id uuid;
UPDATE assessments
SET subject_id = school_subjects.id
FROM school_subjects
WHERE school_subjects.school_id = assessments.school_id
  AND lower(school_subjects.name) = lower(trim(assessments.subject));
ALTER TABLE assessments ALTER COLUMN subject_id SET NOT NULL;
ALTER TABLE assessments
  ADD CONSTRAINT assessments_subject_fk
  FOREIGN KEY (school_id, subject_id)
  REFERENCES school_subjects (school_id, id) ON DELETE RESTRICT;
CREATE INDEX assessments_school_subject_idx
  ON assessments (school_id, subject_id);
ALTER TABLE assessments DROP COLUMN subject;

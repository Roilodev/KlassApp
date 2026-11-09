CREATE TABLE school_subject_grades (
  school_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  grade_id uuid NOT NULL,
  weekly_frequency smallint CHECK (weekly_frequency BETWEEN 1 AND 40),
  PRIMARY KEY (school_id, subject_id, grade_id),
  FOREIGN KEY (school_id, subject_id)
    REFERENCES school_subjects (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, grade_id)
    REFERENCES grades (school_id, id) ON DELETE CASCADE
);

CREATE INDEX school_subject_grades_school_grade_idx
  ON school_subject_grades (school_id, grade_id, subject_id);

INSERT INTO school_subject_grades (school_id, subject_id, grade_id, weekly_frequency)
SELECT DISTINCT school_subjects.school_id,
       school_subjects.id,
       classes.grade_id,
       school_subjects.weekly_frequency
FROM class_schedules
JOIN school_subjects
  ON school_subjects.school_id = class_schedules.school_id
 AND school_subjects.id = class_schedules.subject_id
JOIN classes
  ON classes.school_id = class_schedules.school_id
 AND classes.id = class_schedules.class_id
UNION
SELECT DISTINCT school_subjects.school_id,
       school_subjects.id,
       classes.grade_id,
       school_subjects.weekly_frequency
FROM assessments
JOIN school_subjects
  ON school_subjects.school_id = assessments.school_id
 AND school_subjects.id = assessments.subject_id
JOIN classes
  ON classes.school_id = assessments.school_id
 AND classes.id = assessments.class_id;

ALTER TABLE school_subjects DROP COLUMN weekly_frequency;

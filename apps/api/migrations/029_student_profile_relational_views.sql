DROP VIEW student_profiles;

CREATE VIEW student_profiles AS
SELECT
  students.school_id,
  students.id AS student_id,
  students.full_name,
  students.home_address,
  students.is_active,
  students.leave_date,
  students.leave_reason,
  schools.name AS school_name,
  students.created_at,
  students.photo_data IS NOT NULL AS has_photo,
  students.photo_authorized_at AS photo_authorization_date,
  photo_authorizer.display_name AS photo_authorized_by,
  responsible_contacts.id AS responsible_id,
  responsible_contacts.full_name AS responsible_full_name,
  responsible_contacts.phone_e164 AS responsible_phone,
  student_responsibles.relationship AS responsible_relationship,
  student_responsibles.notification_authorized
FROM students
JOIN schools ON schools.id = students.school_id
LEFT JOIN student_responsibles
  ON student_responsibles.school_id = students.school_id
 AND student_responsibles.student_id = students.id
LEFT JOIN responsible_contacts
  ON responsible_contacts.school_id = student_responsibles.school_id
 AND responsible_contacts.id = student_responsibles.responsible_id
LEFT JOIN users AS photo_authorizer
  ON photo_authorizer.id = students.photo_authorized_by;

CREATE VIEW student_profile_enrollments AS
SELECT
  student_enrollments.school_id,
  student_enrollments.student_id,
  student_enrollments.id AS enrollment_id,
  student_enrollments.academic_year_id,
  academic_years.year,
  student_enrollments.class_id,
  grades.name AS grade,
  classes.name AS class_name,
  student_enrollments.status,
  student_enrollments.started_at,
  student_enrollments.ended_at
FROM student_enrollments
JOIN academic_years
  ON academic_years.school_id = student_enrollments.school_id
 AND academic_years.id = student_enrollments.academic_year_id
JOIN classes
  ON classes.school_id = student_enrollments.school_id
 AND classes.id = student_enrollments.class_id
JOIN grades
  ON grades.school_id = classes.school_id
 AND grades.id = classes.grade_id;

CREATE VIEW student_profile_teachers AS
SELECT
  student_enrollments.school_id,
  student_enrollments.student_id,
  student_enrollments.id AS enrollment_id,
  student_enrollments.class_id,
  academic_years.year,
  grades.name AS grade,
  classes.name AS class_name,
  teacher_class_assignments.user_id AS teacher_id,
  users.display_name AS teacher_name
FROM student_enrollments
JOIN classes
  ON classes.school_id = student_enrollments.school_id
 AND classes.id = student_enrollments.class_id
JOIN academic_years
  ON academic_years.school_id = student_enrollments.school_id
 AND academic_years.id = student_enrollments.academic_year_id
JOIN grades
  ON grades.school_id = classes.school_id
 AND grades.id = classes.grade_id
JOIN teacher_class_assignments
  ON teacher_class_assignments.school_id = classes.school_id
 AND teacher_class_assignments.class_id = classes.id
JOIN users ON users.id = teacher_class_assignments.user_id;

CREATE VIEW student_profile_assessments AS
SELECT
  student_enrollments.school_id,
  student_enrollments.student_id,
  assessments.id AS assessment_id,
  assessments.title,
  school_subjects.name AS subject,
  assessments.scheduled_on,
  assessments.max_points,
  assessment_results.score,
  classes.id AS class_id,
  classes.name AS class_name,
  grades.name AS grade,
  academic_years.id AS academic_year_id,
  academic_years.year
FROM student_enrollments
JOIN assessments
  ON assessments.school_id = student_enrollments.school_id
 AND assessments.class_id = student_enrollments.class_id
 AND assessments.academic_year_id = student_enrollments.academic_year_id
JOIN school_subjects
  ON school_subjects.school_id = assessments.school_id
 AND school_subjects.id = assessments.subject_id
JOIN classes
  ON classes.school_id = assessments.school_id
 AND classes.id = assessments.class_id
JOIN grades
  ON grades.school_id = classes.school_id
 AND grades.id = classes.grade_id
JOIN academic_years
  ON academic_years.school_id = assessments.school_id
 AND academic_years.id = assessments.academic_year_id
LEFT JOIN assessment_results
  ON assessment_results.school_id = assessments.school_id
 AND assessment_results.assessment_id = assessments.id
 AND assessment_results.student_id = student_enrollments.student_id;

CREATE VIEW student_profile_behavior AS
SELECT
  behavior_records.school_id,
  behavior_records.student_id,
  behavior_records.id AS behavior_record_id,
  behavior_records.enrollment_id,
  behavior_records.category,
  behavior_records.description,
  behavior_records.occurred_on,
  behavior_records.created_at,
  behavior_records.created_by AS recorded_by_id,
  users.display_name AS recorded_by_name,
  classes.id AS class_id,
  classes.name AS class_name,
  grades.name AS grade,
  academic_years.year
FROM behavior_records
JOIN classes
  ON classes.school_id = behavior_records.school_id
 AND classes.id = behavior_records.class_id
JOIN grades
  ON grades.school_id = classes.school_id
 AND grades.id = classes.grade_id
JOIN academic_years
  ON academic_years.school_id = classes.school_id
 AND academic_years.id = classes.academic_year_id
JOIN users ON users.id = behavior_records.created_by;

CREATE VIEW student_profile_events AS
SELECT
  student_enrollments.school_id,
  student_enrollments.student_id,
  school_events.id AS event_id,
  school_events.title,
  school_events.description,
  school_events.starts_at,
  school_events.location,
  school_events.status,
  school_events.audience_type
FROM school_events
JOIN student_enrollments
  ON student_enrollments.school_id = school_events.school_id
WHERE school_events.status <> 'draft'
  AND EXISTS (
    SELECT 1
    FROM classes
    WHERE classes.school_id = student_enrollments.school_id
      AND classes.id = student_enrollments.class_id
      AND (
        school_events.audience_type = 'school'
        OR school_events.class_id = classes.id
        OR (
          school_events.audience_type = 'grade'
          AND school_events.grade_id = classes.grade_id
          AND school_events.academic_year_id = classes.academic_year_id
        )
      )
  );

CREATE VIEW student_profile_schedules AS
SELECT
  student_enrollments.school_id,
  student_enrollments.student_id,
  student_enrollments.id AS enrollment_id,
  academic_years.year,
  classes.id AS class_id,
  classes.name AS class_name,
  grades.name AS grade,
  class_schedules.id AS schedule_id,
  class_schedules.day_of_week,
  class_schedules.starts_at,
  class_schedules.ends_at,
  school_subjects.id AS subject_id,
  school_subjects.name AS subject,
  class_schedules.teacher_id,
  users.display_name AS teacher_name
FROM student_enrollments
JOIN classes
  ON classes.school_id = student_enrollments.school_id
 AND classes.id = student_enrollments.class_id
JOIN academic_years
  ON academic_years.school_id = classes.school_id
 AND academic_years.id = classes.academic_year_id
JOIN grades
  ON grades.school_id = classes.school_id
 AND grades.id = classes.grade_id
JOIN class_schedules
  ON class_schedules.school_id = classes.school_id
 AND class_schedules.class_id = classes.id
JOIN school_subjects
  ON school_subjects.school_id = class_schedules.school_id
 AND school_subjects.id = class_schedules.subject_id
LEFT JOIN users ON users.id = class_schedules.teacher_id;

REVOKE ALL ON
  student_profiles,
  student_profile_enrollments,
  student_profile_teachers,
  student_profile_assessments,
  student_profile_behavior,
  student_profile_events,
  student_profile_schedules
FROM PUBLIC;

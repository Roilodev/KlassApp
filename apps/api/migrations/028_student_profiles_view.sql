DROP FUNCTION get_student_profile(uuid, uuid);

CREATE VIEW student_profiles AS
SELECT
  profile_student.school_id,
  profile_student.id AS student_id,
  jsonb_build_object(
    'student',
    (
      SELECT jsonb_build_object(
        'id', students.id,
        'fullName', students.full_name,
        'homeAddress', students.home_address,
        'isActive', students.is_active,
        'leaveDate', students.leave_date,
        'leaveReason', students.leave_reason,
        'schoolName', schools.name,
        'createdAt', students.created_at,
        'hasPhoto', students.photo_data IS NOT NULL,
        'photoAuthorizationDate', students.photo_authorized_at,
        'photoAuthorizedBy', photo_authorizer.display_name
      )
      FROM students
      JOIN schools ON schools.id = students.school_id
      LEFT JOIN users AS photo_authorizer
        ON photo_authorizer.id = students.photo_authorized_by
      WHERE students.school_id = profile_student.school_id
        AND students.id = profile_student.id
    ),
    'enrollments',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'year', academic_years.year,
            'grade', grades.name,
            'className', classes.name,
            'status', student_enrollments.status,
            'startedAt', student_enrollments.started_at,
            'endedAt', student_enrollments.ended_at,
            'teachers',
            COALESCE(
              (
                SELECT jsonb_agg(users.display_name ORDER BY users.display_name)
                FROM teacher_class_assignments
                JOIN users ON users.id = teacher_class_assignments.user_id
                WHERE teacher_class_assignments.school_id = classes.school_id
                  AND teacher_class_assignments.class_id = classes.id
              ),
              '[]'::jsonb
            )
          )
          ORDER BY academic_years.year DESC
        )
        FROM student_enrollments
        JOIN academic_years
          ON academic_years.school_id = student_enrollments.school_id
         AND academic_years.id = student_enrollments.academic_year_id
        JOIN classes
          ON classes.school_id = student_enrollments.school_id
         AND classes.id = student_enrollments.class_id
        JOIN grades
          ON grades.school_id = classes.school_id
         AND grades.id = classes.grade_id
        WHERE student_enrollments.school_id = profile_student.school_id
          AND student_enrollments.student_id = profile_student.id
      ),
      '[]'::jsonb
    ),
    'responsibles',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', responsible_contacts.id,
            'fullName', responsible_contacts.full_name,
            'phone', responsible_contacts.phone_e164,
            'relationship', student_responsibles.relationship,
            'notificationAuthorized', student_responsibles.notification_authorized
          )
          ORDER BY responsible_contacts.full_name
        )
        FROM student_responsibles
        JOIN responsible_contacts
          ON responsible_contacts.school_id = student_responsibles.school_id
         AND responsible_contacts.id = student_responsibles.responsible_id
        WHERE student_responsibles.school_id = profile_student.school_id
          AND student_responsibles.student_id = profile_student.id
      ),
      '[]'::jsonb
    ),
    'assessments',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', assessments.id,
            'title', assessments.title,
            'subject', school_subjects.name,
            'scheduledOn', assessments.scheduled_on,
            'maxPoints', assessments.max_points,
            'score', assessment_results.score,
            'classLabel', grades.name || ' · Turma ' || classes.name,
            'year', academic_years.year
          )
          ORDER BY assessments.scheduled_on DESC, assessments.title
        )
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
         AND assessment_results.student_id = student_enrollments.student_id
        WHERE student_enrollments.school_id = profile_student.school_id
          AND student_enrollments.student_id = profile_student.id
      ),
      '[]'::jsonb
    ),
    'behavior',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', behavior_records.id,
            'category', behavior_records.category,
            'description', behavior_records.description,
            'occurredOn', behavior_records.occurred_on,
            'recordedBy', users.display_name,
            'classLabel', grades.name || ' · Turma ' || classes.name
          )
          ORDER BY behavior_records.occurred_on DESC, behavior_records.created_at DESC
        )
        FROM behavior_records
        JOIN classes
          ON classes.school_id = behavior_records.school_id
         AND classes.id = behavior_records.class_id
        JOIN grades
          ON grades.school_id = classes.school_id
         AND grades.id = classes.grade_id
        JOIN users ON users.id = behavior_records.created_by
        WHERE behavior_records.school_id = profile_student.school_id
          AND behavior_records.student_id = profile_student.id
      ),
      '[]'::jsonb
    ),
    'events',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', school_events.id,
            'title', school_events.title,
            'description', school_events.description,
            'startsAt', school_events.starts_at,
            'location', school_events.location,
            'status', school_events.status,
            'audienceType', school_events.audience_type
          )
          ORDER BY school_events.starts_at DESC
        )
        FROM school_events
        WHERE school_events.school_id = profile_student.school_id
          AND school_events.status <> 'draft'
          AND EXISTS (
            SELECT 1
            FROM student_enrollments
            JOIN classes
              ON classes.school_id = student_enrollments.school_id
             AND classes.id = student_enrollments.class_id
            WHERE student_enrollments.school_id = profile_student.school_id
              AND student_enrollments.student_id = profile_student.id
              AND (
                school_events.audience_type = 'school'
                OR school_events.class_id = classes.id
                OR (
                  school_events.audience_type = 'grade'
                  AND school_events.grade_id = classes.grade_id
                  AND school_events.academic_year_id = classes.academic_year_id
                )
              )
          )
      ),
      '[]'::jsonb
    ),
    'schedules',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'year', academic_years.year,
            'grade', grades.name,
            'className', classes.name,
            'dayOfWeek', class_schedules.day_of_week,
            'startsAt', class_schedules.starts_at,
            'endsAt', class_schedules.ends_at,
            'subject', school_subjects.name,
            'teacher', users.display_name
          )
          ORDER BY academic_years.year DESC,
                   class_schedules.day_of_week,
                   class_schedules.starts_at
        )
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
        LEFT JOIN users ON users.id = class_schedules.teacher_id
        WHERE student_enrollments.school_id = profile_student.school_id
          AND student_enrollments.student_id = profile_student.id
      ),
      '[]'::jsonb
    )
  ) AS student_profile
FROM students AS profile_student;

REVOKE ALL ON student_profiles FROM PUBLIC;

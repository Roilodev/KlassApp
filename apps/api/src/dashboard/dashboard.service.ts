import { Injectable } from '@nestjs/common';
import type { SchoolRole } from '../auth/roles.decorator.js';
import { DatabaseService } from '../database/database.service.js';

export interface DashboardSummary {
  students: number;
  classes: number;
  subjects: number;
  teachers: number | null;
  activeTeachers: number | null;
  requiredTeachers: number | null;
  configuredSubjectFrequencies: number | null;
  requiredSubjectLessons: number | null;
  scheduledSubjectLessons: number | null;
  coveredSubjectLessons: number | null;
  unconfiguredSubjectFrequencies: number | null;
  unassignedSubjectPeriods: number | null;
  excessSubjectPeriods: number | null;
  classesWithoutSubjectFrequencies: number | null;
  classesWithoutConfiguredSessionPeriods: number | null;
  schedules: number;
  classesWithIncompleteSchedules: number | null;
  events: number | null;
  assessments: number;
  behaviorRecords: number;
  studentsMissingResponsible: number | null;
  activeAssignedTeachers: number | null;
  configuredEvents: number | null;
  morningSessionPeriods: number | null;
  afternoonSessionPeriods: number | null;
  nightSessionPeriods: number | null;
  configuredStudents: number | null;
}

export interface DashboardObservation {
  type:
    | 'subjects-without-teachers'
    | 'classes-without-students'
    | 'classes-without-schedules'
    | 'classes-without-teachers'
    | 'classes-with-unassigned-subject-periods'
    | 'classes-with-excess-subject-periods'
    | 'classes-with-unconfigured-subject-frequencies'
    | 'classes-without-session-periods'
    | 'subject-lessons-without-schedules'
    | 'subject-lessons-without-teachers'
    | 'students-without-responsible';
  title: string;
  href: string;
  items: string[];
}

interface DashboardSummaryRow {
  students: number;
  classes: number;
  subjects: number;
  teachers: number | null;
  active_teachers: number | null;
  required_teachers: number | null;
  configured_subject_frequencies: number | null;
  required_subject_lessons: number | null;
  scheduled_subject_lessons: number | null;
  covered_subject_lessons: number | null;
  unconfigured_subject_frequencies: number | null;
  unassigned_subject_periods: number | null;
  excess_subject_periods: number | null;
  classes_without_subject_frequencies: number | null;
  classes_without_configured_session_periods: number | null;
  schedules: number;
  classes_with_incomplete_schedules: number | null;
  events: number | null;
  assessments: number;
  behavior_records: number;
  students_missing_responsible: number | null;
  active_assigned_teachers: number | null;
  configured_events: number | null;
  morning_session_periods: number | null;
  afternoon_session_periods: number | null;
  night_session_periods: number | null;
  configured_students: number | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async getSummary(
    schoolId: string,
    userId: string,
    role: SchoolRole,
  ): Promise<DashboardSummary> {
    const result = await this.database.query<DashboardSummaryRow>(
      `WITH class_subject_coverage AS (
         SELECT school_subject_grades.weekly_frequency,
                count(class_schedules.id)::integer AS scheduled_lessons,
                count(class_schedules.id) FILTER (
                  WHERE class_schedules.teacher_id IS NOT NULL
                    AND school_memberships.is_active = true
                )::integer AS covered_lessons
         FROM school_subject_grades
         JOIN classes
           ON classes.school_id = school_subject_grades.school_id
          AND classes.grade_id = school_subject_grades.grade_id
         LEFT JOIN class_schedules
           ON class_schedules.school_id = classes.school_id
          AND class_schedules.class_id = classes.id
          AND class_schedules.subject_id = school_subject_grades.subject_id
          AND class_schedules.day_of_week BETWEEN 1 AND 5
         LEFT JOIN school_memberships
           ON school_memberships.school_id = class_schedules.school_id
          AND school_memberships.user_id = class_schedules.teacher_id
          AND school_memberships.role = 'teacher'
          AND school_memberships.is_active = true
         WHERE school_subject_grades.school_id = $1
         GROUP BY school_subject_grades.school_id,
                  school_subject_grades.subject_id,
                  school_subject_grades.grade_id,
                  school_subject_grades.weekly_frequency,
                  classes.id
       ),
       subject_coverage_totals AS (
         SELECT COALESCE(SUM(weekly_frequency), 0)::integer AS required_lessons,
                COALESCE(SUM(
                  CASE WHEN weekly_frequency IS NOT NULL
                    THEN LEAST(weekly_frequency, scheduled_lessons) ELSE 0
                  END
                ), 0)::integer
                  AS scheduled_lessons,
                COALESCE(SUM(
                  CASE WHEN weekly_frequency IS NOT NULL
                    THEN LEAST(weekly_frequency, covered_lessons) ELSE 0
                  END
                ), 0)::integer
                  AS covered_lessons,
                count(*) FILTER (WHERE weekly_frequency IS NULL)::integer
                  AS unconfigured_frequencies
         FROM class_subject_coverage
       ),
       grade_frequency_totals AS (
         SELECT grade_id,
                COALESCE(SUM(weekly_frequency), 0)::integer AS weekly_lessons,
                count(*)::integer AS subject_count,
                count(*) FILTER (WHERE weekly_frequency IS NULL)::integer
                  AS unconfigured_frequencies
         FROM school_subject_grades
         WHERE school_id = $1
         GROUP BY grade_id
       ),
       session_weekly_capacity AS (
         SELECT session, count(*)::integer * 5 AS weekly_periods
         FROM school_class_session_periods
         WHERE school_id = $1
         GROUP BY session
       ),
       class_weekly_plan AS (
         SELECT classes.id,
                session_weekly_capacity.weekly_periods,
                COALESCE(grade_frequency_totals.weekly_lessons, 0)::integer
                  AS planned_lessons,
                COALESCE(grade_frequency_totals.subject_count, 0)::integer
                  AS subject_count,
                COALESCE(grade_frequency_totals.unconfigured_frequencies, 0)::integer
                  AS unconfigured_frequencies
         FROM classes
         LEFT JOIN session_weekly_capacity
           ON session_weekly_capacity.session = classes.session
         LEFT JOIN grade_frequency_totals
           ON grade_frequency_totals.grade_id = classes.grade_id
         WHERE classes.school_id = $1
       ),
       weekly_plan_totals AS (
         SELECT COALESCE(
                  SUM(GREATEST(weekly_periods - planned_lessons, 0))
                    FILTER (WHERE weekly_periods IS NOT NULL),
                  0
                )::integer AS unassigned_periods,
                COALESCE(
                  SUM(GREATEST(planned_lessons - weekly_periods, 0))
                    FILTER (WHERE weekly_periods IS NOT NULL),
                  0
                )::integer AS excess_periods,
                count(*) FILTER (
                  WHERE subject_count = 0 OR unconfigured_frequencies > 0
                )::integer AS classes_without_frequencies,
                count(*) FILTER (WHERE weekly_periods IS NULL)::integer
                  AS classes_without_session_periods
         FROM class_weekly_plan
       )
       SELECT
         (
           SELECT count(DISTINCT students.id)::integer
           FROM students
           JOIN student_enrollments
             ON student_enrollments.school_id = students.school_id
            AND student_enrollments.student_id = students.id
            AND student_enrollments.status = 'active'
           WHERE students.school_id = $1
            AND students.is_active = true
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = student_enrollments.school_id
                 AND teacher_class_assignments.class_id = student_enrollments.class_id
                 AND teacher_class_assignments.user_id = $2
             ))
         ) AS students,
         (
           SELECT count(*)::integer FROM classes
           WHERE classes.school_id = $1
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = classes.school_id
                 AND teacher_class_assignments.class_id = classes.id
                 AND teacher_class_assignments.user_id = $2
             ))
         ) AS classes,
         (
           SELECT count(*)::integer FROM school_subjects
           WHERE school_subjects.school_id = $1
         ) AS subjects,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT (
             SELECT count(*) FROM school_memberships
             WHERE school_memberships.school_id = $1
               AND school_memberships.role = 'teacher'
           ) + (
             SELECT count(*) FROM teacher_invitations
             WHERE teacher_invitations.school_id = $1
               AND teacher_invitations.accepted_at IS NULL
               AND teacher_invitations.expires_at > now()
           )
         )::integer ELSE NULL END AS teachers,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_memberships
           WHERE school_memberships.school_id = $1
             AND school_memberships.role = 'teacher'
             AND school_memberships.is_active = true
         ) ELSE NULL END AS active_teachers,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT CASE
             WHEN demand.unconfigured_frequencies > 0 OR capacity.max_weekly_periods IS NULL THEN NULL
             WHEN demand.weekly_lessons = 0 THEN 1
             ELSE greatest(
               1,
               ceil(demand.weekly_lessons::numeric / capacity.max_weekly_periods)::integer
             )
           END
           FROM (
             SELECT count(*) FILTER (
               WHERE school_subject_grades.weekly_frequency IS NULL
             )::integer AS unconfigured_frequencies,
                    COALESCE(sum(school_subject_grades.weekly_frequency * class_count.total), 0)::integer
                      AS weekly_lessons
             FROM school_subject_grades
             JOIN (
               SELECT classes.grade_id, count(*)::integer AS total
               FROM classes
               WHERE classes.school_id = $1
               GROUP BY classes.grade_id
             ) AS class_count
               ON class_count.grade_id = school_subject_grades.grade_id
             WHERE school_subject_grades.school_id = $1
           ) AS demand
           CROSS JOIN (
             SELECT max_teacher_weekly_periods AS max_weekly_periods
             FROM schools
             WHERE id = $1
           ) AS capacity
         ) ELSE NULL END AS required_teachers,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_subjects
           WHERE school_subjects.school_id = $1
             AND EXISTS (
               SELECT 1 FROM school_subject_grades
               WHERE school_subject_grades.school_id = school_subjects.school_id
                 AND school_subject_grades.subject_id = school_subjects.id
                 AND school_subject_grades.weekly_frequency IS NOT NULL
             )
             AND NOT EXISTS (
               SELECT 1 FROM school_subject_grades
               WHERE school_subject_grades.school_id = school_subjects.school_id
                 AND school_subject_grades.subject_id = school_subjects.id
                 AND school_subject_grades.weekly_frequency IS NULL
             )
         ) ELSE NULL END AS configured_subject_frequencies,
         (
           SELECT count(*)::integer FROM class_schedules
           WHERE class_schedules.school_id = $1
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = class_schedules.school_id
                 AND teacher_class_assignments.class_id = class_schedules.class_id
                 AND teacher_class_assignments.user_id = $2
             ))
         ) AS schedules,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM classes
           WHERE classes.school_id = $1
             AND (
               NOT EXISTS (
                 SELECT 1 FROM school_subject_grades
                 WHERE school_subject_grades.school_id = classes.school_id
                   AND school_subject_grades.grade_id = classes.grade_id
               )
               OR EXISTS (
                 SELECT 1 FROM school_subject_grades
                 WHERE school_subject_grades.school_id = classes.school_id
                   AND school_subject_grades.grade_id = classes.grade_id
                   AND (
                     school_subject_grades.weekly_frequency IS NULL
                     OR (
                       SELECT count(*) FROM class_schedules
                       WHERE class_schedules.school_id = classes.school_id
                         AND class_schedules.class_id = classes.id
                         AND class_schedules.subject_id = school_subject_grades.subject_id
                         AND class_schedules.day_of_week BETWEEN 1 AND 5
                     ) <> school_subject_grades.weekly_frequency
                   )
               )
               OR EXISTS (
                 SELECT 1 FROM class_schedules
                 WHERE class_schedules.school_id = classes.school_id
                   AND class_schedules.class_id = classes.id
                   AND class_schedules.day_of_week BETWEEN 1 AND 5
                   AND NOT EXISTS (
                     SELECT 1 FROM school_subject_grades
                     WHERE school_subject_grades.school_id = classes.school_id
                       AND school_subject_grades.grade_id = classes.grade_id
                       AND school_subject_grades.subject_id = class_schedules.subject_id
                   )
               )
             )
         ) ELSE NULL END AS classes_with_incomplete_schedules,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_events
           WHERE school_events.school_id = $1
             AND school_events.status <> 'draft'
         ) ELSE NULL END AS events,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_events
           WHERE school_events.school_id = $1
         ) ELSE NULL END AS configured_events,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_class_session_periods
           WHERE school_class_session_periods.school_id = $1
             AND school_class_session_periods.session = 'morning'
         ) ELSE NULL END AS morning_session_periods,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_class_session_periods
           WHERE school_class_session_periods.school_id = $1
             AND school_class_session_periods.session = 'afternoon'
         ) ELSE NULL END AS afternoon_session_periods,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM school_class_session_periods
           WHERE school_class_session_periods.school_id = $1
             AND school_class_session_periods.session = 'night'
         ) ELSE NULL END AS night_session_periods,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(*)::integer FROM students
           WHERE students.school_id = $1
         ) ELSE NULL END AS configured_students,
         (
           SELECT count(*)::integer FROM assessments
           WHERE assessments.school_id = $1
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = assessments.school_id
                 AND teacher_class_assignments.class_id = assessments.class_id
                 AND teacher_class_assignments.user_id = $2
             ))
         ) AS assessments,
         (
           SELECT count(*)::integer FROM behavior_records
           WHERE behavior_records.school_id = $1
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = behavior_records.school_id
                 AND teacher_class_assignments.class_id = behavior_records.class_id
                 AND teacher_class_assignments.user_id = $2
             ))
         ) AS behavior_records,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(DISTINCT students.id)::integer
           FROM students
           JOIN student_enrollments
             ON student_enrollments.school_id = students.school_id
            AND student_enrollments.student_id = students.id
            AND student_enrollments.status = 'active'
           WHERE students.school_id = $1
             AND students.is_active = true
             AND NOT EXISTS (
               SELECT 1 FROM student_responsibles
               WHERE student_responsibles.school_id = students.school_id
                 AND student_responsibles.student_id = students.id
             )
         ) ELSE NULL END AS students_missing_responsible,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT count(DISTINCT school_memberships.user_id)::integer
           FROM school_memberships
           JOIN teacher_class_assignments
             ON teacher_class_assignments.school_id = school_memberships.school_id
            AND teacher_class_assignments.user_id = school_memberships.user_id
           WHERE school_memberships.school_id = $1
             AND school_memberships.role = 'teacher'
             AND school_memberships.is_active = true
         ) ELSE NULL END AS active_assigned_teachers,
         CASE WHEN $3::text = 'admin'
           THEN subject_coverage_totals.required_lessons ELSE NULL
         END AS required_subject_lessons,
         CASE WHEN $3::text = 'admin'
           THEN subject_coverage_totals.scheduled_lessons ELSE NULL
         END AS scheduled_subject_lessons,
         CASE WHEN $3::text = 'admin'
           THEN subject_coverage_totals.covered_lessons ELSE NULL
         END AS covered_subject_lessons,
         CASE WHEN $3::text = 'admin'
           THEN subject_coverage_totals.unconfigured_frequencies ELSE NULL
         END AS unconfigured_subject_frequencies,
         CASE WHEN $3::text = 'admin'
           THEN weekly_plan_totals.unassigned_periods ELSE NULL
         END AS unassigned_subject_periods,
         CASE WHEN $3::text = 'admin'
           THEN weekly_plan_totals.excess_periods ELSE NULL
         END AS excess_subject_periods,
         CASE WHEN $3::text = 'admin'
           THEN weekly_plan_totals.classes_without_frequencies ELSE NULL
         END AS classes_without_subject_frequencies,
         CASE WHEN $3::text = 'admin'
           THEN weekly_plan_totals.classes_without_session_periods ELSE NULL
         END AS classes_without_configured_session_periods
       FROM subject_coverage_totals
       CROSS JOIN weekly_plan_totals`,
      [schoolId, userId, role],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Não foi possível carregar os indicadores da escola.');
    }

    return {
      students: row.students,
      classes: row.classes,
      subjects: row.subjects,
      teachers: row.teachers,
      activeTeachers: row.active_teachers,
      requiredTeachers: row.required_teachers,
      configuredSubjectFrequencies: row.configured_subject_frequencies,
      requiredSubjectLessons: row.required_subject_lessons,
      scheduledSubjectLessons: row.scheduled_subject_lessons,
      coveredSubjectLessons: row.covered_subject_lessons,
      unconfiguredSubjectFrequencies: row.unconfigured_subject_frequencies,
      unassignedSubjectPeriods: row.unassigned_subject_periods,
      excessSubjectPeriods: row.excess_subject_periods,
      classesWithoutSubjectFrequencies: row.classes_without_subject_frequencies,
      classesWithoutConfiguredSessionPeriods: row.classes_without_configured_session_periods,
      schedules: row.schedules,
      classesWithIncompleteSchedules: row.classes_with_incomplete_schedules,
      events: row.events,
      assessments: row.assessments,
      behaviorRecords: row.behavior_records,
      studentsMissingResponsible: row.students_missing_responsible,
      activeAssignedTeachers: row.active_assigned_teachers,
      configuredEvents: row.configured_events,
      morningSessionPeriods: row.morning_session_periods,
      afternoonSessionPeriods: row.afternoon_session_periods,
      nightSessionPeriods: row.night_session_periods,
      configuredStudents: row.configured_students,
    };
  }

  async getObservations(schoolId: string): Promise<DashboardObservation[]> {
    const result = await this.database.query<{
      type: DashboardObservation['type'];
      item: string;
    }>(
      `SELECT 'subjects-without-teachers'::text AS type,
              school_subjects.name AS item
       FROM school_subjects
       WHERE school_subjects.school_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM teacher_subject_assignments
           JOIN school_memberships
             ON school_memberships.school_id = teacher_subject_assignments.school_id
            AND school_memberships.user_id = teacher_subject_assignments.user_id
            AND school_memberships.role = 'teacher'
            AND school_memberships.is_active = true
           WHERE teacher_subject_assignments.school_id = school_subjects.school_id
             AND teacher_subject_assignments.subject_id = school_subjects.id
         )
       UNION ALL
       SELECT 'classes-without-students'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year || ')'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM student_enrollments
           JOIN students
             ON students.school_id = student_enrollments.school_id
            AND students.id = student_enrollments.student_id
            AND students.is_active = true
           WHERE student_enrollments.school_id = classes.school_id
             AND student_enrollments.class_id = classes.id
             AND student_enrollments.status = 'active'
         )
       UNION ALL
       SELECT 'classes-without-schedules'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year || ')'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM class_schedules
           WHERE class_schedules.school_id = classes.school_id
             AND class_schedules.class_id = classes.id
         )
       UNION ALL
       SELECT 'classes-without-teachers'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year || ')'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM teacher_class_assignments
           JOIN school_memberships
             ON school_memberships.school_id = teacher_class_assignments.school_id
            AND school_memberships.user_id = teacher_class_assignments.user_id
            AND school_memberships.role = 'teacher'
            AND school_memberships.is_active = true
           WHERE teacher_class_assignments.school_id = classes.school_id
             AND teacher_class_assignments.class_id = classes.id
         )
       UNION ALL
       SELECT DISTINCT 'students-without-responsible'::text, students.full_name
       FROM students
       JOIN student_enrollments
         ON student_enrollments.school_id = students.school_id
        AND student_enrollments.student_id = students.id
        AND student_enrollments.status = 'active'
       WHERE students.school_id = $1
         AND students.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM student_responsibles
           WHERE student_responsibles.school_id = students.school_id
             AND student_responsibles.student_id = students.id
         )
       UNION ALL
       SELECT 'classes-with-unassigned-subject-periods'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year ||
              ') — ' || (
                session_capacity.weekly_periods - frequency_totals.weekly_lessons
              ) || ' períodos sem matéria'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       JOIN LATERAL (
         SELECT count(*)::integer * 5 AS weekly_periods
         FROM school_class_session_periods
         WHERE school_class_session_periods.school_id = classes.school_id
           AND school_class_session_periods.session = classes.session
       ) AS session_capacity ON session_capacity.weekly_periods > 0
       CROSS JOIN LATERAL (
         SELECT COALESCE(sum(school_subject_grades.weekly_frequency), 0)::integer
                  AS weekly_lessons
         FROM school_subject_grades
         WHERE school_subject_grades.school_id = classes.school_id
           AND school_subject_grades.grade_id = classes.grade_id
       ) AS frequency_totals
       WHERE classes.school_id = $1
         AND frequency_totals.weekly_lessons < session_capacity.weekly_periods
       UNION ALL
       SELECT 'classes-with-excess-subject-periods'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year ||
              ') — ' || (
                frequency_totals.weekly_lessons - session_capacity.weekly_periods
              ) || ' períodos acima da capacidade'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       JOIN LATERAL (
         SELECT count(*)::integer * 5 AS weekly_periods
         FROM school_class_session_periods
         WHERE school_class_session_periods.school_id = classes.school_id
           AND school_class_session_periods.session = classes.session
       ) AS session_capacity ON session_capacity.weekly_periods > 0
       CROSS JOIN LATERAL (
         SELECT COALESCE(sum(school_subject_grades.weekly_frequency), 0)::integer
                  AS weekly_lessons
         FROM school_subject_grades
         WHERE school_subject_grades.school_id = classes.school_id
           AND school_subject_grades.grade_id = classes.grade_id
       ) AS frequency_totals
       WHERE classes.school_id = $1
         AND frequency_totals.weekly_lessons > session_capacity.weekly_periods
       UNION ALL
       SELECT 'classes-with-unconfigured-subject-frequencies'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year || ')'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1
         AND (
           NOT EXISTS (
             SELECT 1 FROM school_subject_grades
             WHERE school_subject_grades.school_id = classes.school_id
               AND school_subject_grades.grade_id = classes.grade_id
           )
           OR EXISTS (
             SELECT 1 FROM school_subject_grades
             WHERE school_subject_grades.school_id = classes.school_id
               AND school_subject_grades.grade_id = classes.grade_id
               AND school_subject_grades.weekly_frequency IS NULL
           )
         )
       UNION ALL
       SELECT 'classes-without-session-periods'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year || ')'
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM school_class_session_periods
           WHERE school_class_session_periods.school_id = classes.school_id
             AND school_class_session_periods.session = classes.session
         )
       UNION ALL
       SELECT 'subject-lessons-without-schedules'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year ||
              ') · ' || school_subjects.name || ' — ' || (
                school_subject_grades.weekly_frequency - COALESCE(schedule_count.total, 0)
              ) || CASE
                WHEN school_subject_grades.weekly_frequency - COALESCE(schedule_count.total, 0) = 1
                  THEN ' aula sem horário'
                ELSE ' aulas sem horário'
              END
       FROM school_subject_grades
       JOIN school_subjects
         ON school_subjects.school_id = school_subject_grades.school_id
        AND school_subjects.id = school_subject_grades.subject_id
       JOIN classes
         ON classes.school_id = school_subject_grades.school_id
        AND classes.grade_id = school_subject_grades.grade_id
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       CROSS JOIN LATERAL (
         SELECT count(*)::integer AS total
         FROM class_schedules
         WHERE class_schedules.school_id = classes.school_id
           AND class_schedules.class_id = classes.id
           AND class_schedules.subject_id = school_subject_grades.subject_id
           AND class_schedules.day_of_week BETWEEN 1 AND 5
       ) AS schedule_count
       WHERE school_subject_grades.school_id = $1
         AND school_subject_grades.weekly_frequency IS NOT NULL
         AND schedule_count.total < school_subject_grades.weekly_frequency
       UNION ALL
       SELECT 'subject-lessons-without-teachers'::text,
              grades.name || ' · Turma ' || classes.name || ' (' || academic_years.year ||
              ') · ' || school_subjects.name || ' — ' || count(class_schedules.id) ||
              CASE WHEN count(class_schedules.id) = 1
                THEN ' aula sem professor'
                ELSE ' aulas sem professor'
              END
       FROM class_schedules
       JOIN classes
         ON classes.school_id = class_schedules.school_id
        AND classes.id = class_schedules.class_id
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       JOIN school_subjects
         ON school_subjects.school_id = class_schedules.school_id
        AND school_subjects.id = class_schedules.subject_id
       LEFT JOIN school_memberships
         ON school_memberships.school_id = class_schedules.school_id
        AND school_memberships.user_id = class_schedules.teacher_id
        AND school_memberships.role = 'teacher'
        AND school_memberships.is_active = true
       WHERE class_schedules.school_id = $1
         AND class_schedules.day_of_week BETWEEN 1 AND 5
         AND school_memberships.user_id IS NULL
       GROUP BY classes.id, academic_years.year, grades.name, school_subjects.name
       ORDER BY type, item`,
      [schoolId],
    );
    const definitions: Array<Pick<DashboardObservation, 'type' | 'title' | 'href'>> = [
      { type: 'subjects-without-teachers', title: 'Matérias sem professor', href: '/materias' },
      { type: 'classes-without-students', title: 'Turmas sem alunos', href: '/turmas' },
      { type: 'classes-without-schedules', title: 'Turmas sem horário definido', href: '/turmas' },
      { type: 'classes-without-teachers', title: 'Turmas sem professor', href: '/professores' },
      {
        type: 'classes-with-unassigned-subject-periods',
        title: 'Espaços semanais sem matéria',
        href: '/materias',
      },
      {
        type: 'classes-with-excess-subject-periods',
        title: 'Frequências acima dos períodos',
        href: '/materias',
      },
      {
        type: 'classes-with-unconfigured-subject-frequencies',
        title: 'Turmas com frequências pendentes',
        href: '/materias',
      },
      {
        type: 'classes-without-session-periods',
        title: 'Turmas sem períodos configurados',
        href: '/configuracao',
      },
      {
        type: 'subject-lessons-without-schedules',
        title: 'Aulas de matérias sem horário',
        href: '/turmas',
      },
      {
        type: 'subject-lessons-without-teachers',
        title: 'Aulas sem professor atribuído',
        href: '/turmas',
      },
      { type: 'students-without-responsible', title: 'Alunos sem responsável', href: '/alunos' },
    ];
    const itemsByType = new Map<DashboardObservation['type'], string[]>();
    for (const row of result.rows) {
      const items = itemsByType.get(row.type) ?? [];
      items.push(row.item);
      itemsByType.set(row.type, items);
    }

    return definitions.flatMap((definition) => {
      const items = itemsByType.get(definition.type);
      return items?.length ? [{ ...definition, items }] : [];
    });
  }
}

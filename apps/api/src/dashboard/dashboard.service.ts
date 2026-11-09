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
  schedules: number;
  events: number | null;
  assessments: number;
  behaviorRecords: number;
  studentsMissingResponsible: number | null;
  activeAssignedTeachers: number | null;
  configuredEvents: number | null;
  morningSessionPeriods: number | null;
  afternoonSessionPeriods: number | null;
  configuredStudents: number | null;
}

export interface DashboardObservation {
  type:
    | 'subjects-without-teachers'
    | 'classes-without-students'
    | 'classes-without-schedules'
    | 'classes-without-teachers'
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
  schedules: number;
  events: number | null;
  assessments: number;
  behavior_records: number;
  students_missing_responsible: number | null;
  active_assigned_teachers: number | null;
  configured_events: number | null;
  morning_session_periods: number | null;
  afternoon_session_periods: number | null;
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
      `SELECT
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
           SELECT count(*)::integer FROM school_subjects
           WHERE school_subjects.school_id = $1
             AND school_subjects.weekly_frequency IS NOT NULL
         ) ELSE NULL END AS configured_subject_frequencies,
         CASE WHEN $3::text = 'admin' THEN (
           SELECT CASE
             WHEN demand.unconfigured_frequencies > 0 OR capacity.weekly_periods = 0 THEN NULL
             WHEN demand.weekly_lessons = 0 THEN 1
             ELSE greatest(1, ceil(demand.weekly_lessons::numeric / capacity.weekly_periods)::integer)
           END
           FROM (
             SELECT count(*) FILTER (
               WHERE school_subjects.weekly_frequency IS NULL
             )::integer AS unconfigured_frequencies,
                    COALESCE(sum(school_subjects.weekly_frequency * class_count.total), 0)::integer
                      AS weekly_lessons
             FROM school_subjects
             CROSS JOIN (
               SELECT count(*)::integer AS total
               FROM classes
               WHERE classes.school_id = $1
             ) AS class_count
             WHERE school_subjects.school_id = $1
           ) AS demand
           CROSS JOIN (
             SELECT (
               SELECT count(*) FROM school_class_session_periods
               WHERE school_id = $1
             ) * 5 AS weekly_periods
           ) AS capacity
         ) ELSE NULL END AS required_teachers,
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
         ) ELSE NULL END AS active_assigned_teachers`,
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
      schedules: row.schedules,
      events: row.events,
      assessments: row.assessments,
      behaviorRecords: row.behavior_records,
      studentsMissingResponsible: row.students_missing_responsible,
      activeAssignedTeachers: row.active_assigned_teachers,
      configuredEvents: row.configured_events,
      morningSessionPeriods: row.morning_session_periods,
      afternoonSessionPeriods: row.afternoon_session_periods,
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
       ORDER BY type, item`,
      [schoolId],
    );
    const definitions: Array<Pick<DashboardObservation, 'type' | 'title' | 'href'>> = [
      { type: 'subjects-without-teachers', title: 'Matérias sem professor', href: '/materias' },
      { type: 'classes-without-students', title: 'Turmas sem alunos', href: '/turmas' },
      { type: 'classes-without-schedules', title: 'Turmas sem horário definido', href: '/horarios' },
      { type: 'classes-without-teachers', title: 'Turmas sem professor', href: '/professores' },
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

import { Injectable } from '@nestjs/common';
import type { SchoolRole } from '../auth/roles.decorator.js';
import { DatabaseService } from '../database/database.service.js';

export interface DashboardSummary {
  students: number;
  classes: number;
  teachers: number | null;
  schedules: number;
  events: number | null;
  assessments: number;
  behaviorRecords: number;
  studentsMissingResponsible: number | null;
  activeAssignedTeachers: number | null;
}

interface DashboardSummaryRow {
  students: number;
  classes: number;
  teachers: number | null;
  schedules: number;
  events: number | null;
  assessments: number;
  behavior_records: number;
  students_missing_responsible: number | null;
  active_assigned_teachers: number | null;
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
         ) ELSE NULL END AS events,
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
      teachers: row.teachers,
      schedules: row.schedules,
      events: row.events,
      assessments: row.assessments,
      behaviorRecords: row.behavior_records,
      studentsMissingResponsible: row.students_missing_responsible,
      activeAssignedTeachers: row.active_assigned_teachers,
    };
  }
}

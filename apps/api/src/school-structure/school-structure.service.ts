import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SchoolClass {
  id: string;
  year: number;
  grade: string;
  name: string;
  session?: 'morning' | 'afternoon';
  students?: Array<{ id: string; fullName: string }>;
}

export interface SessionScheduleChange {
  id: string;
  startsAt: string;
  endsAt: string;
  teacherId: string | null;
}

export interface SessionTeacherConflict {
  scheduleId: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  teacherName: string;
  conflictingClass: string;
  conflictingSubject: string;
  dayOfWeek: number;
}

interface ClassSessionPeriodRow {
  session: 'morning' | 'afternoon';
  starts_at: string;
  ends_at: string;
  period_order: number;
}

interface ClassScheduleToMove {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  teacher_id: string | null;
  subject: string;
}

export interface SchoolClassRoster {
  classId: string;
  students: Array<{ id: string; fullName: string }>;
  teachers: Array<{ id: string; fullName: string }>;
}

export interface CreateSchoolClassInput {
  year: number;
  grade: string;
  name: string;
  session?: 'morning' | 'afternoon';
  allowTeacherConflictsWithoutTeacher?: boolean;
  confirmedTeacherConflictScheduleIds?: string[];
}

function validateClassInput(input: CreateSchoolClassInput) {
  if (!input || typeof input !== 'object') {
    throw new BadRequestException('Informe o ano, o ano escolar e a turma.');
  }
  if (
    typeof input.grade !== 'string' ||
    typeof input.name !== 'string' ||
    typeof input.year !== 'number'
  ) {
    throw new BadRequestException('Informe o ano, o ano escolar e a turma.');
  }
  const grade = input.grade.trim();
  const name = input.name.trim();
  const session = input.session;

  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) {
    throw new BadRequestException('Informe um ano letivo válido.');
  }
  if (session !== undefined && session !== 'morning' && session !== 'afternoon') {
    throw new BadRequestException('Informe uma sessão válida para a turma.');
  }
  if (grade.length < 1 || grade.length > 80) {
    throw new BadRequestException('O ano escolar deve ter entre 1 e 80 caracteres.');
  }
  if (name.length < 1 || name.length > 40) {
    throw new BadRequestException('A turma deve ter entre 1 e 40 caracteres.');
  }
  return { year: input.year, grade, name, session };
}

@Injectable()
export class SchoolStructureService {
  constructor(private readonly database: DatabaseService) {}

  async listClasses(schoolId: string): Promise<SchoolClass[]> {
    const result = await this.database.query<{
      id: string;
      year: number;
      grade: string;
      name: string;
      session: 'morning' | 'afternoon';
    }>(
      `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name, classes.session
       FROM classes
       JOIN academic_years
         ON academic_years.id = classes.academic_year_id
        AND academic_years.school_id = classes.school_id
       JOIN grades
         ON grades.id = classes.grade_id
        AND grades.school_id = classes.school_id
       WHERE classes.school_id = $1
       ORDER BY academic_years.year DESC, grades.name, classes.name`,
      [schoolId],
    );
    return result.rows;
  }

  async listClassRosters(schoolId: string): Promise<SchoolClassRoster[]> {
    const result = await this.database.query<SchoolClassRoster>(
      `SELECT classes.id AS "classId",
              COALESCE(class_students.students, '[]'::json) AS students,
              COALESCE(class_teachers.teachers, '[]'::json) AS teachers
       FROM classes
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object('id', students.id, 'fullName', students.full_name)
                  ORDER BY students.full_name
                ) AS students
         FROM student_enrollments
         JOIN students
           ON students.school_id = student_enrollments.school_id
          AND students.id = student_enrollments.student_id
         WHERE student_enrollments.school_id = classes.school_id
           AND student_enrollments.class_id = classes.id
           AND student_enrollments.status = 'active'
           AND students.is_active = true
       ) AS class_students ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object('id', users.id, 'fullName', users.display_name)
                  ORDER BY users.display_name
                ) AS teachers
         FROM teacher_class_assignments
         JOIN school_memberships
           ON school_memberships.school_id = teacher_class_assignments.school_id
          AND school_memberships.user_id = teacher_class_assignments.user_id
          AND school_memberships.role = 'teacher'
          AND school_memberships.is_active = true
         JOIN users ON users.id = school_memberships.user_id
         WHERE teacher_class_assignments.school_id = classes.school_id
           AND teacher_class_assignments.class_id = classes.id
       ) AS class_teachers ON true
       WHERE classes.school_id = $1
       `,
      [schoolId],
    );
    return result.rows;
  }

  async createClass(
    schoolId: string,
    input: CreateSchoolClassInput,
  ): Promise<SchoolClass> {
    const { year, grade, name } = validateClassInput(input);
    const session = input.session ?? 'morning';

    const result = await this.database.query<{
      id: string;
      year: number;
      grade: string;
      name: string;
      session: 'morning' | 'afternoon';
    }>(
      `WITH school_year AS (
         INSERT INTO academic_years (school_id, year)
         VALUES ($1, $2)
         ON CONFLICT (school_id, year)
         DO UPDATE SET year = EXCLUDED.year
         RETURNING id, year
       ),
       school_grade AS (
         INSERT INTO grades (school_id, name)
         VALUES ($1, $3)
         ON CONFLICT (school_id, name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name
       ),
       school_class AS (
         INSERT INTO classes (school_id, academic_year_id, grade_id, name, session)
         SELECT $1, school_year.id, school_grade.id, $4, $5
         FROM school_year CROSS JOIN school_grade
         ON CONFLICT (school_id, academic_year_id, grade_id, name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id, academic_year_id, grade_id, name, session
       )
       SELECT school_class.id, school_year.year, school_grade.name AS grade,
              school_class.name, school_class.session
       FROM school_class
       JOIN school_year ON school_year.id = school_class.academic_year_id
       JOIN school_grade ON school_grade.id = school_class.grade_id`,
      [schoolId, year, grade, name, session],
    );

    const created = result.rows[0];
    if (!created) {
      throw new Error('Não foi possível salvar a turma.');
    }
    return created;
  }

  async updateClass(
    schoolId: string,
    actorId: string,
    classId: string,
    input: CreateSchoolClassInput,
  ): Promise<SchoolClass & { rescheduledSchedules: SessionScheduleChange[] }> {
    if (!UUID_PATTERN.test(classId)) {
      throw new BadRequestException('Informe uma turma válida.');
    }
    const allowTeacherConflictsWithoutTeacher =
      input.allowTeacherConflictsWithoutTeacher ?? false;
    if (typeof allowTeacherConflictsWithoutTeacher !== 'boolean') {
      throw new BadRequestException('Informe uma opção válida para conflitos de professores.');
    }
    const confirmedTeacherConflictScheduleIds =
      input.confirmedTeacherConflictScheduleIds ?? [];
    if (
      !Array.isArray(confirmedTeacherConflictScheduleIds) ||
      confirmedTeacherConflictScheduleIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
    ) {
      throw new BadRequestException('Informe as aulas com conflitos de professores válidas.');
    }
    const { year, grade, name, session: requestedSession } = validateClassInput(input);

    try {
      return await this.database.transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), 0)', [schoolId]);
        const existing = await client.query<SchoolClass>(
          `SELECT classes.id, academic_years.year, grades.name AS grade,
                  classes.name, classes.session
           FROM classes
           JOIN academic_years
             ON academic_years.id = classes.academic_year_id
            AND academic_years.school_id = classes.school_id
           JOIN grades
             ON grades.id = classes.grade_id
            AND grades.school_id = classes.school_id
           WHERE classes.school_id = $1 AND classes.id = $2
           FOR UPDATE OF classes`,
          [schoolId, classId],
        );
        const previous = existing.rows[0];
        if (!previous) {
          throw new NotFoundException('Turma não encontrada.');
        }
        const session = requestedSession ?? previous.session ?? 'morning';
        const rescheduledSchedules = session !== (previous.session ?? 'morning')
          ? await this.rescheduleClassSchedules(
            client,
            schoolId,
            classId,
            previous.session ?? 'morning',
            session,
            allowTeacherConflictsWithoutTeacher,
            confirmedTeacherConflictScheduleIds,
          )
          : [];

        const schoolYear = await client.query<{ id: string }>(
          `INSERT INTO academic_years (school_id, year)
           VALUES ($1, $2)
           ON CONFLICT (school_id, year)
           DO UPDATE SET year = EXCLUDED.year
           RETURNING id`,
          [schoolId, year],
        );
        const schoolGrade = await client.query<{ id: string }>(
          `INSERT INTO grades (school_id, name)
           VALUES ($1, $2)
           ON CONFLICT (school_id, name)
           DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [schoolId, grade],
        );
        const targetYearId = schoolYear.rows[0]?.id;
        const targetGradeId = schoolGrade.rows[0]?.id;
        if (!targetYearId || !targetGradeId) {
          throw new Error('Não foi possível atualizar a turma.');
        }

        if (previous.year !== year) {
          const history = await client.query<{ has_history: boolean }>(
            `SELECT
               EXISTS (
                 SELECT 1 FROM student_enrollments
                 WHERE school_id = $1 AND class_id = $2
               ) OR EXISTS (
                 SELECT 1 FROM assessments
                 WHERE school_id = $1 AND class_id = $2
               ) AS has_history`,
            [schoolId, classId],
          );
          if (history.rows[0]?.has_history) {
            throw new ConflictException(
              'Não é possível alterar o ano letivo de uma turma que possui matrículas ou avaliações registradas.',
            );
          }
        }

        const updated = await client.query<SchoolClass>(
          `UPDATE classes
           SET academic_year_id = $3, grade_id = $4, name = $5, session = $8
           WHERE school_id = $1 AND id = $2
           RETURNING id, $6::integer AS year, $7::text AS grade, name, session`,
          [schoolId, classId, targetYearId, targetGradeId, name, year, grade, session],
        );
        const result = updated.rows[0];
        if (!result) {
          throw new NotFoundException('Turma não encontrada.');
        }

        await client.query(
          `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
           VALUES ($1, $2, 'class.updated', 'class', $3, $4::jsonb)`,
          [
            schoolId,
            actorId,
            classId,
            JSON.stringify({ previous, updated: result, rescheduledSchedules }),
          ],
        );
        return { ...result, rescheduledSchedules };
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Já existe uma turma com este ano letivo, ano escolar e nome.',
        );
      }
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23503' &&
        'constraint' in error &&
        (error.constraint === 'student_enrollments_school_id_class_id_academic_year_id_fkey' ||
          error.constraint === 'assessments_school_id_class_id_academic_year_id_fkey')
      ) {
        throw new ConflictException(
          'Não é possível alterar o ano letivo de uma turma que possui matrículas ou avaliações registradas.',
        );
      }
      throw error;
    }
  }

  private async rescheduleClassSchedules(
    client: PoolClient,
    schoolId: string,
    classId: string,
    sourceSession: 'morning' | 'afternoon',
    targetSession: 'morning' | 'afternoon',
    allowTeacherConflictsWithoutTeacher: boolean,
    confirmedTeacherConflictScheduleIds: string[],
  ): Promise<SessionScheduleChange[]> {
    const periods = await client.query<ClassSessionPeriodRow>(
      `SELECT session, starts_at::text AS starts_at, ends_at::text AS ends_at, period_order
       FROM school_class_session_periods
       WHERE school_id = $1 AND session IN ($2, $3)
       ORDER BY session, period_order`,
      [schoolId, sourceSession, targetSession],
    );
    const sourcePeriods = periods.rows.filter((period) => period.session === sourceSession);
    const targetPeriods = periods.rows.filter((period) => period.session === targetSession);
    const schedules = await client.query<ClassScheduleToMove>(
      `SELECT class_schedules.id, class_schedules.day_of_week,
              class_schedules.starts_at::text AS starts_at,
              class_schedules.ends_at::text AS ends_at,
              class_schedules.teacher_id, school_subjects.name AS subject
       FROM class_schedules
       JOIN school_subjects
         ON school_subjects.school_id = class_schedules.school_id
        AND school_subjects.id = class_schedules.subject_id
       WHERE class_schedules.school_id = $1 AND class_schedules.class_id = $2
       ORDER BY class_schedules.day_of_week, class_schedules.starts_at
       FOR UPDATE`,
      [schoolId, classId],
    );
    if (schedules.rowCount === 0) {
      return [];
    }

    const moves = schedules.rows.map((schedule) => {
      const sourceIndex = sourcePeriods.findIndex(
        (period) =>
          period.starts_at.slice(0, 5) === schedule.starts_at.slice(0, 5) &&
          period.ends_at.slice(0, 5) === schedule.ends_at.slice(0, 5),
      );
      const target = sourceIndex >= 0 ? targetPeriods[sourceIndex] : undefined;
      if (!target) {
        throw new ConflictException(
          'Não é possível trocar a sessão: configure turnos correspondentes para todas as aulas da turma.',
        );
      }
      return {
        ...schedule,
        targetStartsAt: target.starts_at.slice(0, 5),
        targetEndsAt: target.ends_at.slice(0, 5),
      };
    });

    const recess = await client.query<{
      starts_at: string | null;
      ends_at: string | null;
    }>(
      `SELECT ${targetSession === 'morning' ? 'starts_at' : 'afternoon_starts_at'}::text AS starts_at,
              ${targetSession === 'morning' ? 'ends_at' : 'afternoon_ends_at'}::text AS ends_at
       FROM school_recesses
       WHERE school_id = $1`,
      [schoolId],
    );
    const recessStart = recess.rows[0]?.starts_at?.slice(0, 5);
    const recessEnd = recess.rows[0]?.ends_at?.slice(0, 5);
    const teacherConflicts: SessionTeacherConflict[] = [];
    for (const move of moves) {
      if (
        move.day_of_week <= 5 && recessStart && recessEnd &&
        recessStart < move.targetEndsAt &&
        recessEnd > move.targetStartsAt
      ) {
        throw new ConflictException(
          'Não é possível trocar a sessão: uma ou mais aulas coincidem com o recreio configurado.',
        );
      }
      if (!move.teacher_id) {
        continue;
      }
      const conflict = await client.query<{
        teacher_name: string;
        class_label: string;
        subject: string;
      }>(
        `SELECT users.display_name AS teacher_name,
                grades.name || ' · Turma ' || classes.name AS class_label,
                school_subjects.name AS subject
         FROM class_schedules
         JOIN classes
           ON classes.school_id = class_schedules.school_id
          AND classes.id = class_schedules.class_id
         JOIN grades
           ON grades.school_id = classes.school_id
          AND grades.id = classes.grade_id
         JOIN school_subjects
           ON school_subjects.school_id = class_schedules.school_id
          AND school_subjects.id = class_schedules.subject_id
         JOIN users ON users.id = class_schedules.teacher_id
         WHERE class_schedules.school_id = $1
           AND class_schedules.class_id <> $2
           AND class_schedules.teacher_id = $3
           AND class_schedules.day_of_week = $4
           AND class_schedules.starts_at < $6::time
           AND class_schedules.ends_at > $5::time`,
        [
          schoolId,
          classId,
          move.teacher_id,
          move.day_of_week,
          move.targetStartsAt,
          move.targetEndsAt,
        ],
      );
      for (const existing of conflict.rows) {
        teacherConflicts.push({
          scheduleId: move.id,
          subject: move.subject,
          startsAt: move.targetStartsAt,
          endsAt: move.targetEndsAt,
          teacherName: existing.teacher_name,
          conflictingClass: existing.class_label,
          conflictingSubject: existing.subject,
          dayOfWeek: move.day_of_week,
        });
      }
    }

    const confirmedScheduleIds = new Set(confirmedTeacherConflictScheduleIds);
    const unconfirmedTeacherConflicts = allowTeacherConflictsWithoutTeacher
      ? teacherConflicts.filter((conflict) => !confirmedScheduleIds.has(conflict.scheduleId))
      : teacherConflicts;
    if (unconfirmedTeacherConflicts.length > 0) {
      throw new ConflictException({
        code: 'SESSION_TEACHER_CONFLICT',
        message: 'Um ou mais professores já têm aula no novo horário.',
        conflicts: unconfirmedTeacherConflicts,
      });
    }

    const schedulesWithoutTeacher = new Set(
      teacherConflicts
        .filter((conflict) => confirmedScheduleIds.has(conflict.scheduleId))
        .map((conflict) => conflict.scheduleId),
    );
    const changes: SessionScheduleChange[] = [];
    for (const move of moves) {
      await client.query(
        `UPDATE class_schedules
         SET starts_at = $3::time, ends_at = $4::time,
             teacher_id = CASE WHEN $5::boolean THEN NULL ELSE teacher_id END
         WHERE school_id = $1 AND id = $2`,
        [
          schoolId,
          move.id,
          move.targetStartsAt,
          move.targetEndsAt,
          schedulesWithoutTeacher.has(move.id),
        ],
      );
      changes.push({
        id: move.id,
        startsAt: move.targetStartsAt,
        endsAt: move.targetEndsAt,
        teacherId: schedulesWithoutTeacher.has(move.id) ? null : move.teacher_id,
      });
    }
    return changes;
  }
}

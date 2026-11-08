import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface CreateScheduleInput {
  classId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subjectId: string;
  teacherId?: string | null;
}

export interface ScheduleRecord {
  id: string;
  classId: string;
  subjectId: string;
  classLabel: string;
  year: number;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  teacherId: string | null;
  teacherName: string | null;
}

interface ScheduleRow {
  id: string;
  class_id: string;
  subject_id: string;
  class_label: string;
  year: number;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  subject: string;
  teacher_id: string | null;
  teacher_name: string | null;
}

interface NormalizedScheduleInput {
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  teacherId: string | null;
}

function validateScheduleInput(input: CreateScheduleInput): NormalizedScheduleInput {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.classId !== 'string' ||
    typeof input.dayOfWeek !== 'number' ||
    typeof input.startsAt !== 'string' ||
    typeof input.endsAt !== 'string' ||
    typeof input.subjectId !== 'string'
  ) {
    throw new BadRequestException('Informe os dados do horário.');
  }

  const classId = input.classId.trim();
  const subjectId = input.subjectId.trim();
  const teacherId = input.teacherId ?? null;
  if (!UUID_PATTERN.test(classId)) {
    throw new BadRequestException('Selecione uma turma válida.');
  }
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 7) {
    throw new BadRequestException('Selecione um dia da semana válido.');
  }
  if (!TIME_PATTERN.test(input.startsAt) || !TIME_PATTERN.test(input.endsAt) ||
      input.startsAt >= input.endsAt) {
    throw new BadRequestException('Informe um horário de início e fim válidos.');
  }
  if (!UUID_PATTERN.test(subjectId)) {
    throw new BadRequestException('Selecione uma matéria válida.');
  }
  if (teacherId !== null && (typeof teacherId !== 'string' || !UUID_PATTERN.test(teacherId))) {
    throw new BadRequestException('Selecione um professor válido.');
  }
  return {
    classId,
    subjectId,
    dayOfWeek: input.dayOfWeek,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    teacherId,
  };
}

function mapSchedule(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    classId: row.class_id,
    subjectId: row.subject_id,
    classLabel: row.class_label,
    year: row.year,
    dayOfWeek: row.day_of_week,
    startsAt: row.starts_at.slice(0, 5),
    endsAt: row.ends_at.slice(0, 5),
    subject: row.subject,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
  };
}

const SCHEDULE_SELECT = `SELECT class_schedules.id, class_schedules.class_id,
                                grades.name || ' · Turma ' || classes.name AS class_label,
                                academic_years.year, class_schedules.day_of_week,
                                class_schedules.starts_at::text AS starts_at,
                                class_schedules.ends_at::text AS ends_at,
                                class_schedules.subject_id, school_subjects.name AS subject,
                                class_schedules.teacher_id,
                                users.display_name AS teacher_name
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
                         LEFT JOIN users ON users.id = class_schedules.teacher_id`;

@Injectable()
export class SchedulesService {
  constructor(private readonly database: DatabaseService) {}

  async list(schoolId: string): Promise<ScheduleRecord[]> {
    const result = await this.database.query<ScheduleRow>(
      `${SCHEDULE_SELECT}
       WHERE class_schedules.school_id = $1
       ORDER BY class_schedules.day_of_week, class_schedules.starts_at,
                class_label, school_subjects.name`,
      [schoolId],
    );
    return result.rows.map(mapSchedule);
  }

  async create(
    schoolId: string,
    createdBy: string,
    input: CreateScheduleInput,
  ): Promise<ScheduleRecord> {
    const { classId, subjectId, dayOfWeek, startsAt, endsAt, teacherId } =
      validateScheduleInput(input);

    return this.database.transaction(async (client) => {
      await this.lockSchoolSchedules(client, schoolId);
      const schoolClass = await client.query(
        'SELECT id FROM classes WHERE school_id = $1 AND id = $2',
        [schoolId, classId],
      );
      if (schoolClass.rowCount !== 1) {
        throw new NotFoundException('A turma selecionada não foi encontrada.');
      }
      const schoolSubject = await client.query(
        'SELECT id FROM school_subjects WHERE school_id = $1 AND id = $2',
        [schoolId, subjectId],
      );
      if (schoolSubject.rowCount !== 1) {
        throw new NotFoundException('A matéria selecionada não foi encontrada.');
      }

      if (teacherId) {
        const assignment = await client.query(
          `SELECT 1
           FROM teacher_class_assignments
           JOIN teacher_subject_assignments
             ON teacher_subject_assignments.school_id = teacher_class_assignments.school_id
            AND teacher_subject_assignments.user_id = teacher_class_assignments.user_id
           WHERE teacher_class_assignments.school_id = $1
             AND teacher_class_assignments.class_id = $2
             AND teacher_class_assignments.user_id = $3
             AND teacher_subject_assignments.subject_id = $4`,
          [schoolId, classId, teacherId, subjectId],
        );
        if (assignment.rowCount !== 1) {
          throw new BadRequestException(
            'O professor precisa estar atribuído à turma e à matéria selecionadas.',
          );
        }
      }

      await this.assertOutsideSchoolRecess(client, schoolId, dayOfWeek, startsAt, endsAt);
      const overlapping = await client.query<{
        class_conflict: boolean;
        teacher_conflict: boolean;
      }>(
        `SELECT bool_or(class_id = $2) AS class_conflict,
                bool_or($6::uuid IS NOT NULL AND teacher_id = $6) AS teacher_conflict
         FROM class_schedules
         WHERE school_id = $1
           AND day_of_week = $3
           AND starts_at < $5::time
           AND ends_at > $4::time
           AND (class_id = $2 OR ($6::uuid IS NOT NULL AND teacher_id = $6))`,
        [schoolId, classId, dayOfWeek, startsAt, endsAt, teacherId],
      );
      const conflict = overlapping.rows[0];
      if (conflict?.class_conflict) {
        throw new ConflictException('Este horário se sobrepõe a outra atividade da turma.');
      }
      if (conflict?.teacher_conflict) {
        throw new ConflictException('Este professor já tem uma aula nesse horário.');
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO class_schedules
           (school_id, class_id, subject_id, day_of_week, starts_at, ends_at, teacher_id, created_by)
         VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8)
         RETURNING id`,
        [
          schoolId,
          classId,
          subjectId,
          dayOfWeek,
          startsAt,
          endsAt,
          teacherId,
          createdBy,
        ],
      );
      const scheduleId = inserted.rows[0]?.id;
      if (!scheduleId) {
        throw new Error('Não foi possível salvar o horário.');
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'schedule.created', 'class_schedule', $3, $4::jsonb)`,
        [
          schoolId,
          createdBy,
          scheduleId,
          JSON.stringify({ classId, dayOfWeek, subjectId }),
        ],
      );

      const result = await client.query<ScheduleRow>(
        `${SCHEDULE_SELECT}
         WHERE class_schedules.school_id = $1 AND class_schedules.id = $2`,
        [schoolId, scheduleId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('O horário salvo não pôde ser carregado.');
      }
      return mapSchedule(row);
    });
  }

  async update(
    schoolId: string,
    updatedBy: string,
    scheduleId: string,
    input: CreateScheduleInput,
  ): Promise<ScheduleRecord> {
    if (!UUID_PATTERN.test(scheduleId)) {
      throw new BadRequestException('Horário inválido.');
    }
    const { classId, subjectId, dayOfWeek, startsAt, endsAt, teacherId } =
      validateScheduleInput(input);

    return this.database.transaction(async (client) => {
      await this.lockSchoolSchedules(client, schoolId);
      const existing = await client.query<ScheduleRow>(
        `${SCHEDULE_SELECT}
         WHERE class_schedules.school_id = $1 AND class_schedules.id = $2
         FOR UPDATE OF class_schedules`,
        [schoolId, scheduleId],
      );
      const previous = existing.rows[0];
      if (!previous) {
        throw new NotFoundException('O horário não foi encontrado.');
      }

      const schoolClass = await client.query(
        'SELECT id FROM classes WHERE school_id = $1 AND id = $2',
        [schoolId, classId],
      );
      if (schoolClass.rowCount !== 1) {
        throw new NotFoundException('A turma selecionada não foi encontrada.');
      }
      const schoolSubject = await client.query(
        'SELECT id FROM school_subjects WHERE school_id = $1 AND id = $2',
        [schoolId, subjectId],
      );
      if (schoolSubject.rowCount !== 1) {
        throw new NotFoundException('A matéria selecionada não foi encontrada.');
      }

      if (teacherId) {
        const assignment = await client.query(
          `SELECT 1
           FROM teacher_class_assignments
           JOIN teacher_subject_assignments
             ON teacher_subject_assignments.school_id = teacher_class_assignments.school_id
            AND teacher_subject_assignments.user_id = teacher_class_assignments.user_id
           WHERE teacher_class_assignments.school_id = $1
             AND teacher_class_assignments.class_id = $2
             AND teacher_class_assignments.user_id = $3
             AND teacher_subject_assignments.subject_id = $4`,
          [schoolId, classId, teacherId, subjectId],
        );
        if (assignment.rowCount !== 1 && previous.teacher_id !== teacherId) {
          throw new BadRequestException(
            'O professor precisa estar atribuído à turma e à matéria selecionadas.',
          );
        }
      }

      await this.assertOutsideSchoolRecess(client, schoolId, dayOfWeek, startsAt, endsAt);
      const overlapping = await client.query<{
        class_conflict: boolean;
        teacher_conflict: boolean;
      }>(
        `SELECT bool_or(class_id = $2) AS class_conflict,
                bool_or($6::uuid IS NOT NULL AND teacher_id = $6) AS teacher_conflict
         FROM class_schedules
         WHERE school_id = $1
           AND id <> $7
           AND day_of_week = $3
           AND starts_at < $5::time
           AND ends_at > $4::time
           AND (class_id = $2 OR ($6::uuid IS NOT NULL AND teacher_id = $6))`,
        [schoolId, classId, dayOfWeek, startsAt, endsAt, teacherId, scheduleId],
      );
      const conflict = overlapping.rows[0];
      if (conflict?.class_conflict) {
        throw new ConflictException('Este horário se sobrepõe a outra atividade da turma.');
      }
      if (conflict?.teacher_conflict) {
        throw new ConflictException('Este professor já tem uma aula nesse horário.');
      }

      await client.query(
        `UPDATE class_schedules
         SET class_id = $3, day_of_week = $4, starts_at = $5::time,
             ends_at = $6::time, subject_id = $7, teacher_id = $8
         WHERE school_id = $1 AND id = $2`,
        [schoolId, scheduleId, classId, dayOfWeek, startsAt, endsAt, subjectId, teacherId],
      );

      const result = await client.query<ScheduleRow>(
        `${SCHEDULE_SELECT}
         WHERE class_schedules.school_id = $1 AND class_schedules.id = $2`,
        [schoolId, scheduleId],
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new Error('O horário atualizado não pôde ser carregado.');
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'schedule.updated', 'class_schedule', $3, $4::jsonb)`,
        [
          schoolId,
          updatedBy,
          scheduleId,
          JSON.stringify({ previous: mapSchedule(previous), updated: mapSchedule(updated) }),
        ],
      );
      return mapSchedule(updated);
    });
  }

  async remove(schoolId: string, removedBy: string, scheduleId: string): Promise<{ deleted: true }> {
    if (!UUID_PATTERN.test(scheduleId)) {
      throw new BadRequestException('Horário inválido.');
    }

    return this.database.transaction(async (client) => {
      await this.lockSchoolSchedules(client, schoolId);
      const existing = await client.query<{
        class_id: string;
        day_of_week: number;
        subject: string;
      }>(
        `SELECT class_schedules.class_id, class_schedules.day_of_week,
                school_subjects.name AS subject
         FROM class_schedules
         JOIN school_subjects
           ON school_subjects.school_id = class_schedules.school_id
          AND school_subjects.id = class_schedules.subject_id
         WHERE class_schedules.school_id = $1 AND class_schedules.id = $2
         FOR UPDATE OF class_schedules`,
        [schoolId, scheduleId],
      );
      const schedule = existing.rows[0];
      if (!schedule) {
        throw new NotFoundException('O horário não foi encontrado.');
      }

      await client.query(
        'DELETE FROM class_schedules WHERE school_id = $1 AND id = $2',
        [schoolId, scheduleId],
      );
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'schedule.deleted', 'class_schedule', $3, $4::jsonb)`,
        [
          schoolId,
          removedBy,
          scheduleId,
          JSON.stringify({
            classId: schedule.class_id,
            dayOfWeek: schedule.day_of_week,
            subject: schedule.subject,
          }),
        ],
      );
      return { deleted: true };
    });
  }

  private lockSchoolSchedules(client: PoolClient, schoolId: string): Promise<unknown> {
    return client.query('SELECT pg_advisory_xact_lock(hashtext($1), 0)', [schoolId]);
  }

  private async assertOutsideSchoolRecess(
    client: PoolClient,
    schoolId: string,
    dayOfWeek: number,
    startsAt: string,
    endsAt: string,
  ): Promise<void> {
    if (dayOfWeek > 5) {
      return;
    }
    const result = await client.query<{ starts_at: string; ends_at: string }>(
      `SELECT starts_at::text AS starts_at, ends_at::text AS ends_at
       FROM school_recesses
       WHERE school_id = $1
         AND starts_at < $3::time
         AND ends_at > $2::time`,
      [schoolId, startsAt, endsAt],
    );
    if (result.rowCount) {
      throw new ConflictException('Este horário se sobrepõe ao recreio escolar.');
    }
  }
}

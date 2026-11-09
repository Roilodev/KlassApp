import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface SchoolRecess {
  startsAt: string | null;
  endsAt: string | null;
  afternoonStartsAt: string | null;
  afternoonEndsAt: string | null;
}

export interface ClassSessionPeriod {
  startsAt: string;
  endsAt: string;
}

export interface SchoolClassSessions {
  morning: ClassSessionPeriod[];
  afternoon: ClassSessionPeriod[];
}

interface SchoolRecessRow {
  starts_at: string | null;
  ends_at: string | null;
  afternoon_starts_at: string | null;
  afternoon_ends_at: string | null;
}

interface ClassSessionPeriodRow {
  session: 'morning' | 'afternoon';
  starts_at: string;
  ends_at: string;
}

function validateClassSessions(input: unknown): SchoolClassSessions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Informe os turnos das sessões escolares.');
  }

  const sessions = input as Record<string, unknown>;
  if (!Array.isArray(sessions.morning) || !Array.isArray(sessions.afternoon)) {
    throw new BadRequestException('Informe os turnos das sessões da manhã e da tarde.');
  }

  const normalized: SchoolClassSessions = {
    morning: validateSessionPeriods(sessions.morning),
    afternoon: validateSessionPeriods(sessions.afternoon),
  };
  const allPeriods = [...normalized.morning, ...normalized.afternoon]
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  for (let index = 1; index < allPeriods.length; index += 1) {
    if (allPeriods[index - 1].endsAt > allPeriods[index].startsAt) {
      throw new BadRequestException('Os turnos das sessões não podem se sobrepor.');
    }
  }
  return normalized;
}

function validateSessionPeriods(input: unknown[]): ClassSessionPeriod[] {
  const periods = input.map((period) => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) {
      throw new BadRequestException('Informe um horário válido para cada turno.');
    }

    const { startsAt, endsAt } = period as Record<string, unknown>;
    if (
      typeof startsAt !== 'string' ||
      typeof endsAt !== 'string' ||
      !TIME_PATTERN.test(startsAt) ||
      !TIME_PATTERN.test(endsAt) ||
      startsAt >= endsAt
    ) {
      throw new BadRequestException('Informe horários válidos de início e fim para cada turno.');
    }
    return { startsAt, endsAt };
  });

  periods.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  for (let index = 1; index < periods.length; index += 1) {
    if (periods[index - 1].endsAt > periods[index].startsAt) {
      throw new BadRequestException('Os turnos de uma mesma sessão não podem se sobrepor.');
    }
  }
  return periods;
}

function validateRecess(input: unknown): SchoolRecess {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Informe o horário do recreio.');
  }

  const recessInput = input as Record<string, unknown>;
  const morning = validateRecessPeriod(recessInput.startsAt, recessInput.endsAt);
  const afternoon = validateRecessPeriod(
    recessInput.afternoonStartsAt ?? null,
    recessInput.afternoonEndsAt ?? null,
  );
  if (
    morning.startsAt &&
    morning.endsAt &&
    afternoon.startsAt &&
    afternoon.endsAt &&
    morning.startsAt < afternoon.endsAt &&
    afternoon.startsAt < morning.endsAt
  ) {
    throw new BadRequestException('Os recreios da manhã e da tarde não podem se sobrepor.');
  }
  return {
    startsAt: morning.startsAt,
    endsAt: morning.endsAt,
    afternoonStartsAt: afternoon.startsAt,
    afternoonEndsAt: afternoon.endsAt,
  };
}

function validateRecessPeriod(startsAt: unknown, endsAt: unknown) {
  if (startsAt === null && endsAt === null) {
    return { startsAt: null, endsAt: null };
  }
  if (
    typeof startsAt !== 'string' ||
    typeof endsAt !== 'string' ||
    !TIME_PATTERN.test(startsAt) ||
    !TIME_PATTERN.test(endsAt) ||
    startsAt >= endsAt
  ) {
    throw new BadRequestException('Informe horários válidos de início e fim para cada recreio.');
  }
  return { startsAt, endsAt };
}

function mapRecess(row: SchoolRecessRow | undefined): SchoolRecess {
  return row
    ? {
      startsAt: row.starts_at?.slice(0, 5) ?? null,
      endsAt: row.ends_at?.slice(0, 5) ?? null,
      afternoonStartsAt: row.afternoon_starts_at?.slice(0, 5) ?? null,
      afternoonEndsAt: row.afternoon_ends_at?.slice(0, 5) ?? null,
    }
    : {
      startsAt: null,
      endsAt: null,
      afternoonStartsAt: null,
      afternoonEndsAt: null,
    };
}

function mapClassSessions(rows: ClassSessionPeriodRow[]): SchoolClassSessions {
  const sessions: SchoolClassSessions = { morning: [], afternoon: [] };
  for (const row of rows) {
    sessions[row.session].push({
      startsAt: row.starts_at.slice(0, 5),
      endsAt: row.ends_at.slice(0, 5),
    });
  }
  return sessions;
}

@Injectable()
export class SettingsService {
  constructor(private readonly database: DatabaseService) {}

  async getSchoolRecess(schoolId: string): Promise<SchoolRecess> {
    const result = await this.database.query<SchoolRecessRow>(
      `SELECT starts_at::text AS starts_at,
              ends_at::text AS ends_at,
              afternoon_starts_at::text AS afternoon_starts_at,
              afternoon_ends_at::text AS afternoon_ends_at
       FROM school_recesses
       WHERE school_id = $1`,
      [schoolId],
    );
    return mapRecess(result.rows[0]);
  }

  async getClassSessions(schoolId: string): Promise<SchoolClassSessions> {
    const result = await this.database.query<ClassSessionPeriodRow>(
      `SELECT session, starts_at::text AS starts_at, ends_at::text AS ends_at
       FROM school_class_session_periods
       WHERE school_id = $1
       ORDER BY session, period_order`,
      [schoolId],
    );
    return mapClassSessions(result.rows);
  }

  async saveClassSessions(
    schoolId: string,
    updatedBy: string,
    input: unknown,
  ): Promise<SchoolClassSessions> {
    const sessions = validateClassSessions(input);
    return this.database.transaction(async (client) => {
      await this.lockSchoolSchedules(client, schoolId);
      const existingSchedules = await client.query<{
        session: 'morning' | 'afternoon';
        starts_at: string;
        ends_at: string;
      }>(
        `SELECT classes.session,
                class_schedules.starts_at::text AS starts_at,
                class_schedules.ends_at::text AS ends_at
         FROM class_schedules
         JOIN classes
           ON classes.school_id = class_schedules.school_id
          AND classes.id = class_schedules.class_id
         WHERE class_schedules.school_id = $1`,
        [schoolId],
      );
      const hasUnmatchedSchedule = existingSchedules.rows.some((schedule) =>
        !sessions[schedule.session].some(
          (period) =>
            period.startsAt === schedule.starts_at.slice(0, 5) &&
            period.endsAt === schedule.ends_at.slice(0, 5),
        ),
      );
      if (hasUnmatchedSchedule) {
        throw new ConflictException(
          'Ajuste os horários das turmas antes de remover ou alterar turnos que já possuem aulas.',
        );
      }

      await client.query(
        'DELETE FROM school_class_session_periods WHERE school_id = $1',
        [schoolId],
      );
      for (const session of ['morning', 'afternoon'] as const) {
        for (const [index, period] of sessions[session].entries()) {
          await client.query(
            `INSERT INTO school_class_session_periods
               (school_id, session, period_order, starts_at, ends_at, updated_by)
             VALUES ($1, $2, $3, $4::time, $5::time, $6)`,
            [schoolId, session, index + 1, period.startsAt, period.endsAt, updatedBy],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'school.class_sessions.updated', 'school_class_session_periods', $1, $3::jsonb)`,
        [schoolId, updatedBy, JSON.stringify(sessions)],
      );
      const result = await client.query<ClassSessionPeriodRow>(
        `SELECT session, starts_at::text AS starts_at, ends_at::text AS ends_at
         FROM school_class_session_periods
         WHERE school_id = $1
         ORDER BY session, period_order`,
        [schoolId],
      );
      return mapClassSessions(result.rows);
    });
  }

  async saveSchoolRecess(
    schoolId: string,
    updatedBy: string,
    input: unknown,
  ): Promise<SchoolRecess> {
    const recess = validateRecess(input);
    return this.database.transaction(async (client) => {
      await this.lockSchoolSchedules(client, schoolId);
      const activeRecesses = [
        { startsAt: recess.startsAt, endsAt: recess.endsAt },
        { startsAt: recess.afternoonStartsAt, endsAt: recess.afternoonEndsAt },
      ].filter(
        (period): period is { startsAt: string; endsAt: string } =>
          Boolean(period.startsAt && period.endsAt),
      );
      for (const period of activeRecesses) {
        const overlapping = await client.query(
          `SELECT 1
           FROM class_schedules
           WHERE school_id = $1
             AND day_of_week BETWEEN 1 AND 5
             AND starts_at < $3::time
             AND ends_at > $2::time
           LIMIT 1`,
          [schoolId, period.startsAt, period.endsAt],
        );
        if (overlapping.rowCount) {
          throw new ConflictException(
            'O recreio se sobrepõe a uma aula já cadastrada em um dia útil.',
          );
        }

      }

      if (activeRecesses.length > 0) {
        await client.query(
          `INSERT INTO school_recesses
             (school_id, starts_at, ends_at, afternoon_starts_at, afternoon_ends_at, updated_by)
           VALUES ($1, $2::time, $3::time, $4::time, $5::time, $6)
           ON CONFLICT (school_id)
           DO UPDATE SET starts_at = EXCLUDED.starts_at,
                         ends_at = EXCLUDED.ends_at,
                         afternoon_starts_at = EXCLUDED.afternoon_starts_at,
                         afternoon_ends_at = EXCLUDED.afternoon_ends_at,
                         updated_by = EXCLUDED.updated_by,
                         updated_at = now()`,
          [
            schoolId,
            recess.startsAt,
            recess.endsAt,
            recess.afternoonStartsAt,
            recess.afternoonEndsAt,
            updatedBy,
          ],
        );
      } else {
        await client.query('DELETE FROM school_recesses WHERE school_id = $1', [schoolId]);
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'school.recess.updated', 'school_recess', $1, $3::jsonb)`,
        [schoolId, updatedBy, JSON.stringify(recess)],
      );
      return mapRecess(await this.getSchoolRecessWithClient(client, schoolId));
    });
  }

  private async getSchoolRecessWithClient(
    client: PoolClient,
    schoolId: string,
  ): Promise<SchoolRecessRow | undefined> {
    const result = await client.query<SchoolRecessRow>(
      `SELECT starts_at::text AS starts_at,
              ends_at::text AS ends_at,
              afternoon_starts_at::text AS afternoon_starts_at,
              afternoon_ends_at::text AS afternoon_ends_at
       FROM school_recesses
       WHERE school_id = $1`,
      [schoolId],
    );
    return result.rows[0];
  }

  private lockSchoolSchedules(client: PoolClient, schoolId: string): Promise<unknown> {
    return client.query('SELECT pg_advisory_xact_lock(hashtext($1), 0)', [schoolId]);
  }
}

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface SchoolRecess {
  startsAt: string | null;
  endsAt: string | null;
}

interface SchoolRecessRow {
  starts_at: string;
  ends_at: string;
}

function validateRecess(input: unknown): SchoolRecess {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Informe o horário do recreio.');
  }

  const { startsAt, endsAt } = input as Record<string, unknown>;
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
    throw new BadRequestException('Informe um horário de início e fim válidos para o recreio.');
  }
  return { startsAt, endsAt };
}

function mapRecess(row: SchoolRecessRow | undefined): SchoolRecess {
  return row
    ? { startsAt: row.starts_at.slice(0, 5), endsAt: row.ends_at.slice(0, 5) }
    : { startsAt: null, endsAt: null };
}

@Injectable()
export class SettingsService {
  constructor(private readonly database: DatabaseService) {}

  async getSchoolRecess(schoolId: string): Promise<SchoolRecess> {
    const result = await this.database.query<SchoolRecessRow>(
      `SELECT starts_at::text AS starts_at, ends_at::text AS ends_at
       FROM school_recesses
       WHERE school_id = $1`,
      [schoolId],
    );
    return mapRecess(result.rows[0]);
  }

  async saveSchoolRecess(
    schoolId: string,
    updatedBy: string,
    input: unknown,
  ): Promise<SchoolRecess> {
    const recess = validateRecess(input);
    return this.database.transaction(async (client) => {
      await this.lockSchoolSchedules(client, schoolId);
      if (recess.startsAt && recess.endsAt) {
        const overlapping = await client.query(
          `SELECT 1
           FROM class_schedules
           WHERE school_id = $1
             AND day_of_week BETWEEN 1 AND 5
             AND starts_at < $3::time
             AND ends_at > $2::time
           LIMIT 1`,
          [schoolId, recess.startsAt, recess.endsAt],
        );
        if (overlapping.rowCount) {
          throw new ConflictException(
            'O recreio se sobrepõe a uma aula já cadastrada em um dia útil.',
          );
        }
        await client.query(
          `INSERT INTO school_recesses (school_id, starts_at, ends_at, updated_by)
           VALUES ($1, $2::time, $3::time, $4)
           ON CONFLICT (school_id)
           DO UPDATE SET starts_at = EXCLUDED.starts_at,
                         ends_at = EXCLUDED.ends_at,
                         updated_by = EXCLUDED.updated_by,
                         updated_at = now()`,
          [schoolId, recess.startsAt, recess.endsAt, updatedBy],
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
      `SELECT starts_at::text AS starts_at, ends_at::text AS ends_at
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

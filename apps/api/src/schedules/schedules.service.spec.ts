import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { SchedulesService } from './schedules.service.js';
import type { CreateScheduleInput } from './schedules.service.js';

describe('SchedulesService', () => {
  const validInput = {
    classId: '123e4567-e89b-42d3-a456-426614174000',
    dayOfWeek: 1,
    startsAt: '08:00',
    endsAt: '08:50',
    subject: 'Matemática',
  };

  function makeService(
    queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
  ) {
    const query = vi.fn(queryHandler);
    const transaction = vi.fn(
      (work: (client: PoolClient) => Promise<unknown>) =>
        work({ query } as unknown as PoolClient),
    );
    const service = new SchedulesService(
      { query, transaction } as unknown as DatabaseService,
    );
    return { service, query, transaction };
  }

  it.each([
    ['invalid weekday', { ...validInput, dayOfWeek: 8 }],
    ['invalid clock value', { ...validInput, startsAt: '25:00' }],
    ['end before start', { ...validInput, endsAt: '07:59' }],
    ['blank subject', { ...validInput, subject: '   ' }],
    ['invalid teacher identifier', { ...validInput, teacherId: 'not-a-uuid' }],
  ])('rejects %s before touching the database', async (_case, input) => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'user-id', input as CreateScheduleInput),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates and audits a weekly class schedule', async () => {
    const scheduleId = 'c0a80123-e89b-42d3-a456-426614174000';
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM classes')) {
        return { rows: [{ id: validInput.classId }], rowCount: 1 };
      }
      if (sql.includes('SELECT bool_or')) {
        return {
          rows: [{ class_conflict: false, teacher_conflict: false }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO class_schedules')) {
        return { rows: [{ id: scheduleId }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        return { rows: [], rowCount: 1 };
      }
      return {
        rows: [{
          id: scheduleId,
          class_id: validInput.classId,
          class_label: '4º ano · Turma A',
          year: 2026,
          day_of_week: 1,
          starts_at: '08:00:00',
          ends_at: '08:50:00',
          subject: validInput.subject,
          teacher_id: null,
          teacher_name: null,
        }],
        rowCount: 1,
      };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(service.create('school-id', 'user-id', validInput)).resolves.toEqual({
      id: scheduleId,
      classId: validInput.classId,
      classLabel: '4º ano · Turma A',
      year: 2026,
      dayOfWeek: 1,
      startsAt: '08:00',
      endsAt: '08:50',
      subject: 'Matemática',
      teacherId: null,
      teacherName: null,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['school-id'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'schedule.created'"),
      expect.anything(),
    );
  });

  it('rejects overlapping lessons before inserting a schedule', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM classes')) {
        return { rows: [{ id: validInput.classId }], rowCount: 1 };
      }
      return {
        rows: [{ class_conflict: true, teacher_conflict: false }],
        rowCount: 1,
      };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.create('school-id', 'user-id', validInput),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO class_schedules'),
      expect.anything(),
    );
  });

  it('updates and audits a weekly class schedule', async () => {
    const scheduleId = 'c0a80123-e89b-42d3-a456-426614174000';
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FOR UPDATE OF class_schedules')) {
        return {
          rows: [{
            id: scheduleId,
            class_id: validInput.classId,
            class_label: '4º ano · Turma A',
            year: 2026,
            day_of_week: 1,
            starts_at: '08:00:00',
            ends_at: '08:50:00',
            subject: 'Matemática',
            teacher_id: null,
            teacher_name: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id FROM classes')) {
        return { rows: [{ id: validInput.classId }], rowCount: 1 };
      }
      if (sql.includes('SELECT bool_or')) {
        return {
          rows: [{ class_conflict: false, teacher_conflict: false }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        return { rows: [], rowCount: 1 };
      }
      return {
        rows: [{
          id: scheduleId,
          class_id: validInput.classId,
          class_label: '4º ano · Turma A',
          year: 2026,
          day_of_week: 2,
          starts_at: '09:00:00',
          ends_at: '09:50:00',
          subject: 'Ciências',
          teacher_id: null,
          teacher_name: null,
        }],
        rowCount: 1,
      };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.update('school-id', 'user-id', scheduleId, {
        ...validInput,
        dayOfWeek: 2,
        startsAt: '09:00',
        endsAt: '09:50',
        subject: 'Ciências',
      }),
    ).resolves.toEqual({
      id: scheduleId,
      classId: validInput.classId,
      classLabel: '4º ano · Turma A',
      year: 2026,
      dayOfWeek: 2,
      startsAt: '09:00',
      endsAt: '09:50',
      subject: 'Ciências',
      teacherId: null,
      teacherName: null,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('id <> $7'),
      ['school-id', validInput.classId, 2, '09:00', '09:50', null, scheduleId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'schedule.updated'"),
      expect.anything(),
    );
  });

  it('rejects schedule identifiers that are not valid UUIDs', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.update('school-id', 'user-id', 'invalid-id', validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('removes and audits a schedule in its school', async () => {
    const scheduleId = 'c0a80123-e89b-42d3-a456-426614174000';
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT class_id, day_of_week')) {
        return {
          rows: [{ class_id: validInput.classId, day_of_week: 1, subject: 'Matemática' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(service.remove('school-id', 'user-id', scheduleId)).resolves.toEqual({
      deleted: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM class_schedules'),
      ['school-id', scheduleId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'schedule.deleted'"),
      expect.anything(),
    );
  });
});

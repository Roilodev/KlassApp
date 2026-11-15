import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  function makeService(
    queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
  ) {
    const query = vi.fn(queryHandler);
    const transaction = vi.fn(
      (work: (client: PoolClient) => Promise<unknown>) =>
        work({ query } as unknown as PoolClient),
    );
    return {
      service: new SettingsService({ query, transaction } as unknown as DatabaseService),
      query,
      transaction,
    };
  }

  it.each([
    ['missing start time', { startsAt: null, endsAt: '10:30' }],
    ['invalid time', { startsAt: '25:00', endsAt: '10:30' }],
    ['end before start', { startsAt: '10:30', endsAt: '10:00' }],
  ])('rejects %s without writing to the database', async (_case, input) => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.saveSchoolRecess('school-id', 'user-id', input))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns an empty setting when the school has no recess configured', async () => {
    const { service } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.getSchoolRecess('school-id')).resolves.toEqual({
      startsAt: null,
      endsAt: null,
      afternoonStartsAt: null,
      afternoonEndsAt: null,
      nightStartsAt: null,
      nightEndsAt: null,
    });
  });

  it('saves a weekday recess when it does not conflict with classes', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('FROM class_schedules')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM school_recesses')) {
        return {
          rows: [{ starts_at: '10:00:00', ends_at: '10:20:00' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(service.saveSchoolRecess('school-id', 'user-id', {
      startsAt: '10:00',
      endsAt: '10:20',
    })).resolves.toEqual({
      startsAt: '10:00',
      endsAt: '10:20',
      afternoonStartsAt: null,
      afternoonEndsAt: null,
      nightStartsAt: null,
      nightEndsAt: null,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (school_id)'),
      ['school-id', '10:00', '10:20', null, null, null, null, 'user-id'],
    );
  });

  it('saves an afternoon recess while preserving the morning recess', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('FROM class_schedules')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM school_recesses')) {
        return {
          rows: [{
            starts_at: '10:00:00',
            ends_at: '10:20:00',
            afternoon_starts_at: '15:00:00',
            afternoon_ends_at: '15:20:00',
            night_starts_at: '20:00:00',
            night_ends_at: '20:20:00',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(service.saveSchoolRecess('school-id', 'user-id', {
      startsAt: '10:00',
      endsAt: '10:20',
      afternoonStartsAt: '15:00',
      afternoonEndsAt: '15:20',
      nightStartsAt: '20:00',
      nightEndsAt: '20:20',
    })).resolves.toEqual({
      startsAt: '10:00',
      endsAt: '10:20',
      afternoonStartsAt: '15:00',
      afternoonEndsAt: '15:20',
      nightStartsAt: '20:00',
      nightEndsAt: '20:20',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (school_id)'),
      ['school-id', '10:00', '10:20', '15:00', '15:20', '20:00', '20:20', 'user-id'],
    );
    expect(query).toHaveBeenCalledTimes(7);
  });

  it('rejects overlapping recesses from different sessions', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.saveSchoolRecess('school-id', 'user-id', {
      nightStartsAt: '20:00',
      nightEndsAt: '20:30',
      afternoonStartsAt: '20:20',
      afternoonEndsAt: '20:40',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a recess that overlaps an existing weekday class', async () => {
    const { service, query } = makeService(async (sql) =>
      sql.includes('FROM class_schedules')
        ? { rows: [{ '?column?': 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );

    await expect(service.saveSchoolRecess('school-id', 'user-id', {
      startsAt: '10:00',
      endsAt: '10:20',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO school_recesses'),
      expect.anything(),
    );
  });

  it('returns empty sessions when none are configured', async () => {
    const { service } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.getClassSessions('school-id')).resolves.toEqual({
      morning: [],
      afternoon: [],
      night: [],
    });
  });

  it('returns an unset maximum weekly teacher workload', async () => {
    const { service, query } = makeService(async () => ({
      rows: [{ max_teacher_weekly_periods: null }],
      rowCount: 1,
    }));

    await expect(service.getTeacherWorkload('school-id')).resolves.toEqual({
      maxWeeklyPeriods: null,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM schools'),
      ['school-id'],
    );
  });

  it('reports a missing school when reading the maximum weekly teacher workload', async () => {
    const { service } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(service.getTeacherWorkload('missing-school'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, '20'])(
    'rejects invalid maximum weekly teacher workload %s',
    async (maxWeeklyPeriods) => {
      const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

      await expect(
        service.saveTeacherWorkload('school-id', 'user-id', { maxWeeklyPeriods }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('saves and audits the maximum weekly teacher workload', async () => {
    const { service, query } = makeService(async (sql) =>
      sql.includes('UPDATE schools')
        ? { rows: [{ max_teacher_weekly_periods: 24 }], rowCount: 1 }
        : { rows: [], rowCount: 1 },
    );

    await expect(
      service.saveTeacherWorkload('school-id', 'user-id', { maxWeeklyPeriods: 24 }),
    ).resolves.toEqual({ maxWeeklyPeriods: 24 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE schools'),
      ['school-id', 24],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('school.teacher_workload.updated'),
      ['school-id', 'user-id', JSON.stringify({ maxWeeklyPeriods: 24 })],
    );
  });

  it.each([
    ['missing session', { morning: [], afternoon: [], night: undefined }],
    ['invalid time', { morning: [{ startsAt: '25:00', endsAt: '10:00' }], afternoon: [], night: [] }],
    ['overlap in one session', {
      morning: [
        { startsAt: '08:00', endsAt: '09:00' },
        { startsAt: '08:30', endsAt: '09:30' },
      ],
      afternoon: [],
      night: [],
    }],
    ['overlap between sessions', {
      morning: [{ startsAt: '08:00', endsAt: '12:00' }],
      afternoon: [{ startsAt: '11:30', endsAt: '13:00' }],
      night: [],
    }],
    ['overlap with night session', {
      morning: [{ startsAt: '08:00', endsAt: '09:00' }],
      afternoon: [{ startsAt: '13:00', endsAt: '14:00' }],
      night: [{ startsAt: '13:30', endsAt: '15:00' }],
    }],
  ])('rejects class sessions with %s', async (_case, input) => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.saveClassSessions('school-id', 'user-id', input))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('saves class session periods in chronological order', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('SELECT session, starts_at::text')) {
        return {
          rows: [
            { session: 'morning', starts_at: '08:00:00', ends_at: '08:50:00' },
            { session: 'morning', starts_at: '09:00:00', ends_at: '09:50:00' },
            { session: 'afternoon', starts_at: '13:00:00', ends_at: '13:50:00' },
            { session: 'night', starts_at: '19:00:00', ends_at: '19:50:00' },
          ],
          rowCount: 3,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(service.saveClassSessions('school-id', 'user-id', {
      morning: [
        { startsAt: '09:00', endsAt: '09:50' },
        { startsAt: '08:00', endsAt: '08:50' },
      ],
      afternoon: [{ startsAt: '13:00', endsAt: '13:50' }],
      night: [{ startsAt: '19:00', endsAt: '19:50' }],
    })).resolves.toEqual({
      morning: [
        { startsAt: '08:00', endsAt: '08:50' },
        { startsAt: '09:00', endsAt: '09:50' },
      ],
      afternoon: [{ startsAt: '13:00', endsAt: '13:50' }],
      night: [{ startsAt: '19:00', endsAt: '19:50' }],
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM school_class_session_periods'),
      ['school-id'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('school.class_sessions.updated'),
      ['school-id', 'user-id', JSON.stringify({
        morning: [
          { startsAt: '08:00', endsAt: '08:50' },
          { startsAt: '09:00', endsAt: '09:50' },
        ],
        afternoon: [{ startsAt: '13:00', endsAt: '13:50' }],
        night: [{ startsAt: '19:00', endsAt: '19:50' }],
      })],
    );
  });

  it('does not remove session periods used by existing schedules', async () => {
    const { service, query } = makeService(async (sql) =>
      sql.includes('FROM class_schedules') && sql.includes('JOIN classes')
        ? {
          rows: [{
            session: 'afternoon',
            starts_at: '13:00:00',
            ends_at: '13:50:00',
          }],
          rowCount: 1,
        }
        : { rows: [], rowCount: 1 },
    );

    await expect(service.saveClassSessions('school-id', 'user-id', {
      morning: [],
      afternoon: [],
      night: [],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM school_class_session_periods'),
      ['school-id'],
    );
  });
});

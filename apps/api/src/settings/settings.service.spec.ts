import { BadRequestException, ConflictException } from '@nestjs/common';
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
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (school_id)'),
      ['school-id', '10:00', '10:20', null, null, 'user-id'],
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
    })).resolves.toEqual({
      startsAt: '10:00',
      endsAt: '10:20',
      afternoonStartsAt: '15:00',
      afternoonEndsAt: '15:20',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (school_id)'),
      ['school-id', '10:00', '10:20', '15:00', '15:20', 'user-id'],
    );
    expect(query).toHaveBeenCalledTimes(6);
  });

  it('rejects overlapping morning and afternoon recesses', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.saveSchoolRecess('school-id', 'user-id', {
      startsAt: '10:00',
      endsAt: '10:30',
      afternoonStartsAt: '10:20',
      afternoonEndsAt: '10:40',
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

  it('returns empty morning and afternoon sessions when none are configured', async () => {
    const { service } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.getClassSessions('school-id')).resolves.toEqual({
      morning: [],
      afternoon: [],
    });
  });

  it.each([
    ['missing session', { morning: [], afternoon: undefined }],
    ['invalid time', { morning: [{ startsAt: '25:00', endsAt: '10:00' }], afternoon: [] }],
    ['overlap in one session', {
      morning: [
        { startsAt: '08:00', endsAt: '09:00' },
        { startsAt: '08:30', endsAt: '09:30' },
      ],
      afternoon: [],
    }],
    ['overlap between sessions', {
      morning: [{ startsAt: '08:00', endsAt: '12:00' }],
      afternoon: [{ startsAt: '11:30', endsAt: '13:00' }],
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
    })).resolves.toEqual({
      morning: [
        { startsAt: '08:00', endsAt: '08:50' },
        { startsAt: '09:00', endsAt: '09:50' },
      ],
      afternoon: [{ startsAt: '13:00', endsAt: '13:50' }],
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
    })).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM school_class_session_periods'),
      ['school-id'],
    );
  });
});

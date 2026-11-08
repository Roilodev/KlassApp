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
    })).resolves.toEqual({ startsAt: '10:00', endsAt: '10:20' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (school_id)'),
      ['school-id', '10:00', '10:20', 'user-id'],
    );
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
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { SchoolStructureService } from './school-structure.service.js';

describe('SchoolStructureService', () => {
  const classId = '123e4567-e89b-42d3-a456-426614174000';
  const validInput = { year: 2026, grade: '4º ano', name: 'A' };

  function makeService(
    queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
  ) {
    const query = vi.fn(queryHandler);
    const transaction = vi.fn(
      (work: (client: PoolClient) => Promise<unknown>) =>
        work({ query } as unknown as PoolClient),
    );
    const service = new SchoolStructureService(
      { query, transaction } as unknown as DatabaseService,
    );
    return { service, query, transaction };
  }

  it('rejects invalid class ids before touching the database', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.updateClass('school-id', 'admin-id', 'invalid-id', validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('updates the class and records the change in the audit log', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A' }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO academic_years')) {
        return { rows: [{ id: 'year-id' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO grades')) {
        return { rows: [{ id: 'grade-id' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE classes')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '5º ano', name: 'B' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.updateClass('school-id', 'admin-id', classId, {
        year: 2026,
        grade: '5º ano',
        name: 'B',
      }),
    ).resolves.toEqual({ id: classId, year: 2026, grade: '5º ano', name: 'B' });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'class.updated'"),
      expect.arrayContaining(['school-id', 'admin-id', classId]),
    );
  });

  it('prevents moving a class with enrollment or assessment records to another year', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A' }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO academic_years')) {
        return { rows: [{ id: 'year-id' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO grades')) {
        return { rows: [{ id: 'grade-id' }], rowCount: 1 };
      }
      if (sql.includes('AS has_history')) {
        return { rows: [{ has_history: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.updateClass('school-id', 'admin-id', classId, {
        ...validInput,
        year: 2027,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE classes'),
      expect.anything(),
    );
  });
});

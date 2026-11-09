import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { SubjectsService } from './subjects.service.js';

const subjectId = 'c0a80123-e89b-42d3-a456-426614174000';

function makeService(
  queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
) {
  const query = vi.fn(queryHandler);
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  const service = new SubjectsService(
    { query, transaction } as unknown as DatabaseService,
  );
  return { service, query, transaction };
}

describe('SubjectsService', () => {
  it('rejects blank names before touching the database', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'user-id', { name: '  ', weeklyFrequency: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires a valid weekly subject frequency', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'user-id', { name: 'Matemática', weeklyFrequency: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('school-id', 'user-id', { name: 'Matemática', weeklyFrequency: 1.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates a subject and writes an audit record', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('INSERT INTO school_subjects')) {
        return { rows: [{ id: subjectId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      service.create('school-id', 'user-id', {
        name: '  Matemática  ',
        weeklyFrequency: 4,
      }),
    ).resolves.toEqual({
      id: subjectId,
      name: 'Matemática',
      weeklyFrequency: 4,
      scheduleCount: 0,
      assessmentCount: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['subject.created']),
    );
  });

  it('reports duplicate subject names clearly', async () => {
    const { service } = makeService(async () => {
      throw Object.assign(new Error('duplicate'), { code: '23505' });
    });

    await expect(
      service.create('school-id', 'user-id', { name: 'Matemática', weeklyFrequency: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents deleting subjects linked to schedules or assessments', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('SELECT name, weekly_frequency FROM school_subjects')) {
        return { rows: [{ name: 'Matemática', weekly_frequency: 4 }], rowCount: 1 };
      }
      return {
        rows: [{ schedule_count: 1, assessment_count: 0 }],
        rowCount: 1,
      };
    });

    await expect(
      service.remove('school-id', 'user-id', subjectId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM school_subjects'),
      expect.anything(),
    );
  });
});

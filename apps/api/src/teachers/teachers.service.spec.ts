import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import type { PasswordService } from '../auth/password.service.js';
import { TeachersService } from './teachers.service.js';

const classId = 'c0a80123-e89b-42d3-a456-426614174001';

function makeService() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT id FROM classes')) {
      return { rows: [{ id: classId }], rowCount: 1 };
    }
    if (sql.includes('WHERE lower(users.email) = $1')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO teacher_invitations')) {
      return { rows: [{ id: 'invitation-id' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  const service = new TeachersService(
    { query, transaction } as unknown as DatabaseService,
    {} as PasswordService,
    { getOrThrow: () => 'https://klassapp.example.test' } as ConfigService,
  );
  return { service, query, transaction };
}

describe('TeachersService', () => {
  it('stores the normalized school phone on a teacher invitation', async () => {
    const { service, query } = makeService();

    await expect(service.invite('school-id', 'admin-id', {
      email: 'teacher@example.test',
      displayName: 'Professora',
      phone: '(11) 99999-8888',
      classIds: [classId],
    })).resolves.toMatchObject({
      status: 'invited',
      phone: '+5511999998888',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('phone_e164, token_hash'),
      expect.arrayContaining(['+5511999998888']),
    );
  });

  it('rejects an invalid Brazilian phone before opening a transaction', async () => {
    const { service, transaction } = makeService();

    await expect(service.invite('school-id', 'admin-id', {
      email: 'teacher@example.test',
      displayName: 'Professora',
      phone: '123',
      classIds: [classId],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});

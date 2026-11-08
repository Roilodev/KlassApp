import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import type { PasswordService } from '../auth/password.service.js';
import { TeachersService } from './teachers.service.js';

const classId = 'c0a80123-e89b-42d3-a456-426614174001';
const subjectId = 'c0a80123-e89b-42d3-a456-426614174004';

function makeService(
  queryHandler: (sql: string, values?: unknown[]) => Promise<{
    rows: Record<string, unknown>[];
    rowCount: number;
  }> = async (sql) => {
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
  }) {
  const query = vi.fn(queryHandler);
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  const service = new TeachersService(
    { query, transaction } as unknown as DatabaseService,
    { hash: vi.fn(async () => 'scrypt$hash') } as unknown as PasswordService,
    { getOrThrow: () => 'https://klassapp.example.test' } as ConfigService,
  );
  return { service, query, transaction };
}

describe('TeachersService', () => {
  it('lists teachers with their assigned subjects', async () => {
    const { service, query } = makeService(async () => ({
      rows: [{
        id: 'teacher-id',
        email: 'teacher@example.test',
        display_name: 'Professora',
        phone_e164: null,
        home_address: null,
        leave_date: null,
        leave_reason: null,
        status: 'active',
        has_photo: false,
        classes: [],
        subject_ids: [subjectId],
        invitation_expires_at: null,
      }],
      rowCount: 1,
    }));

    await expect(service.list('school-id')).resolves.toMatchObject([
      { id: 'teacher-id', subjectIds: [subjectId] },
    ]);
    expect(query.mock.calls[0]?.[0]).toContain(
      'school_memberships.school_id, school_memberships.user_id',
    );
  });

  it('lets an administrator activate a pending invitation with a password', async () => {
    const invitationId = 'c0a80123-e89b-42d3-a456-426614174002';
    const teacherId = 'c0a80123-e89b-42d3-a456-426614174003';
    const queryHandler = async (sql: string) => {
      if (sql.includes('FROM teacher_invitations') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: invitationId,
            school_id: 'school-id',
            email: 'teacher@example.test',
            display_name: 'Professora',
            phone_e164: '+5511999998888',
            home_address: 'Rua A, 123',
            class_ids: [classId],
            subject_ids: [],
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM users WHERE lower(email)')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO users')) {
        return { rows: [{ id: teacherId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    };
    const { service, query } = makeService(queryHandler);

    await expect(service.activateInvitation(
      'school-id',
      'admin-id',
      invitationId,
      'senha-temporaria-segura',
    )).resolves.toEqual({
      teacherId,
      email: 'teacher@example.test',
      displayName: 'Professora',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE school_id = $1 AND id = $2 AND accepted_at IS NULL'),
      ['school-id', invitationId],
    );
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)',
      [teacherId, 'scrypt$hash'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher.invitation_admin_activated'),
      expect.not.arrayContaining(['senha-temporaria-segura']),
    );
  });

  it('rejects invalid activation passwords before opening a transaction', async () => {
    const { service, transaction } = makeService();

    await expect(service.activateInvitation(
      'school-id',
      'admin-id',
      'c0a80123-e89b-42d3-a456-426614174002',
      'short',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores the normalized phone and home address on a teacher invitation', async () => {
    const { service, query } = makeService();

    await expect(service.invite('school-id', 'admin-id', {
      email: 'teacher@example.test',
      displayName: 'Professora',
      phone: '(11) 99999-8888',
      homeAddress: 'Rua A, 123',
      classIds: [classId],
    })).resolves.toMatchObject({
      status: 'invited',
      phone: '+5511999998888',
      homeAddress: 'Rua A, 123',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('phone_e164, home_address, token_hash'),
      expect.arrayContaining(['+5511999998888', 'Rua A, 123']),
    );
  });

  it('stores the selected subjects on a teacher invitation', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('SELECT id FROM school_subjects')) {
        return { rows: [{ id: subjectId }], rowCount: 1 };
      }
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

    await expect(service.invite('school-id', 'admin-id', {
      email: 'teacher@example.test',
      displayName: 'Professora',
      phone: '(11) 99999-8888',
      classIds: [classId],
      subjectIds: [subjectId],
    })).resolves.toMatchObject({ status: 'invited' });
    const invitationCall = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO teacher_invitations'),
    );
    expect(invitationCall?.[1]?.[6]).toEqual([classId]);
    expect(invitationCall?.[1]?.[7]).toEqual([subjectId]);
  });

  it('rejects invalid subject IDs before opening an invitation transaction', async () => {
    const { service, transaction } = makeService();

    await expect(service.invite('school-id', 'admin-id', {
      email: 'teacher@example.test',
      displayName: 'Professora',
      phone: '(11) 99999-8888',
      classIds: [classId],
      subjectIds: ['invalid'],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
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

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { ProfilesService } from './profiles.service.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function makeService(
  queryHandler: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
) {
  const query = vi.fn(queryHandler);
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  return {
    service: new ProfilesService(
      { query, transaction } as unknown as DatabaseService,
    ),
    query,
    transaction,
  };
}

describe('ProfilesService', () => {
  it('updates a student name and responsible contact and audits without recording phone data', async () => {
    const responsibleId = 'c0a80123-e89b-42d3-a456-426614174001';
    const { service, query, transaction } = makeService(async (sql) => {
      if (sql.includes('SELECT full_name FROM students')) {
        return { rows: [{ full_name: 'Nome antigo' }], rowCount: 1 };
      }
      if (sql.includes('SELECT responsible_contacts.id')) {
        return {
          rows: [{ id: responsibleId, phone_e164: '+5511999999999' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(service.updateStudentProfile(
      'school-id',
      'admin-id',
      'student-id',
      {
        fullName: 'Nome atualizado',
        responsibles: [{
          id: responsibleId,
          fullName: 'Responsável',
          phone: '+55 (11) 98888-8888',
          relationship: 'Mãe',
          notificationAuthorized: true,
        }],
      },
    )).resolves.toEqual({
      id: 'student-id',
      fullName: 'Nome atualizado',
      responsibles: [{
        id: responsibleId,
        fullName: 'Responsável',
        phone: '+5511988888888',
        relationship: 'Mãe',
        notificationAuthorized: true,
      }],
    });
    expect(transaction).toHaveBeenCalledOnce();
    const authorizationCall = query.mock.calls.find(([sql]) =>
      sql.includes('SET relationship = $4'),
    );
    expect(authorizationCall?.[1]).toEqual([
      'school-id',
      'student-id',
      responsibleId,
      'Mãe',
      true,
      true,
      'admin-id',
    ]);
    const auditCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_logs'));
    expect(auditCall?.[1]?.[3]).not.toContain('99999');
    expect(auditCall?.[1]?.[3]).toContain('"nameChanged":true');
  });

  it('rejects a responsible from another student and invalid phone data', async () => {
    const { service, transaction } = makeService(async (sql) => {
      if (sql.includes('SELECT full_name FROM students')) {
        return { rows: [{ full_name: 'Aluno' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(service.updateStudentProfile(
      'school-id',
      'admin-id',
      'student-id',
      {
        fullName: 'Aluno',
        responsibles: [{
          id: 'c0a80123-e89b-42d3-a456-426614174002',
          fullName: 'Outro',
          phone: '11999999999',
          relationship: 'Mãe',
          notificationAuthorized: false,
        }],
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateStudentProfile(
      'school-id',
      'admin-id',
      'student-id',
      {
        fullName: 'Aluno',
        responsibles: [{
          fullName: 'Responsável',
          phone: 'telefone inválido',
          relationship: 'Mãe',
          notificationAuthorized: false,
        }],
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('updates a teacher global account and assigned classes', async () => {
    const teacherId = 'c0a80123-e89b-42d3-a456-426614174003';
    const classId = 'c0a80123-e89b-42d3-a456-426614174004';
    const { service, query, transaction } = makeService(async (sql) => {
      if (sql.includes('FROM users') && sql.includes('school_memberships.role =')) {
        return {
          rows: [{
            display_name: 'Nome antigo',
            email: 'old@example.test',
            phone_e164: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM classes')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM teacher_class_assignments')) {
        return { rows: [{ class_id: classId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(service.updateTeacherProfile(
      'school-id',
      'admin-id',
      teacherId,
      {
        displayName: 'Nome novo',
        email: 'NEW@example.test',
        phone: '(11) 99999-8888',
        classIds: [classId],
      },
    )).resolves.toEqual({
      id: teacherId,
      displayName: 'Nome novo',
      email: 'new@example.test',
      phone: '+5511999998888',
      classes: [{ id: classId, year: 2026, grade: '4º ano', name: 'A' }],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET display_name = $2, email = $3 WHERE id = $1',
      [teacherId, 'Nome novo', 'new@example.test'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET phone_e164 = $3'),
      ['school-id', teacherId, '+5511999998888'],
    );
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('prevents removing a teacher class while an assigned schedule still uses it', async () => {
    const teacherId = 'c0a80123-e89b-42d3-a456-426614174005';
    const classId = 'c0a80123-e89b-42d3-a456-426614174006';
    const { service } = makeService(async (sql) => {
      if (sql.includes('FROM users') && sql.includes('school_memberships.role =')) {
        return {
          rows: [{
            display_name: 'Professor',
            email: 'teacher@example.test',
            phone_e164: '+5511999998888',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM classes')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM teacher_class_assignments')) {
        return { rows: [{ class_id: classId }], rowCount: 1 };
      }
      if (sql.includes('FROM class_schedules')) {
        return { rows: [{ class_id: classId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(service.updateTeacherProfile(
      'school-id',
      'admin-id',
      teacherId,
      {
        displayName: 'Professor',
        email: 'teacher@example.test',
        phone: '(11) 99999-8888',
        classIds: [],
      },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid Brazilian teacher phone before opening a transaction', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(service.updateTeacherProfile(
      'school-id',
      'admin-id',
      'teacher-id',
      {
        displayName: 'Professor',
        email: 'teacher@example.test',
        phone: '123',
        classIds: [],
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses to reveal a student profile to an unassigned teacher', async () => {
    const { service, query } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.getStudentProfile('school-id', 'teacher-id', 'teacher', 'student-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledOnce();
  });

  it('limits teacher profiles to assigned classes and hides responsible contact details', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('FROM students') && sql.includes('WHERE students.school_id')) {
        return { rows: [{ id: 'student-id' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const profile = await service.getStudentProfile(
      'school-id',
      'teacher-id',
      'teacher',
      'student-id',
    );

    expect(profile.responsibles).toEqual([]);
    expect(profile.responsiblesRestricted).toBe(true);
    for (const [sql] of query.mock.calls) {
      if (
        sql.includes('FROM student_enrollments') ||
        sql.includes('FROM behavior_records') ||
        sql.includes('FROM school_events') ||
        sql.includes('FROM class_schedules')
      ) {
        expect(sql).toContain('teacher_class_assignments');
      }
    }
    const responsibleQuery = query.mock.calls.find(([sql]) =>
      sql.includes('FROM student_responsibles'),
    );
    expect(responsibleQuery?.[0]).toContain("$3::text = 'admin'");
  });

  it('includes the teacher account, assigned classes, schedule, assessments, student count, and related events', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('FROM school_memberships')) {
        return {
          rows: [{
            id: 'teacher-id',
            displayName: 'Professora de teste',
            email: 'teacher@example.test',
            createdAt: new Date('2026-01-01T10:00:00.000Z'),
            isActive: false,
            hasPhoto: true,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM student_enrollments')) {
        return { rows: [{ count: 17 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const profile = await service.getTeacherProfile('school-id', 'teacher-id');

    expect(profile.teacher).toMatchObject({
      displayName: 'Professora de teste',
      isActive: false,
      hasPhoto: true,
    });
    expect(profile.studentsCount).toBe(17);
    expect(query).toHaveBeenCalledTimes(6);
    const assessmentQuery = query.mock.calls.find(([sql]) => sql.includes('FROM assessments'));
    const studentCountQuery = query.mock.calls.find(([sql]) => sql.includes('FROM student_enrollments'));
    const eventQuery = query.mock.calls.find(([sql]) => sql.includes('FROM school_events'));
    expect(assessmentQuery?.[0]).toContain('teacher_class_assignments');
    expect(studentCountQuery?.[0]).toContain('teacher_class_assignments');
    expect(studentCountQuery?.[0]).toContain("student_enrollments.status = 'active'");
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM behavior_records'))).toBe(false);
    expect(eventQuery?.[0]).toContain('teacher_class_assignments');
    expect(query.mock.calls[0][0]).not.toContain('school_memberships.is_active = true');
  });

  it('allows administrators to retrieve an inactive teacher photo', async () => {
    const photo = Buffer.from([0xff, 0xd8, 0xff]);
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('JOIN teacher_photos')) {
        return {
          rows: [{ photo_data: photo, photo_mime_type: 'image/jpeg' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      service.getPhoto('teacher', 'school-id', 'inactive-teacher-id', 'admin-id', 'admin'),
    ).resolves.toEqual({ data: photo, mimeType: 'image/jpeg' });
    expect(query.mock.calls[0][0]).not.toContain('school_memberships.is_active = true');
  });

  it('requires documented authorization before storing a student photo', async () => {
    const { service, query, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.savePhoto(
        'student',
        'school-id',
        'admin-id',
        'student-id',
        'image/jpeg',
        jpeg,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['unsupported media type', 'image/svg+xml', jpeg],
    ['spoofed media type', 'image/png', jpeg],
    ['oversized file', 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1)],
  ])('rejects %s without writing to the database', async (_case, mimeType, data) => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.savePhoto('teacher', 'school-id', 'admin-id', 'teacher-id', mimeType, data, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores the photo and audits only the photo update, never the image bytes', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO audit_logs')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [{ id: 'teacher-id' }], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.savePhoto(
        'student',
        'school-id',
        'admin-id',
        'student-id',
        'image/jpeg',
        jpeg,
        true,
      ),
    ).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('photo_authorized_by = $3'),
      [jpeg, 'image/jpeg', 'admin-id', 'school-id', 'student-id'],
    );
    const auditCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_logs'));
    expect(auditCall?.[1]).toEqual([
      'school-id',
      'admin-id',
      'student.photo_updated',
      'student',
      'student-id',
    ]);
  });
});

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

  it('lists active students and assigned active teachers grouped by class', async () => {
    const roster = {
      classId,
      students: [{ id: 'student-id', fullName: 'Ana Silva' }],
      teachers: [{ id: 'teacher-id', fullName: 'João Souza' }],
    };
    const { service, query } = makeService(async () => ({
      rows: [roster],
      rowCount: 1,
    }));

    await expect(service.listClassRosters('school-id')).resolves.toEqual([roster]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("student_enrollments.status = 'active'"),
      ['school-id'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("school_memberships.is_active = true"),
      ['school-id'],
    );
  });

  it('rejects invalid class ids before touching the database', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.updateClass('school-id', 'admin-id', 'invalid-id', validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not silently change a duplicated class session through the create endpoint', async () => {
    const { service, query } = makeService(async () => ({
      rows: [{
        id: classId,
        year: 2026,
        grade: '4º ano',
        name: 'A',
        session: 'morning',
      }],
      rowCount: 1,
    }));

    await expect(service.createClass('school-id', {
      ...validInput,
      session: 'afternoon',
    })).resolves.toMatchObject({ id: classId, session: 'morning' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DO UPDATE SET name = EXCLUDED.name'),
      ['school-id', 2026, '4º ano', 'A', 'afternoon'],
    );
    expect(query.mock.calls[0]?.[0]).not.toContain('session = EXCLUDED.session');
  });

  it('rejects invalid class sessions before touching the database', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.updateClass('school-id', 'admin-id', classId, {
        ...validInput,
        session: 'night' as 'morning',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('updates the class and records the change in the audit log', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'morning' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM class_schedules')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO academic_years')) {
        return { rows: [{ id: 'year-id' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO grades')) {
        return { rows: [{ id: 'grade-id' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE classes')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '5º ano', name: 'B', session: 'afternoon' }],
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
        session: 'afternoon',
      }),
    ).resolves.toEqual({
      id: classId,
      year: 2026,
      grade: '5º ano',
      name: 'B',
      session: 'afternoon',
      rescheduledSchedules: [],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'class.updated'"),
      expect.arrayContaining(['school-id', 'admin-id', classId]),
    );
  });

  it('prevents changing session when an existing schedule has no matching source period', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'morning' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_class_session_periods')) {
        return {
          rows: [
            { session: 'morning', starts_at: '08:00:00', ends_at: '08:50:00', period_order: 1 },
            { session: 'afternoon', starts_at: '13:00:00', ends_at: '13:50:00', period_order: 1 },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('FROM class_schedules')) {
        return {
          rows: [{
            id: '323e4567-e89b-42d3-a456-426614174000',
            day_of_week: 1,
            starts_at: '07:00:00',
            ends_at: '07:50:00',
            teacher_id: null,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.updateClass('school-id', 'admin-id', classId, {
        ...validInput,
        session: 'afternoon',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE classes'),
      expect.anything(),
    );
  });

  it('moves class schedules by turn order when changing the class session', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'morning' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_class_session_periods')) {
        return {
          rows: [
            { session: 'morning', starts_at: '08:00:00', ends_at: '08:50:00', period_order: 1 },
            { session: 'afternoon', starts_at: '13:00:00', ends_at: '13:50:00', period_order: 1 },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('FROM class_schedules') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: '323e4567-e89b-42d3-a456-426614174000',
            day_of_week: 1,
            starts_at: '08:00:00',
            ends_at: '08:50:00',
            teacher_id: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_recesses')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO academic_years')) {
        return { rows: [{ id: 'year-id' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO grades')) {
        return { rows: [{ id: 'grade-id' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE classes')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'afternoon' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.updateClass('school-id', 'admin-id', classId, {
        ...validInput,
        session: 'afternoon',
      }),
    ).resolves.toMatchObject({
      id: classId,
      session: 'afternoon',
      rescheduledSchedules: [{
        id: '323e4567-e89b-42d3-a456-426614174000',
        startsAt: '13:00',
        endsAt: '13:50',
        teacherId: null,
      }],
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET starts_at = $3::time, ends_at = $4::time'),
      ['school-id', '323e4567-e89b-42d3-a456-426614174000', '13:00', '13:50', false],
    );
  });

  it('rejects a session change that would overlap a teacher schedule', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'morning' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_class_session_periods')) {
        return {
          rows: [
            { session: 'morning', starts_at: '08:00:00', ends_at: '08:50:00', period_order: 1 },
            { session: 'afternoon', starts_at: '13:00:00', ends_at: '13:50:00', period_order: 1 },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('FROM class_schedules') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: '323e4567-e89b-42d3-a456-426614174000',
            day_of_week: 1,
            starts_at: '08:00:00',
            ends_at: '08:50:00',
            teacher_id: 'teacher-id',
            subject: 'Matemática',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_recesses')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('AND class_schedules.class_id <> $2')) {
        return {
          rows: [{
            teacher_name: 'Professora Ana',
            class_label: '2º ano · Turma B',
            subject: 'Ciências',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    const error = await service.updateClass('school-id', 'admin-id', classId, {
      ...validInput,
      session: 'afternoon',
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({
      response: {
        code: 'SESSION_TEACHER_CONFLICT',
        conflicts: [{
          scheduleId: '323e4567-e89b-42d3-a456-426614174000',
          subject: 'Matemática',
          teacherName: 'Professora Ana',
          conflictingClass: '2º ano · Turma B',
          conflictingSubject: 'Ciências',
          dayOfWeek: 1,
        }],
      },
    });
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET starts_at = $3::time, ends_at = $4::time'),
      expect.anything(),
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE classes'),
      expect.anything(),
    );
  });

  it('unassigns only conflicting teachers when explicitly confirmed', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'morning' }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_class_session_periods')) {
        return {
          rows: [
            { session: 'morning', starts_at: '08:00:00', ends_at: '08:50:00', period_order: 1 },
            { session: 'afternoon', starts_at: '13:00:00', ends_at: '13:50:00', period_order: 1 },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('FROM class_schedules') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: '323e4567-e89b-42d3-a456-426614174000',
            day_of_week: 1,
            starts_at: '08:00:00',
            ends_at: '08:50:00',
            teacher_id: 'teacher-id',
            subject: 'Matemática',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('FROM school_recesses')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('AND class_schedules.class_id <> $2')) {
        return {
          rows: [{
            teacher_name: 'Professora Ana',
            class_label: '2º ano · Turma B',
            subject: 'Ciências',
          }],
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
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'afternoon' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.updateClass('school-id', 'admin-id', classId, {
        ...validInput,
        session: 'afternoon',
        allowTeacherConflictsWithoutTeacher: true,
        confirmedTeacherConflictScheduleIds: [
          '323e4567-e89b-42d3-a456-426614174000',
        ],
      }),
    ).resolves.toMatchObject({
      session: 'afternoon',
      rescheduledSchedules: [{
        id: '323e4567-e89b-42d3-a456-426614174000',
        startsAt: '13:00',
        endsAt: '13:50',
        teacherId: null,
      }],
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_id = CASE WHEN $5::boolean THEN NULL ELSE teacher_id END'),
      ['school-id', '323e4567-e89b-42d3-a456-426614174000', '13:00', '13:50', true],
    );
  });

  it('prevents moving a class with enrollment or assessment records to another year', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT classes.id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A', session: 'morning' }],
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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { BehaviorService } from './behavior.service.js';

const enrollmentId = '123e4567-e89b-42d3-a456-426614174000';
const studentId = 'a0b80123-e89b-42d3-a456-426614174000';
const recordId = 'c0b80123-e89b-42d3-a456-426614174000';
const validInput = {
  enrollmentId,
  category: 'participation' as const,
  description: 'Participou da leitura em grupo e ajudou a organizar os livros.',
  occurredOn: '2026-11-06',
};

function makeService(
  queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
) {
  const query = vi.fn(queryHandler);
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  const service = new BehaviorService(
    { query, transaction } as unknown as DatabaseService,
  );
  return { service, query, transaction };
}

describe('BehaviorService', () => {
  it.each([
    ['invalid enrollment', { ...validInput, enrollmentId: 'not-a-uuid' }],
    ['unknown category', { ...validInput, category: 'diagnosis' }],
    ['blank description', { ...validInput, description: '  ' }],
    ['overlong description', { ...validInput, description: 'x'.repeat(1201) }],
    ['invalid date', { ...validInput, occurredOn: '2026-02-31' }],
  ])('rejects %s before touching the database', async (_case, input) => {
    const { service, query, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'user-id', 'admin', input),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates and audits a behavior observation without copying its description into audit details', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('FROM student_enrollments')) {
        return {
          rows: [{
            id: enrollmentId,
            student_id: studentId,
            class_id: 'b0b80123-e89b-42d3-a456-426614174000',
            academic_year_id: 'd0b80123-e89b-42d3-a456-426614174000',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO behavior_records')) {
        return { rows: [{ id: recordId }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        expect(sql).toContain("'behavior.record_created'");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM behavior_records')) {
        return {
          rows: [{
            id: recordId,
            enrollment_id: enrollmentId,
            student_id: studentId,
            student_name: 'Estudante de teste',
            class_id: 'b0b80123-e89b-42d3-a456-426614174000',
            class_label: '4º ano · Turma A',
            category: 'participation',
            description: validInput.description,
            occurred_on: validInput.occurredOn,
            recorded_by: 'Professor de teste',
            created_at: new Date('2026-11-06T15:00:00.000Z'),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.create('school-id', 'teacher-id', 'teacher', validInput),
    ).resolves.toMatchObject({
      id: recordId,
      studentId,
      category: 'participation',
      description: validInput.description,
      occurredOn: validInput.occurredOn,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      expect.arrayContaining(['teacher']),
    );
    const auditCall = query.mock.calls.find(([sql]) =>
      sql.includes("'behavior.record_created'"),
    );
    expect(auditCall?.[1]?.[3]).not.toContain(validInput.description);
  });

  it('does not allow a teacher to create a record in an unassigned class', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'teacher-id', 'teacher', validInput),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('lists only records from classes assigned to the teacher', async () => {
    const { service, query } = makeService(async () => ({
      rows: [{
        id: recordId,
        enrollment_id: enrollmentId,
        student_id: studentId,
        student_name: 'Estudante de teste',
        class_id: 'b0b80123-e89b-42d3-a456-426614174000',
        class_label: '4º ano · Turma A',
        category: 'participation',
        description: validInput.description,
        occurred_on: validInput.occurredOn,
        recorded_by: 'Professor de teste',
        created_at: new Date('2026-11-06T15:00:00.000Z'),
      }],
      rowCount: 1,
    }));

    await expect(
      service.listRecords('school-id', 'teacher-id', 'teacher', studentId),
    ).resolves.toMatchObject([{ studentId, category: 'participation' }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      ['school-id', studentId, 'teacher-id', 'teacher'],
    );
  });

  it('lists classes and students only for the teacher assigned to the class', async () => {
    const { service, query } = makeService(async (sql) => {
      if (sql.includes('student_enrollments')) {
        return {
          rows: [{
            id: studentId,
            enrollmentId,
            fullName: 'Estudante de teste',
          }],
          rowCount: 1,
        };
      }
      return {
        rows: [{ id: 'b0b80123-e89b-42d3-a456-426614174000', year: 2026, grade: '4º ano', name: 'A' }],
        rowCount: 1,
      };
    });

    await expect(service.listClasses('school-id', 'teacher-id', 'teacher')).resolves.toHaveLength(1);
    await expect(
      service.listStudents(
        'school-id',
        'teacher-id',
        'teacher',
        'b0b80123-e89b-42d3-a456-426614174000',
      ),
    ).resolves.toEqual([{ id: studentId, enrollmentId, fullName: 'Estudante de teste' }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      expect.arrayContaining(['teacher']),
    );
  });

  it('rejects student searches shorter than two characters before querying the database', async () => {
    const { service, query } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.searchStudents('school-id', 'user-id', 'admin', ' a '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('searches active students only in classes available to the teacher', async () => {
    const { service, query } = makeService(async () => ({
      rows: [{
        id: studentId,
        enrollmentId,
        fullName: 'Estudante de teste',
        grade: '4º ano',
        className: 'A',
        year: 2026,
      }],
      rowCount: 1,
    }));

    await expect(
      service.searchStudents('school-id', 'teacher-id', 'teacher', ' estudante '),
    ).resolves.toEqual([{
      id: studentId,
      enrollmentId,
      fullName: 'Estudante de teste',
      classLabel: '4º ano · Turma A · 2026',
    }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      ['school-id', 'estudante', 'teacher-id', 'teacher'],
    );
    expect(query.mock.calls[0]?.[0]).toContain("student_enrollments.status = 'active'");
    expect(query.mock.calls[0]?.[0]).toContain("grades.name || ' · Turma ' || classes.name");
    expect(query.mock.calls[0]?.[0]).toContain('LIMIT 50');
  });
});

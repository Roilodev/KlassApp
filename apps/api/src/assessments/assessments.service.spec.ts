import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { AssessmentsService } from './assessments.service.js';

const classId = '123e4567-e89b-42d3-a456-426614174000';
const assessmentId = 'c0a80123-e89b-42d3-a456-426614174000';
const studentId = 'a0b80123-e89b-42d3-a456-426614174000';
const validInput = {
  classId,
  title: 'Atividade do capítulo 3',
  subjectId: '223e4567-e89b-42d3-a456-426614174000',
  scheduledOn: '2026-11-15',
  maxPoints: 10,
};

function makeService(
  queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
) {
  const query = vi.fn(queryHandler);
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  const service = new AssessmentsService(
    { query, transaction } as unknown as DatabaseService,
  );
  return { service, query, transaction };
}

function assessmentRow() {
  return {
    id: assessmentId,
    class_id: classId,
    class_label: '4º ano · Turma A',
    year: 2026,
    academic_year_id: 'b0b80123-e89b-42d3-a456-426614174000',
    title: validInput.title,
    subject_id: validInput.subjectId,
    subject: 'Ciências',
    scheduled_on: validInput.scheduledOn,
    max_points: '10.00',
  };
}

describe('AssessmentsService', () => {
  it.each([
    ['invalid class', { ...validInput, classId: 'not-a-uuid' }],
    ['blank title', { ...validInput, title: '   ' }],
    ['invalid subject', { ...validInput, subjectId: 'not-a-uuid' }],
    ['invalid date', { ...validInput, scheduledOn: '2026-02-31' }],
    ['zero max points', { ...validInput, maxPoints: 0 }],
    ['too many decimals', { ...validInput, maxPoints: 1.234 }],
  ])('rejects %s before touching the database', async (_case, input) => {
    const { service, query, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'user-id', 'admin', input),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates an assessment for a class and records it in the audit log', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('FROM classes') && sql.includes('WHERE classes.school_id')) {
        return {
          rows: [{ id: classId, year: 2026, grade: '4º ano', name: 'A' }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id FROM school_subjects')) {
        return { rows: [{ id: validInput.subjectId }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO assessments')) {
        return { rows: [{ id: assessmentId }], rowCount: 1 };
      }
      if (sql.includes('SELECT assessments.id')) {
        return { rows: [assessmentRow()], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.create('school-id', 'user-id', 'teacher', validInput),
    ).resolves.toMatchObject({
      id: assessmentId,
      classLabel: '4º ano · Turma A',
      maxPoints: 10,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'assessment.created'"),
      expect.anything(),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      expect.arrayContaining(['teacher']),
    );
  });

  it('does not let a teacher create an assessment for an unassigned class', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      service.create('school-id', 'teacher-id', 'teacher', validInput),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('updates assessment details without changing its class and audits the change', async () => {
    const updatedInput = {
      title: 'Prova final',
      subjectId: '323e4567-e89b-42d3-a456-426614174000',
      scheduledOn: '2026-11-20',
      maxPoints: 20,
    };
    const updatedRow = {
      ...assessmentRow(),
      title: updatedInput.title,
      subject_id: updatedInput.subjectId,
      scheduled_on: updatedInput.scheduledOn,
      max_points: '20.00',
    };
    let assessmentSelectCount = 0;
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM assessments')) {
        return { rows: [{ id: assessmentId }], rowCount: 1 };
      }
      if (sql.includes('SELECT assessments.id')) {
        assessmentSelectCount += 1;
        return {
          rows: [assessmentSelectCount === 1 ? assessmentRow() : updatedRow],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id FROM school_subjects')) {
        return { rows: [{ id: updatedInput.subjectId }], rowCount: 1 };
      }
      if (sql.includes('SELECT EXISTS')) {
        return { rows: [{ exceeds_maximum: false }], rowCount: 1 };
      }
      if (sql.includes('UPDATE assessments')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [updatedRow], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.update('school-id', 'user-id', 'teacher', assessmentId, updatedInput),
    ).resolves.toMatchObject({
      id: assessmentId,
      classId,
      title: updatedInput.title,
      subjectId: updatedInput.subjectId,
      scheduledOn: updatedInput.scheduledOn,
      maxPoints: updatedInput.maxPoints,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'assessment.updated'"),
      expect.anything(),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE assessments'),
      ['school-id', assessmentId, updatedInput.title, updatedInput.subjectId,
        updatedInput.scheduledOn, updatedInput.maxPoints],
    );
  });

  it('validates assessment changes before opening a transaction', async () => {
    const { service, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      service.update('school-id', 'user-id', 'admin', assessmentId, {
        title: 'Prova final',
        subjectId: validInput.subjectId,
        scheduledOn: validInput.scheduledOn,
        maxPoints: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects lowering the maximum below an already recorded score', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM assessments')) {
        return { rows: [{ id: assessmentId }], rowCount: 1 };
      }
      if (sql.includes('SELECT assessments.id')) {
        return { rows: [assessmentRow()], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM school_subjects')) {
        return { rows: [{ id: validInput.subjectId }], rowCount: 1 };
      }
      return { rows: [{ exceeds_maximum: true }], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.update('school-id', 'user-id', 'admin', assessmentId, {
        title: 'Atividade revisada',
        subjectId: validInput.subjectId,
        scheduledOn: validInput.scheduledOn,
        maxPoints: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE assessments'),
      expect.anything(),
    );
  });

  it('rejects assessment updates for classes not assigned to a teacher', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM assessments')) {
        return { rows: [{ id: assessmentId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { service } = makeService(queryHandler);

    await expect(
      service.update('school-id', 'teacher-id', 'teacher', assessmentId, {
        title: 'Atividade revisada',
        subjectId: validInput.subjectId,
        scheduledOn: validInput.scheduledOn,
        maxPoints: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only active students in the assessment class', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT assessments.id')) {
        return { rows: [assessmentRow()], rowCount: 1 };
      }
      return {
        rows: [{
          student_id: studentId,
          full_name: 'Estudante de teste',
          score: null,
          updated_at: null,
        }],
        rowCount: 1,
      };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.listStudentResults('school-id', 'teacher-id', 'teacher', assessmentId),
    ).resolves.toEqual([{
      studentId,
      fullName: 'Estudante de teste',
      score: null,
      updatedAt: null,
    }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('student_enrollments.started_at <= assessments.scheduled_on'),
      ['school-id', assessmentId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('recorded_results.assessment_id = assessments.id'),
      ['school-id', assessmentId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('teacher_class_assignments'),
      expect.arrayContaining(['teacher']),
    );
  });

  it('records a result only when it is within the assessment score range', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM assessments')) {
        return { rows: [{ id: assessmentId }], rowCount: 1 };
      }
      if (sql.includes('SELECT assessments.id')) {
        return { rows: [assessmentRow()], rowCount: 1 };
      }
      if (sql.includes('FROM student_enrollments')) {
        return { rows: [{ enrollment_id: 'd0b80123-e89b-42d3-a456-426614174000' }], rowCount: 1 };
      }
      if (sql.includes('FROM assessment_results')) {
        return {
          rows: [{
            full_name: 'Estudante de teste',
            score: '8.50',
            updated_at: new Date('2026-11-15T12:00:00.000Z'),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.recordResult(
        'school-id',
        'teacher-id',
        'teacher',
        assessmentId,
        { studentId, score: 8.5 },
      ),
    ).resolves.toMatchObject({
      studentId,
      fullName: 'Estudante de teste',
      score: 8.5,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assessment_results'),
      expect.arrayContaining([8.5]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'assessment.result_recorded'"),
      expect.anything(),
    );
  });

  it('rejects scores above the maximum before writing a result', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM assessments')) {
        return { rows: [{ id: assessmentId }], rowCount: 1 };
      }
      if (sql.includes('SELECT assessments.id')) {
        return { rows: [assessmentRow()], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(
      service.recordResult(
        'school-id',
        'teacher-id',
        'teacher',
        assessmentId,
        { studentId, score: 10.01 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assessment_results'),
      expect.anything(),
    );
  });
});

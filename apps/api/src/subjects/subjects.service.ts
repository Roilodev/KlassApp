import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SchoolSubject {
  id: string;
  name: string;
  weeklyFrequency: number | null;
  scheduleCount: number;
  assessmentCount: number;
}

export interface SaveSubjectInput {
  name: string;
  weeklyFrequency: number;
}

function validateSubjectInput(input: SaveSubjectInput): { name: string; weeklyFrequency: number } {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.name !== 'string' ||
    !Number.isInteger(input.weeklyFrequency) ||
    input.weeklyFrequency < 1 ||
    input.weeklyFrequency > 40
  ) {
    throw new BadRequestException('Informe o nome e a frequência semanal da matéria (de 1 a 40 aulas).');
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new BadRequestException('A matéria deve ter entre 1 e 80 caracteres.');
  }
  return { name, weeklyFrequency: input.weeklyFrequency };
}

@Injectable()
export class SubjectsService {
  constructor(private readonly database: DatabaseService) {}

  async list(schoolId: string): Promise<SchoolSubject[]> {
    const result = await this.database.query<{
      id: string;
      name: string;
      weekly_frequency: number | null;
      schedule_count: number;
      assessment_count: number;
    }>(
      `SELECT school_subjects.id, school_subjects.name, school_subjects.weekly_frequency,
              count(DISTINCT class_schedules.id)::integer AS schedule_count,
              count(DISTINCT assessments.id)::integer AS assessment_count
       FROM school_subjects
       LEFT JOIN class_schedules
         ON class_schedules.school_id = school_subjects.school_id
        AND class_schedules.subject_id = school_subjects.id
       LEFT JOIN assessments
         ON assessments.school_id = school_subjects.school_id
        AND assessments.subject_id = school_subjects.id
       WHERE school_subjects.school_id = $1
       GROUP BY school_subjects.id
       ORDER BY school_subjects.name`,
      [schoolId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      weeklyFrequency: row.weekly_frequency,
      scheduleCount: row.schedule_count,
      assessmentCount: row.assessment_count,
    }));
  }

  async create(
    schoolId: string,
    createdBy: string,
    input: SaveSubjectInput,
  ): Promise<SchoolSubject> {
    const { name, weeklyFrequency } = validateSubjectInput(input);
    try {
      return await this.database.transaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO school_subjects (school_id, name, created_by, weekly_frequency)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [schoolId, name, createdBy, weeklyFrequency],
        );
        const subjectId = inserted.rows[0]?.id;
        if (!subjectId) {
          throw new Error('Não foi possível salvar a matéria.');
        }
        await this.audit(client, schoolId, createdBy, 'subject.created', subjectId, {
          name,
          weeklyFrequency,
        });
        return { id: subjectId, name, weeklyFrequency, scheduleCount: 0, assessmentCount: 0 };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe uma matéria com esse nome.');
      }
      throw error;
    }
  }

  async update(
    schoolId: string,
    updatedBy: string,
    subjectId: string,
    input: SaveSubjectInput,
  ): Promise<SchoolSubject> {
    if (!UUID_PATTERN.test(subjectId)) {
      throw new BadRequestException('Matéria inválida.');
    }
    const { name, weeklyFrequency } = validateSubjectInput(input);
    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<{ id: string; name: string; weekly_frequency: number }>(
          `UPDATE school_subjects
           SET name = $3, weekly_frequency = $4
           WHERE school_id = $1 AND id = $2
           RETURNING id, name, weekly_frequency`,
          [schoolId, subjectId, name, weeklyFrequency],
        );
        const updated = result.rows[0];
        if (!updated) {
          throw new NotFoundException('Matéria não encontrada.');
        }
        await this.audit(client, schoolId, updatedBy, 'subject.updated', subjectId, {
          name,
          weeklyFrequency,
        });
        const counts = await this.countUsage(client, schoolId, subjectId);
        return {
          id: updated.id,
          name: updated.name,
          weeklyFrequency: updated.weekly_frequency,
          ...counts,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe uma matéria com esse nome.');
      }
      throw error;
    }
  }

  async remove(
    schoolId: string,
    removedBy: string,
    subjectId: string,
  ): Promise<{ deleted: true }> {
    if (!UUID_PATTERN.test(subjectId)) {
      throw new BadRequestException('Matéria inválida.');
    }
    try {
      return await this.database.transaction(async (client) => {
        const existing = await client.query<{ name: string; weekly_frequency: number | null }>(
          `SELECT name, weekly_frequency FROM school_subjects
           WHERE school_id = $1 AND id = $2
           FOR UPDATE`,
          [schoolId, subjectId],
        );
        const subject = existing.rows[0];
        if (!subject) {
          throw new NotFoundException('Matéria não encontrada.');
        }
        const usage = await this.countUsage(client, schoolId, subjectId);
        if (usage.scheduleCount > 0 || usage.assessmentCount > 0) {
          throw new ConflictException('Não é possível excluir uma matéria vinculada a horários ou avaliações.');
        }
        await client.query(
          'DELETE FROM school_subjects WHERE school_id = $1 AND id = $2',
          [schoolId, subjectId],
        );
        await this.audit(client, schoolId, removedBy, 'subject.deleted', subjectId, {
          name: subject.name,
          weeklyFrequency: subject.weekly_frequency,
        });
        return { deleted: true };
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Não é possível excluir uma matéria vinculada a horários ou avaliações.');
      }
      throw error;
    }
  }

  private async countUsage(
    client: PoolClient,
    schoolId: string,
    subjectId: string,
  ): Promise<{ scheduleCount: number; assessmentCount: number }> {
    const result = await client.query<{
      schedule_count: number;
      assessment_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM class_schedules
          WHERE school_id = $1 AND subject_id = $2) AS schedule_count,
         (SELECT count(*)::integer FROM assessments
          WHERE school_id = $1 AND subject_id = $2) AS assessment_count`,
      [schoolId, subjectId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Não foi possível carregar os vínculos da matéria.');
    }
    return { scheduleCount: row.schedule_count, assessmentCount: row.assessment_count };
  }

  private audit(
    client: PoolClient,
    schoolId: string,
    actorId: string,
    action: string,
    subjectId: string,
    details: { name: string; weeklyFrequency: number | null },
  ) {
    return client.query(
      `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, 'school_subject', $4, $5::jsonb)`,
      [schoolId, actorId, action, subjectId, JSON.stringify(details)],
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23503'
  );
}

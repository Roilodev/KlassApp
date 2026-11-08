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
  scheduleCount: number;
  assessmentCount: number;
}

export interface SaveSubjectInput {
  name: string;
}

function validateSubjectInput(input: SaveSubjectInput): string {
  if (!input || typeof input !== 'object' || typeof input.name !== 'string') {
    throw new BadRequestException('Informe o nome da matéria.');
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new BadRequestException('A matéria deve ter entre 1 e 80 caracteres.');
  }
  return name;
}

@Injectable()
export class SubjectsService {
  constructor(private readonly database: DatabaseService) {}

  async list(schoolId: string): Promise<SchoolSubject[]> {
    const result = await this.database.query<{
      id: string;
      name: string;
      schedule_count: number;
      assessment_count: number;
    }>(
      `SELECT school_subjects.id, school_subjects.name,
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
      scheduleCount: row.schedule_count,
      assessmentCount: row.assessment_count,
    }));
  }

  async create(
    schoolId: string,
    createdBy: string,
    input: SaveSubjectInput,
  ): Promise<SchoolSubject> {
    const name = validateSubjectInput(input);
    try {
      return await this.database.transaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO school_subjects (school_id, name, created_by)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [schoolId, name, createdBy],
        );
        const subjectId = inserted.rows[0]?.id;
        if (!subjectId) {
          throw new Error('Não foi possível salvar a matéria.');
        }
        await this.audit(client, schoolId, createdBy, 'subject.created', subjectId, { name });
        return { id: subjectId, name, scheduleCount: 0, assessmentCount: 0 };
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
    const name = validateSubjectInput(input);
    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<{ id: string; name: string }>(
          `UPDATE school_subjects
           SET name = $3
           WHERE school_id = $1 AND id = $2
           RETURNING id, name`,
          [schoolId, subjectId, name],
        );
        const updated = result.rows[0];
        if (!updated) {
          throw new NotFoundException('Matéria não encontrada.');
        }
        await this.audit(client, schoolId, updatedBy, 'subject.updated', subjectId, { name });
        const counts = await this.countUsage(client, schoolId, subjectId);
        return { ...updated, ...counts };
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
        const existing = await client.query<{ name: string }>(
          `SELECT name FROM school_subjects
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
    details: { name: string },
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

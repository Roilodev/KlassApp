import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SubjectGradeFrequency {
  grade: string;
  weeklyFrequency: number | null;
}

export interface SchoolSubject {
  id: string;
  name: string;
  gradeFrequencies: SubjectGradeFrequency[];
  scheduleCount: number;
  assessmentCount: number;
}

export interface SaveSubjectInput {
  name: string;
  gradeFrequencies: Array<{
    grade: string;
    weeklyFrequency: number;
  }>;
}

interface NormalizedSubjectInput {
  name: string;
  gradeFrequencies: Array<{
    grade: string;
    weeklyFrequency: number;
  }>;
}

interface ResolvedGradeFrequency extends SubjectGradeFrequency {
  gradeId: string;
}

function validateSubjectInput(input: SaveSubjectInput): NormalizedSubjectInput {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.name !== 'string' ||
    !Array.isArray(input.gradeFrequencies) ||
    input.gradeFrequencies.length === 0
  ) {
    throw new BadRequestException('Informe o nome da matéria e sua frequência por ano escolar.');
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new BadRequestException('A matéria deve ter entre 1 e 80 caracteres.');
  }

  const seenGrades = new Set<string>();
  const gradeFrequencies = input.gradeFrequencies.map((assignment) => {
    if (
      !assignment ||
      typeof assignment.grade !== 'string' ||
      !Number.isInteger(assignment.weeklyFrequency) ||
      assignment.weeklyFrequency < 1 ||
      assignment.weeklyFrequency > 40
    ) {
      throw new BadRequestException('Informe um ano escolar e uma frequência de 1 a 40 aulas por semana.');
    }
    const grade = assignment.grade.trim();
    const gradeKey = grade.toLocaleLowerCase('pt-BR');
    if (grade.length < 1 || grade.length > 80 || seenGrades.has(gradeKey)) {
      throw new BadRequestException('Selecione anos escolares válidos sem repetições.');
    }
    seenGrades.add(gradeKey);
    return { grade, weeklyFrequency: assignment.weeklyFrequency };
  });

  return { name, gradeFrequencies };
}

const SUBJECT_SELECT = `
  SELECT school_subjects.id,
         school_subjects.name,
         COALESCE(grade_frequencies.items, '[]'::json) AS grade_frequencies,
         COALESCE(schedule_usage.schedule_count, 0)::integer AS schedule_count,
         COALESCE(assessment_usage.assessment_count, 0)::integer AS assessment_count
  FROM school_subjects
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'grade', grades.name,
               'weeklyFrequency', school_subject_grades.weekly_frequency
             )
             ORDER BY grades.name
           ) AS items
    FROM school_subject_grades
    JOIN grades
      ON grades.school_id = school_subject_grades.school_id
     AND grades.id = school_subject_grades.grade_id
    WHERE school_subject_grades.school_id = school_subjects.school_id
      AND school_subject_grades.subject_id = school_subjects.id
  ) AS grade_frequencies ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS schedule_count
    FROM class_schedules
    WHERE class_schedules.school_id = school_subjects.school_id
      AND class_schedules.subject_id = school_subjects.id
  ) AS schedule_usage ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS assessment_count
    FROM assessments
    WHERE assessments.school_id = school_subjects.school_id
      AND assessments.subject_id = school_subjects.id
  ) AS assessment_usage ON true`;

interface SubjectRow {
  id: string;
  name: string;
  grade_frequencies: SubjectGradeFrequency[];
  schedule_count: number;
  assessment_count: number;
}

function mapSubject(row: SubjectRow): SchoolSubject {
  return {
    id: row.id,
    name: row.name,
    gradeFrequencies: row.grade_frequencies,
    scheduleCount: row.schedule_count,
    assessmentCount: row.assessment_count,
  };
}

@Injectable()
export class SubjectsService {
  constructor(private readonly database: DatabaseService) {}

  async list(schoolId: string): Promise<SchoolSubject[]> {
    const result = await this.database.query<SubjectRow>(
      `${SUBJECT_SELECT}
       WHERE school_subjects.school_id = $1
       ORDER BY school_subjects.name`,
      [schoolId],
    );
    return result.rows.map(mapSubject);
  }

  async create(
    schoolId: string,
    createdBy: string,
    input: SaveSubjectInput,
  ): Promise<SchoolSubject> {
    const normalized = validateSubjectInput(input);
    try {
      return await this.database.transaction(async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO school_subjects (school_id, name, created_by)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [schoolId, normalized.name, createdBy],
        );
        const subjectId = inserted.rows[0]?.id;
        if (!subjectId) {
          throw new Error('Não foi possível salvar a matéria.');
        }

        const gradeFrequencies = await this.resolveGradeFrequencies(
          client,
          schoolId,
          normalized.gradeFrequencies,
        );
        await this.saveGradeFrequencies(client, schoolId, subjectId, gradeFrequencies);
        await this.audit(client, schoolId, createdBy, 'subject.created', subjectId, {
          name: normalized.name,
          gradeFrequencies: normalized.gradeFrequencies,
        });
        return {
          id: subjectId,
          name: normalized.name,
          gradeFrequencies: gradeFrequencies.map(({ grade, weeklyFrequency }) => ({
            grade,
            weeklyFrequency,
          })),
          scheduleCount: 0,
          assessmentCount: 0,
        };
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
    const normalized = validateSubjectInput(input);
    try {
      return await this.database.transaction(async (client) => {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM school_subjects
           WHERE school_id = $1 AND id = $2
           FOR UPDATE`,
          [schoolId, subjectId],
        );
        if (!existing.rows[0]) {
          throw new NotFoundException('Matéria não encontrada.');
        }

        const gradeFrequencies = await this.resolveGradeFrequencies(
          client,
          schoolId,
          normalized.gradeFrequencies,
        );
        const requestedGradeIds = gradeFrequencies.map((assignment) => assignment.gradeId);
        const removedAssignments = await client.query<{
          grade: string;
          schedule_used: boolean;
          assessment_used: boolean;
        }>(
          `SELECT grades.name AS grade,
                  EXISTS (
                    SELECT 1
                    FROM classes
                    JOIN class_schedules
                      ON class_schedules.school_id = classes.school_id
                     AND class_schedules.class_id = classes.id
                    WHERE classes.school_id = school_subject_grades.school_id
                      AND classes.grade_id = school_subject_grades.grade_id
                      AND class_schedules.subject_id = school_subject_grades.subject_id
                  ) AS schedule_used,
                  EXISTS (
                    SELECT 1
                    FROM classes
                    JOIN assessments
                      ON assessments.school_id = classes.school_id
                     AND assessments.class_id = classes.id
                    WHERE classes.school_id = school_subject_grades.school_id
                      AND classes.grade_id = school_subject_grades.grade_id
                      AND assessments.subject_id = school_subject_grades.subject_id
                  ) AS assessment_used
           FROM school_subject_grades
           JOIN grades
             ON grades.school_id = school_subject_grades.school_id
            AND grades.id = school_subject_grades.grade_id
           WHERE school_subject_grades.school_id = $1
             AND school_subject_grades.subject_id = $2
             AND NOT (school_subject_grades.grade_id = ANY($3::uuid[]))`,
          [schoolId, subjectId, requestedGradeIds],
        );
        const usedAssignment = removedAssignments.rows.find(
          (assignment) => assignment.schedule_used || assignment.assessment_used,
        );
        if (usedAssignment) {
          throw new ConflictException(
            `Não é possível remover a matéria do ano escolar ${usedAssignment.grade} porque ela já está vinculada a horários ou avaliações.`,
          );
        }

        const updated = await client.query<{ id: string; name: string }>(
          `UPDATE school_subjects
           SET name = $3
           WHERE school_id = $1 AND id = $2
           RETURNING id, name`,
          [schoolId, subjectId, normalized.name],
        );
        const updatedSubject = updated.rows[0];
        if (!updatedSubject) {
          throw new NotFoundException('Matéria não encontrada.');
        }

        await client.query(
          `DELETE FROM school_subject_grades
           WHERE school_id = $1 AND subject_id = $2
             AND NOT (grade_id = ANY($3::uuid[]))`,
          [schoolId, subjectId, requestedGradeIds],
        );
        await this.saveGradeFrequencies(client, schoolId, subjectId, gradeFrequencies);
        await this.audit(client, schoolId, updatedBy, 'subject.updated', subjectId, {
          name: normalized.name,
          gradeFrequencies: normalized.gradeFrequencies,
        });
        const counts = await this.countUsage(client, schoolId, subjectId);
        return {
          id: updatedSubject.id,
          name: updatedSubject.name,
          gradeFrequencies: gradeFrequencies.map(({ grade, weeklyFrequency }) => ({
            grade,
            weeklyFrequency,
          })),
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

  private async resolveGradeFrequencies(
    client: PoolClient,
    schoolId: string,
    assignments: NormalizedSubjectInput['gradeFrequencies'],
  ): Promise<ResolvedGradeFrequency[]> {
    const result = await client.query<{ id: string; name: string }>(
      `SELECT id, name
       FROM grades
       WHERE school_id = $1 AND name = ANY($2::text[])`,
      [schoolId, assignments.map((assignment) => assignment.grade)],
    );
    const gradesByName = new Map(result.rows.map((grade) => [grade.name, grade]));
    const resolved = assignments.map((assignment) => {
      const grade = gradesByName.get(assignment.grade);
      if (!grade) {
        throw new BadRequestException(`O ano escolar ${assignment.grade} não foi encontrado.`);
      }
      return {
        gradeId: grade.id,
        grade: grade.name,
        weeklyFrequency: assignment.weeklyFrequency,
      };
    });
    if (resolved.length !== assignments.length) {
      throw new BadRequestException('Não foi possível validar os anos escolares selecionados.');
    }
    return resolved;
  }

  private async saveGradeFrequencies(
    client: PoolClient,
    schoolId: string,
    subjectId: string,
    assignments: ResolvedGradeFrequency[],
  ) {
    for (const assignment of assignments) {
      await client.query(
        `INSERT INTO school_subject_grades
           (school_id, subject_id, grade_id, weekly_frequency)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (school_id, subject_id, grade_id)
         DO UPDATE SET weekly_frequency = EXCLUDED.weekly_frequency`,
        [schoolId, subjectId, assignment.gradeId, assignment.weeklyFrequency],
      );
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
    details: { name: string; gradeFrequencies?: NormalizedSubjectInput['gradeFrequencies'] },
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

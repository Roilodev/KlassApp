import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SchoolClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

export interface CreateSchoolClassInput {
  year: number;
  grade: string;
  name: string;
}

function validateClassInput(input: CreateSchoolClassInput) {
  if (!input || typeof input !== 'object') {
    throw new BadRequestException('Informe o ano, o ano escolar e a turma.');
  }
  if (
    typeof input.grade !== 'string' ||
    typeof input.name !== 'string' ||
    typeof input.year !== 'number'
  ) {
    throw new BadRequestException('Informe o ano, o ano escolar e a turma.');
  }
  const grade = input.grade.trim();
  const name = input.name.trim();

  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2200) {
    throw new BadRequestException('Informe um ano letivo válido.');
  }
  if (grade.length < 1 || grade.length > 80) {
    throw new BadRequestException('O ano escolar deve ter entre 1 e 80 caracteres.');
  }
  if (name.length < 1 || name.length > 40) {
    throw new BadRequestException('A turma deve ter entre 1 e 40 caracteres.');
  }
  return { year: input.year, grade, name };
}

@Injectable()
export class SchoolStructureService {
  constructor(private readonly database: DatabaseService) {}

  async listClasses(schoolId: string): Promise<SchoolClass[]> {
    const result = await this.database.query<{
      id: string;
      year: number;
      grade: string;
      name: string;
    }>(
      `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name
       FROM classes
       JOIN academic_years
         ON academic_years.id = classes.academic_year_id
        AND academic_years.school_id = classes.school_id
       JOIN grades
         ON grades.id = classes.grade_id
        AND grades.school_id = classes.school_id
       WHERE classes.school_id = $1
       ORDER BY academic_years.year DESC, grades.name, classes.name`,
      [schoolId],
    );
    return result.rows;
  }

  async createClass(
    schoolId: string,
    input: CreateSchoolClassInput,
  ): Promise<SchoolClass> {
    const { year, grade, name } = validateClassInput(input);

    const result = await this.database.query<{
      id: string;
      year: number;
      grade: string;
      name: string;
    }>(
      `WITH school_year AS (
         INSERT INTO academic_years (school_id, year)
         VALUES ($1, $2)
         ON CONFLICT (school_id, year)
         DO UPDATE SET year = EXCLUDED.year
         RETURNING id, year
       ),
       school_grade AS (
         INSERT INTO grades (school_id, name)
         VALUES ($1, $3)
         ON CONFLICT (school_id, name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name
       ),
       school_class AS (
         INSERT INTO classes (school_id, academic_year_id, grade_id, name)
         SELECT $1, school_year.id, school_grade.id, $4
         FROM school_year CROSS JOIN school_grade
         ON CONFLICT (school_id, academic_year_id, grade_id, name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id, academic_year_id, grade_id, name
       )
       SELECT school_class.id, school_year.year, school_grade.name AS grade, school_class.name
       FROM school_class
       JOIN school_year ON school_year.id = school_class.academic_year_id
       JOIN school_grade ON school_grade.id = school_class.grade_id`,
      [schoolId, year, grade, name],
    );

    const created = result.rows[0];
    if (!created) {
      throw new Error('Não foi possível salvar a turma.');
    }
    return created;
  }

  async updateClass(
    schoolId: string,
    actorId: string,
    classId: string,
    input: CreateSchoolClassInput,
  ): Promise<SchoolClass> {
    if (!UUID_PATTERN.test(classId)) {
      throw new BadRequestException('Informe uma turma válida.');
    }
    const { year, grade, name } = validateClassInput(input);

    try {
      return await this.database.transaction(async (client) => {
        const existing = await client.query<SchoolClass>(
          `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name
           FROM classes
           JOIN academic_years
             ON academic_years.id = classes.academic_year_id
            AND academic_years.school_id = classes.school_id
           JOIN grades
             ON grades.id = classes.grade_id
            AND grades.school_id = classes.school_id
           WHERE classes.school_id = $1 AND classes.id = $2
           FOR UPDATE OF classes`,
          [schoolId, classId],
        );
        const previous = existing.rows[0];
        if (!previous) {
          throw new NotFoundException('Turma não encontrada.');
        }

        const schoolYear = await client.query<{ id: string }>(
          `INSERT INTO academic_years (school_id, year)
           VALUES ($1, $2)
           ON CONFLICT (school_id, year)
           DO UPDATE SET year = EXCLUDED.year
           RETURNING id`,
          [schoolId, year],
        );
        const schoolGrade = await client.query<{ id: string }>(
          `INSERT INTO grades (school_id, name)
           VALUES ($1, $2)
           ON CONFLICT (school_id, name)
           DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [schoolId, grade],
        );
        const targetYearId = schoolYear.rows[0]?.id;
        const targetGradeId = schoolGrade.rows[0]?.id;
        if (!targetYearId || !targetGradeId) {
          throw new Error('Não foi possível atualizar a turma.');
        }

        if (previous.year !== year) {
          const history = await client.query<{ has_history: boolean }>(
            `SELECT
               EXISTS (
                 SELECT 1 FROM student_enrollments
                 WHERE school_id = $1 AND class_id = $2
               ) OR EXISTS (
                 SELECT 1 FROM assessments
                 WHERE school_id = $1 AND class_id = $2
               ) AS has_history`,
            [schoolId, classId],
          );
          if (history.rows[0]?.has_history) {
            throw new ConflictException(
              'Não é possível alterar o ano letivo de uma turma que possui matrículas ou avaliações registradas.',
            );
          }
        }

        const updated = await client.query<SchoolClass>(
          `UPDATE classes
           SET academic_year_id = $3, grade_id = $4, name = $5
           WHERE school_id = $1 AND id = $2
           RETURNING id, $6::integer AS year, $7::text AS grade, name`,
          [schoolId, classId, targetYearId, targetGradeId, name, year, grade],
        );
        const result = updated.rows[0];
        if (!result) {
          throw new NotFoundException('Turma não encontrada.');
        }

        await client.query(
          `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
           VALUES ($1, $2, 'class.updated', 'class', $3, $4::jsonb)`,
          [
            schoolId,
            actorId,
            classId,
            JSON.stringify({ previous, updated: result }),
          ],
        );
        return result;
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Já existe uma turma com este ano letivo, ano escolar e nome.',
        );
      }
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23503' &&
        'constraint' in error &&
        (error.constraint === 'student_enrollments_school_id_class_id_academic_year_id_fkey' ||
          error.constraint === 'assessments_school_id_class_id_academic_year_id_fkey')
      ) {
        throw new ConflictException(
          'Não é possível alterar o ano letivo de uma turma que possui matrículas ou avaliações registradas.',
        );
      }
      throw error;
    }
  }
}

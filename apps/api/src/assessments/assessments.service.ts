import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { SchoolRole } from '../auth/roles.decorator.js';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateAssessmentInput {
  classId: string;
  title: string;
  subject: string;
  scheduledOn: string;
  maxPoints: number;
}

export interface RecordAssessmentResultInput {
  studentId: string;
  score: number;
}

export interface AssessmentClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

export interface AssessmentRecord {
  id: string;
  classId: string;
  classLabel: string;
  year: number;
  title: string;
  subject: string;
  scheduledOn: string;
  maxPoints: number;
}

export interface AssessmentStudentResult {
  studentId: string;
  fullName: string;
  score: number | null;
  updatedAt: string | null;
}

interface AssessmentRow {
  id: string;
  class_id: string;
  class_label: string;
  year: number;
  title: string;
  subject: string;
  scheduled_on: string;
  max_points: string;
}

interface AssessmentQueryable {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

const ASSESSMENT_SELECT = `SELECT assessments.id, assessments.class_id,
                                  grades.name || ' · Turma ' || classes.name AS class_label,
                                  academic_years.year, assessments.title,
                                  assessments.subject, assessments.scheduled_on::text AS scheduled_on,
                                  assessments.max_points::text AS max_points
                           FROM assessments
                           JOIN classes
                             ON classes.school_id = assessments.school_id
                            AND classes.id = assessments.class_id
                           JOIN academic_years
                             ON academic_years.school_id = assessments.school_id
                            AND academic_years.id = assessments.academic_year_id
                           JOIN grades
                             ON grades.school_id = classes.school_id
                            AND grades.id = classes.grade_id`;

function mapAssessment(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    classId: row.class_id,
    classLabel: row.class_label,
    year: row.year,
    title: row.title,
    subject: row.subject,
    scheduledOn: row.scheduled_on,
    maxPoints: Number(row.max_points),
  };
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCFullYear() >= 2000 &&
    date.getUTCFullYear() <= 2200
  );
}

@Injectable()
export class AssessmentsService {
  constructor(private readonly database: DatabaseService) {}

  async listClasses(
    schoolId: string,
    userId: string,
    role: SchoolRole,
  ): Promise<AssessmentClass[]> {
    const result = await this.database.query<AssessmentClass>(
      `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1
         AND ($3::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = classes.school_id
             AND teacher_class_assignments.class_id = classes.id
             AND teacher_class_assignments.user_id = $2
         ))
       ORDER BY academic_years.year DESC, grades.name, classes.name`,
      [schoolId, userId, role],
    );
    return result.rows;
  }

  async list(
    schoolId: string,
    userId: string,
    role: SchoolRole,
  ): Promise<AssessmentRecord[]> {
    const result = await this.database.query<AssessmentRow>(
      `${ASSESSMENT_SELECT}
       WHERE assessments.school_id = $1
         AND ($3::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = assessments.school_id
             AND teacher_class_assignments.class_id = assessments.class_id
             AND teacher_class_assignments.user_id = $2
         ))
       ORDER BY assessments.scheduled_on DESC, assessments.created_at DESC`,
      [schoolId, userId, role],
    );
    return result.rows.map(mapAssessment);
  }

  async create(
    schoolId: string,
    createdBy: string,
    role: SchoolRole,
    input: CreateAssessmentInput,
  ): Promise<AssessmentRecord> {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.classId !== 'string' ||
      typeof input.title !== 'string' ||
      typeof input.subject !== 'string' ||
      typeof input.scheduledOn !== 'string' ||
      typeof input.maxPoints !== 'number'
    ) {
      throw new BadRequestException('Informe os dados da avaliação.');
    }
    const title = input.title.trim();
    const subject = input.subject.trim();
    if (!UUID_PATTERN.test(input.classId)) {
      throw new BadRequestException('Selecione uma turma válida.');
    }
    if (title.length < 1 || title.length > 160) {
      throw new BadRequestException('O título deve ter entre 1 e 160 caracteres.');
    }
    if (subject.length < 1 || subject.length > 80) {
      throw new BadRequestException('A disciplina deve ter entre 1 e 80 caracteres.');
    }
    if (!isValidDate(input.scheduledOn)) {
      throw new BadRequestException('Informe uma data válida para a avaliação.');
    }
    if (
      !Number.isFinite(input.maxPoints) ||
      input.maxPoints <= 0 ||
      input.maxPoints > 10000 ||
      Math.round(input.maxPoints * 100) !== input.maxPoints * 100
    ) {
      throw new BadRequestException('A pontuação máxima deve ser maior que zero e ter até duas casas decimais.');
    }

    return this.database.transaction(async (client) => {
      const schoolClass = await this.getClass(client, schoolId, createdBy, role, input.classId);
      if (!schoolClass) {
        throw new NotFoundException('A turma não foi encontrada ou não está atribuída a você.');
      }
      const result = await client.query<{ id: string }>(
        `INSERT INTO assessments
           (school_id, class_id, academic_year_id, title, subject, scheduled_on, max_points, created_by)
         SELECT $1, classes.id, classes.academic_year_id, $4, $5, $6::date, $7, $2
         FROM classes
         WHERE classes.school_id = $1 AND classes.id = $3
         RETURNING id`,
        [
          schoolId,
          createdBy,
          input.classId,
          title,
          subject,
          input.scheduledOn,
          input.maxPoints,
        ],
      );
      const assessmentId = result.rows[0]?.id;
      if (!assessmentId) {
        throw new Error('Não foi possível salvar a avaliação.');
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'assessment.created', 'assessment', $3, $4::jsonb)`,
        [
          schoolId,
          createdBy,
          assessmentId,
          JSON.stringify({
            classId: input.classId,
            title,
            subject,
            scheduledOn: input.scheduledOn,
            maxPoints: input.maxPoints,
          }),
        ],
      );
      return this.getAssessment(client, schoolId, createdBy, role, assessmentId);
    });
  }

  async listStudentResults(
    schoolId: string,
    userId: string,
    role: SchoolRole,
    assessmentId: string,
  ): Promise<AssessmentStudentResult[]> {
    if (!UUID_PATTERN.test(assessmentId)) {
      throw new BadRequestException('Avaliação inválida.');
    }
    const assessment = await this.getAssessment(
      this.database,
      schoolId,
      userId,
      role,
      assessmentId,
    );
    const result = await this.database.query<{
      student_id: string;
      full_name: string;
      score: string | null;
      updated_at: Date | null;
    }>(
      `SELECT students.id AS student_id, students.full_name,
              assessment_results.score::text AS score,
              assessment_results.updated_at
       FROM assessments
       JOIN student_enrollments
         ON student_enrollments.school_id = assessments.school_id
        AND student_enrollments.class_id = assessments.class_id
        AND student_enrollments.academic_year_id = assessments.academic_year_id
        AND student_enrollments.started_at <= assessments.scheduled_on
        AND (
          student_enrollments.status IN ('active', 'completed')
          OR student_enrollments.ended_at >= assessments.scheduled_on
        )
       JOIN students
         ON students.school_id = student_enrollments.school_id
        AND students.id = student_enrollments.student_id
       LEFT JOIN assessment_results
         ON assessment_results.school_id = assessments.school_id
        AND assessment_results.assessment_id = assessments.id
        AND assessment_results.student_id = students.id
       WHERE assessments.school_id = $1 AND assessments.id = $2
       ORDER BY students.full_name, students.id`,
      [schoolId, assessment.id],
    );
    return result.rows.map((row) => ({
      studentId: row.student_id,
      fullName: row.full_name,
      score: row.score === null ? null : Number(row.score),
      updatedAt: row.updated_at?.toISOString() ?? null,
    }));
  }

  async recordResult(
    schoolId: string,
    recordedBy: string,
    role: SchoolRole,
    assessmentId: string,
    input: RecordAssessmentResultInput,
  ): Promise<AssessmentStudentResult> {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.studentId !== 'string' ||
      typeof input.score !== 'number'
    ) {
      throw new BadRequestException('Informe o aluno e a pontuação.');
    }
    if (!UUID_PATTERN.test(assessmentId) || !UUID_PATTERN.test(input.studentId)) {
      throw new BadRequestException('Avaliação ou aluno inválido.');
    }
    if (
      !Number.isFinite(input.score) ||
      input.score < 0 ||
      Math.round(input.score * 100) !== input.score * 100
    ) {
      throw new BadRequestException('Informe uma pontuação válida com até duas casas decimais.');
    }

    return this.database.transaction(async (client) => {
      const assessment = await this.getAssessment(
        client,
        schoolId,
        recordedBy,
        role,
        assessmentId,
      );
      if (input.score > assessment.maxPoints) {
        throw new BadRequestException('A pontuação não pode ser maior que o valor da avaliação.');
      }

      const enrollment = await client.query<{ enrollment_id: string }>(
        `SELECT id AS enrollment_id
         FROM student_enrollments
         WHERE school_id = $1 AND student_id = $2
           AND class_id = $3 AND academic_year_id = $4 AND status = 'active'
         FOR UPDATE`,
        [schoolId, input.studentId, assessment.classId, assessment.yearId],
      );
      const enrollmentId = enrollment.rows[0]?.enrollment_id;
      if (!enrollmentId) {
        throw new NotFoundException('O aluno não possui matrícula ativa nesta turma.');
      }

      await client.query(
        `INSERT INTO assessment_results
           (school_id, assessment_id, class_id, academic_year_id,
            student_id, enrollment_id, score, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (school_id, assessment_id, student_id)
         DO UPDATE SET score = EXCLUDED.score,
                       enrollment_id = EXCLUDED.enrollment_id,
                       recorded_by = EXCLUDED.recorded_by,
                       updated_at = now()`,
        [
          schoolId,
          assessment.id,
          assessment.classId,
          assessment.yearId,
          input.studentId,
          enrollmentId,
          input.score,
          recordedBy,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'assessment.result_recorded', 'student', $3, $4::jsonb)`,
        [
          schoolId,
          recordedBy,
          input.studentId,
          JSON.stringify({ assessmentId: assessment.id, score: input.score }),
        ],
      );
      const student = await client.query<{
        full_name: string;
        score: string;
        updated_at: Date;
      }>(
        `SELECT students.full_name, assessment_results.score::text AS score,
                assessment_results.updated_at
         FROM assessment_results
         JOIN students
           ON students.school_id = assessment_results.school_id
          AND students.id = assessment_results.student_id
         WHERE assessment_results.school_id = $1
           AND assessment_results.assessment_id = $2
           AND assessment_results.student_id = $3`,
        [schoolId, assessment.id, input.studentId],
      );
      const saved = student.rows[0];
      if (!saved) {
        throw new Error('O resultado salvo não pôde ser carregado.');
      }
      return {
        studentId: input.studentId,
        fullName: saved.full_name,
        score: Number(saved.score),
        updatedAt: saved.updated_at.toISOString(),
      };
    });
  }

  private async getAssessment(
    database: AssessmentQueryable,
    schoolId: string,
    userId: string,
    role: SchoolRole,
    assessmentId: string,
  ): Promise<AssessmentRecord & { yearId: string }> {
    const result = await database.query<AssessmentRow & { academic_year_id: string }>(
      `${ASSESSMENT_SELECT.replace(
        'academic_years.year, assessments.title',
        'academic_years.year, assessments.academic_year_id, assessments.title',
      )}
       WHERE assessments.school_id = $1 AND assessments.id = $2
         AND ($4::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = assessments.school_id
             AND teacher_class_assignments.class_id = assessments.class_id
             AND teacher_class_assignments.user_id = $3
         ))`,
      [schoolId, assessmentId, userId, role],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('A avaliação não foi encontrada.');
    }
    return { ...mapAssessment(row), yearId: row.academic_year_id };
  }

  private async getClass(
    client: PoolClient,
    schoolId: string,
    userId: string,
    role: SchoolRole,
    classId: string,
  ): Promise<AssessmentClass | null> {
    const result = await client.query<AssessmentClass>(
      `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name
       FROM classes
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE classes.school_id = $1 AND classes.id = $2
         AND ($4::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = classes.school_id
             AND teacher_class_assignments.class_id = classes.id
             AND teacher_class_assignments.user_id = $3
         ))`,
      [schoolId, classId, userId, role],
    );
    return result.rows[0] ?? null;
  }
}

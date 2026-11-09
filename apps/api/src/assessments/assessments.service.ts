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
  subjectId: string;
  scheduledOn: string;
  maxPoints: number;
}

export interface UpdateAssessmentInput {
  title: string;
  subjectId: string;
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
  subjectId: string;
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
  subject_id: string;
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
                                  assessments.subject_id, school_subjects.name AS subject,
                                  assessments.scheduled_on::text AS scheduled_on,
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
                              AND grades.id = classes.grade_id
                             JOIN school_subjects
                               ON school_subjects.school_id = assessments.school_id
                              AND school_subjects.id = assessments.subject_id`;

function mapAssessment(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    classId: row.class_id,
    classLabel: row.class_label,
    year: row.year,
    title: row.title,
    subjectId: row.subject_id,
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

function validateAssessmentDetails(input: UpdateAssessmentInput) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.title !== 'string' ||
    typeof input.subjectId !== 'string' ||
    typeof input.scheduledOn !== 'string' ||
    typeof input.maxPoints !== 'number'
  ) {
    throw new BadRequestException('Informe os dados da avaliação.');
  }
  const title = input.title.trim();
  const subjectId = input.subjectId.trim();
  if (title.length < 1 || title.length > 160) {
    throw new BadRequestException('O título deve ter entre 1 e 160 caracteres.');
  }
  if (!UUID_PATTERN.test(subjectId)) {
    throw new BadRequestException('Selecione uma matéria válida.');
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
  return { title, subjectId };
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
    if (!input || typeof input !== 'object' || typeof input.classId !== 'string') {
      throw new BadRequestException('Informe os dados da avaliação.');
    }
    const { title, subjectId } = validateAssessmentDetails(input);
    if (!UUID_PATTERN.test(input.classId)) {
      throw new BadRequestException('Selecione uma turma válida.');
    }

    return this.database.transaction(async (client) => {
      const schoolClass = await this.getClass(client, schoolId, createdBy, role, input.classId);
      if (!schoolClass) {
        throw new NotFoundException('A turma não foi encontrada ou não está atribuída a você.');
      }
      const schoolSubject = await client.query(
        'SELECT id FROM school_subjects WHERE school_id = $1 AND id = $2',
        [schoolId, subjectId],
      );
      if (schoolSubject.rowCount !== 1) {
        throw new NotFoundException('A matéria selecionada não foi encontrada.');
      }
      await this.assertSubjectAssignedToClass(client, schoolId, input.classId, subjectId);
      const result = await client.query<{ id: string }>(
        `INSERT INTO assessments
           (school_id, class_id, academic_year_id, title, subject_id, scheduled_on, max_points, created_by)
         SELECT $1, classes.id, classes.academic_year_id, $4, $5, $6::date, $7, $2
         FROM classes
         WHERE classes.school_id = $1 AND classes.id = $3
         RETURNING id`,
        [
          schoolId,
          createdBy,
          input.classId,
          title,
          subjectId,
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
            subjectId,
            scheduledOn: input.scheduledOn,
            maxPoints: input.maxPoints,
          }),
        ],
      );
      return this.getAssessment(client, schoolId, createdBy, role, assessmentId);
    });
  }

  async update(
    schoolId: string,
    updatedBy: string,
    role: SchoolRole,
    assessmentId: string,
    input: UpdateAssessmentInput,
  ): Promise<AssessmentRecord> {
    if (!UUID_PATTERN.test(assessmentId)) {
      throw new BadRequestException('Avaliação inválida.');
    }
    const { title, subjectId } = validateAssessmentDetails(input);

    return this.database.transaction(async (client) => {
      const locked = await client.query(
        `SELECT id FROM assessments
         WHERE school_id = $1 AND id = $2
         FOR UPDATE`,
        [schoolId, assessmentId],
      );
      if (locked.rowCount !== 1) {
        throw new NotFoundException('A avaliação não foi encontrada.');
      }

      const assessment = await this.getAssessment(
        client,
        schoolId,
        updatedBy,
        role,
        assessmentId,
      );
      const subject = await client.query(
        'SELECT id FROM school_subjects WHERE school_id = $1 AND id = $2',
        [schoolId, subjectId],
      );
      if (subject.rowCount !== 1) {
        throw new NotFoundException('A matéria selecionada não foi encontrada.');
      }
      await this.assertSubjectAssignedToClass(client, schoolId, assessment.classId, subjectId);

      const resultLimit = await client.query<{ exceeds_maximum: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM assessment_results
           WHERE school_id = $1 AND assessment_id = $2 AND score > $3
         ) AS exceeds_maximum`,
        [schoolId, assessmentId, input.maxPoints],
      );
      if (resultLimit.rows[0]?.exceeds_maximum) {
        throw new BadRequestException(
          'A pontuação máxima não pode ser menor que um resultado já registrado.',
        );
      }

      await client.query(
        `UPDATE assessments
         SET title = $3, subject_id = $4, scheduled_on = $5::date,
             max_points = $6
         WHERE school_id = $1 AND id = $2`,
        [schoolId, assessmentId, title, subjectId, input.scheduledOn, input.maxPoints],
      );
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'assessment.updated', 'assessment', $3, $4::jsonb)`,
        [
          schoolId,
          updatedBy,
          assessmentId,
          JSON.stringify({
            previous: {
              title: assessment.title,
              subjectId: assessment.subjectId,
              scheduledOn: assessment.scheduledOn,
              maxPoints: assessment.maxPoints,
            },
            updated: {
              title,
              subjectId,
              scheduledOn: input.scheduledOn,
              maxPoints: input.maxPoints,
            },
          }),
        ],
      );
      return this.getAssessment(client, schoolId, updatedBy, role, assessmentId);
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
          OR EXISTS (
            SELECT 1 FROM assessment_results AS recorded_results
            WHERE recorded_results.school_id = assessments.school_id
              AND recorded_results.assessment_id = assessments.id
              AND recorded_results.student_id = student_enrollments.student_id
          )
        )
       JOIN students
         ON students.school_id = student_enrollments.school_id
        AND students.id = student_enrollments.student_id
       LEFT JOIN assessment_results
         ON assessment_results.school_id = assessments.school_id
        AND assessment_results.assessment_id = assessments.id
        AND assessment_results.student_id = students.id
       WHERE assessments.school_id = $1 AND assessments.id = $2
         AND (
           students.is_active = true
           OR assessments.scheduled_on <= students.leave_date
           OR assessment_results.id IS NOT NULL
         )
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
      const locked = await client.query(
        `SELECT id FROM assessments
         WHERE school_id = $1 AND id = $2
         FOR UPDATE`,
        [schoolId, assessmentId],
      );
      if (locked.rowCount !== 1) {
        throw new NotFoundException('A avaliação não foi encontrada.');
      }
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
           AND EXISTS (
             SELECT 1 FROM students
             WHERE students.school_id = student_enrollments.school_id
               AND students.id = student_enrollments.student_id
               AND students.is_active = true
           )
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

  private async assertSubjectAssignedToClass(
    client: PoolClient,
    schoolId: string,
    classId: string,
    subjectId: string,
  ) {
    const result = await client.query(
      `SELECT 1
       FROM classes
       JOIN school_subject_grades
         ON school_subject_grades.school_id = classes.school_id
        AND school_subject_grades.grade_id = classes.grade_id
       WHERE classes.school_id = $1
         AND classes.id = $2
         AND school_subject_grades.subject_id = $3
       FOR KEY SHARE OF school_subject_grades`,
      [schoolId, classId, subjectId],
    );
    if (result.rowCount !== 1) {
      throw new BadRequestException(
        'A matéria selecionada não está vinculada ao ano escolar desta turma.',
      );
    }
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

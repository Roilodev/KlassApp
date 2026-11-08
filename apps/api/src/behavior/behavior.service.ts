import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SchoolRole } from '../auth/roles.decorator.js';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = [
  'participation',
  'collaboration',
  'responsibility',
  'learning',
  'positive',
  'other',
] as const;

export type BehaviorCategory = (typeof CATEGORIES)[number];

export interface CreateBehaviorRecordInput {
  enrollmentId: string;
  category: BehaviorCategory;
  description: string;
  occurredOn: string;
}

export interface BehaviorClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

export interface BehaviorStudent {
  id: string;
  enrollmentId: string;
  fullName: string;
}

export interface BehaviorStudentSearchResult extends BehaviorStudent {
  classLabel: string;
}

export interface BehaviorRecord {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  classLabel: string;
  category: BehaviorCategory;
  description: string;
  occurredOn: string;
  recordedBy: string;
  createdAt: string;
}

interface BehaviorRow {
  id: string;
  enrollment_id: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_label: string;
  category: BehaviorCategory;
  description: string;
  occurred_on: string;
  recorded_by: string;
  created_at: Date;
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

function mapRecord(row: BehaviorRow): BehaviorRecord {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    studentId: row.student_id,
    studentName: row.student_name,
    classId: row.class_id,
    classLabel: row.class_label,
    category: row.category,
    description: row.description,
    occurredOn: row.occurred_on,
    recordedBy: row.recorded_by,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class BehaviorService {
  constructor(private readonly database: DatabaseService) {}

  async listClasses(
    schoolId: string,
    userId: string,
    role: SchoolRole,
  ): Promise<BehaviorClass[]> {
    const result = await this.database.query<BehaviorClass>(
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
         AND EXISTS (
           SELECT 1 FROM student_enrollments
           JOIN students
             ON students.school_id = student_enrollments.school_id
            AND students.id = student_enrollments.student_id
           WHERE student_enrollments.school_id = classes.school_id
             AND student_enrollments.class_id = classes.id
             AND student_enrollments.status = 'active'
             AND students.is_active = true
         )
       ORDER BY academic_years.year DESC, grades.name, classes.name`,
      [schoolId, userId, role],
    );
    return result.rows;
  }

  async listStudents(
    schoolId: string,
    userId: string,
    role: SchoolRole,
    classId: string,
  ): Promise<BehaviorStudent[]> {
    if (!UUID_PATTERN.test(classId)) {
      throw new BadRequestException('Turma inválida.');
    }
    const result = await this.database.query<BehaviorStudent>(
      `SELECT students.id, student_enrollments.id AS "enrollmentId",
              students.full_name AS "fullName"
       FROM classes
       JOIN student_enrollments
         ON student_enrollments.school_id = classes.school_id
        AND student_enrollments.class_id = classes.id
        AND student_enrollments.status = 'active'
       JOIN students
         ON students.school_id = student_enrollments.school_id
        AND students.id = student_enrollments.student_id
       WHERE classes.school_id = $1 AND classes.id = $2
         AND students.is_active = true
         AND ($4::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = classes.school_id
             AND teacher_class_assignments.class_id = classes.id
             AND teacher_class_assignments.user_id = $3
         ))
       ORDER BY students.full_name, students.id`,
      [schoolId, classId, userId, role],
    );
    return result.rows;
  }

  async searchStudents(
    schoolId: string,
    userId: string,
    role: SchoolRole,
    query: string,
  ): Promise<BehaviorStudentSearchResult[]> {
    const search = typeof query === 'string' ? query.trim() : '';
    if (search.length < 2 || search.length > 100) {
      throw new BadRequestException('A busca deve conter entre 2 e 100 caracteres.');
    }

    const result = await this.database.query<{
      id: string;
      enrollmentId: string;
      fullName: string;
      grade: string;
      className: string;
      year: number;
    }>(
      `SELECT students.id, student_enrollments.id AS "enrollmentId",
              students.full_name AS "fullName",
              grades.name AS grade, classes.name AS "className",
              academic_years.year
       FROM student_enrollments
       JOIN students
         ON students.school_id = student_enrollments.school_id
        AND students.id = student_enrollments.student_id
       JOIN classes
         ON classes.school_id = student_enrollments.school_id
        AND classes.id = student_enrollments.class_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       WHERE student_enrollments.school_id = $1
         AND student_enrollments.status = 'active'
         AND students.is_active = true
         AND (
           students.full_name ILIKE '%' || $2 || '%'
           OR grades.name ILIKE '%' || $2 || '%'
           OR classes.name ILIKE '%' || $2 || '%'
           OR grades.name || ' · Turma ' || classes.name ILIKE '%' || $2 || '%'
           OR academic_years.year::text ILIKE '%' || $2 || '%'
         )
         AND ($4::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = classes.school_id
             AND teacher_class_assignments.class_id = classes.id
             AND teacher_class_assignments.user_id = $3
         ))
       ORDER BY students.full_name, academic_years.year DESC,
                grades.name, classes.name
       LIMIT 50`,
      [schoolId, search, userId, role],
    );
    return result.rows.map((row) => ({
      id: row.id,
      enrollmentId: row.enrollmentId,
      fullName: row.fullName,
      classLabel: `${row.grade} · Turma ${row.className} · ${row.year}`,
    }));
  }

  async listRecords(
    schoolId: string,
    userId: string,
    role: SchoolRole,
    studentId: string,
  ): Promise<BehaviorRecord[]> {
    if (!UUID_PATTERN.test(studentId)) {
      throw new BadRequestException('Aluno inválido.');
    }
    const result = await this.database.query<BehaviorRow>(
      `SELECT behavior_records.id, behavior_records.enrollment_id,
              behavior_records.student_id, students.full_name AS student_name,
              behavior_records.class_id,
              grades.name || ' · Turma ' || classes.name AS class_label,
              behavior_records.category, behavior_records.description,
              behavior_records.occurred_on::text AS occurred_on,
              users.display_name AS recorded_by, behavior_records.created_at
       FROM behavior_records
       JOIN students
         ON students.school_id = behavior_records.school_id
        AND students.id = behavior_records.student_id
       JOIN classes
         ON classes.school_id = behavior_records.school_id
        AND classes.id = behavior_records.class_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       JOIN users ON users.id = behavior_records.created_by
       WHERE behavior_records.school_id = $1
         AND behavior_records.student_id = $2
         AND ($4::text = 'admin' OR EXISTS (
           SELECT 1 FROM teacher_class_assignments
           WHERE teacher_class_assignments.school_id = behavior_records.school_id
             AND teacher_class_assignments.class_id = behavior_records.class_id
             AND teacher_class_assignments.user_id = $3
         ))
       ORDER BY behavior_records.occurred_on DESC,
                behavior_records.created_at DESC, behavior_records.id DESC`,
      [schoolId, studentId, userId, role],
    );
    return result.rows.map(mapRecord);
  }

  async create(
    schoolId: string,
    createdBy: string,
    role: SchoolRole,
    input: CreateBehaviorRecordInput,
  ): Promise<BehaviorRecord> {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.enrollmentId !== 'string' ||
      typeof input.category !== 'string' ||
      typeof input.description !== 'string' ||
      typeof input.occurredOn !== 'string'
    ) {
      throw new BadRequestException('Informe os dados da observação.');
    }
    const description = input.description.trim();
    if (!UUID_PATTERN.test(input.enrollmentId)) {
      throw new BadRequestException('Selecione uma matrícula válida.');
    }
    if (!CATEGORIES.includes(input.category as BehaviorCategory)) {
      throw new BadRequestException('Selecione uma categoria válida.');
    }
    if (description.length < 1 || description.length > 1200) {
      throw new BadRequestException('A observação deve ter entre 1 e 1200 caracteres.');
    }
    if (!isValidDate(input.occurredOn)) {
      throw new BadRequestException('Informe uma data válida para a observação.');
    }

    return this.database.transaction(async (client) => {
      const enrollmentResult = await client.query<{
        id: string;
        student_id: string;
        class_id: string;
        academic_year_id: string;
      }>(
        `SELECT student_enrollments.id, student_enrollments.student_id,
                student_enrollments.class_id, student_enrollments.academic_year_id
         FROM student_enrollments
         WHERE student_enrollments.school_id = $1
           AND student_enrollments.id = $2
           AND student_enrollments.status = 'active'
           AND student_enrollments.started_at <= $3::date
           AND EXISTS (
             SELECT 1 FROM students
             WHERE students.school_id = student_enrollments.school_id
               AND students.id = student_enrollments.student_id
               AND students.is_active = true
           )
           AND ($5::text = 'admin' OR EXISTS (
             SELECT 1 FROM teacher_class_assignments
             WHERE teacher_class_assignments.school_id = student_enrollments.school_id
               AND teacher_class_assignments.class_id = student_enrollments.class_id
               AND teacher_class_assignments.user_id = $4
           ))
         FOR UPDATE`,
        [schoolId, input.enrollmentId, input.occurredOn, createdBy, role],
      );
      const enrollment = enrollmentResult.rows[0];
      if (!enrollment) {
        throw new NotFoundException(
          'A matrícula ativa não foi encontrada ou a turma não está atribuída a você.',
        );
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO behavior_records
           (school_id, enrollment_id, student_id, class_id, academic_year_id,
            category, description, occurred_on, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)
         RETURNING id`,
        [
          schoolId,
          enrollment.id,
          enrollment.student_id,
          enrollment.class_id,
          enrollment.academic_year_id,
          input.category,
          description,
          input.occurredOn,
          createdBy,
        ],
      );
      const recordId = result.rows[0]?.id;
      if (!recordId) {
        throw new Error('Não foi possível salvar a observação.');
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'behavior.record_created', 'student', $3, $4::jsonb)`,
        [
          schoolId,
          createdBy,
          enrollment.student_id,
          JSON.stringify({
            recordId,
            enrollmentId: enrollment.id,
            category: input.category,
            occurredOn: input.occurredOn,
          }),
        ],
      );

      const saved = await client.query<BehaviorRow>(
        `SELECT behavior_records.id, behavior_records.enrollment_id,
                behavior_records.student_id, students.full_name AS student_name,
                behavior_records.class_id,
                grades.name || ' · Turma ' || classes.name AS class_label,
                behavior_records.category, behavior_records.description,
                behavior_records.occurred_on::text AS occurred_on,
                users.display_name AS recorded_by, behavior_records.created_at
         FROM behavior_records
         JOIN students
           ON students.school_id = behavior_records.school_id
          AND students.id = behavior_records.student_id
         JOIN classes
           ON classes.school_id = behavior_records.school_id
          AND classes.id = behavior_records.class_id
         JOIN grades
           ON grades.school_id = classes.school_id
          AND grades.id = classes.grade_id
         JOIN users ON users.id = behavior_records.created_by
         WHERE behavior_records.school_id = $1 AND behavior_records.id = $2`,
        [schoolId, recordId],
      );
      const row = saved.rows[0];
      if (!row) {
        throw new Error('A observação salva não pôde ser carregada.');
      }
      return mapRecord(row);
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface ResponsibleInput {
  fullName: string;
  phone: string;
  relationship: string;
  notificationAuthorized: boolean;
}

export interface CreateStudentInput {
  fullName: string;
  academicYear: number;
  classId: string;
  responsibles: ResponsibleInput[];
}

export interface StudentRecord {
  id: string;
  fullName: string;
  hasPhoto: boolean;
  academicYear: number;
  grade: string;
  className: string;
  responsibles: Array<{
    id: string;
    fullName: string;
    phone: string;
    relationship: string;
    notificationAuthorized: boolean;
  }>;
}

@Injectable()
export class StudentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(schoolId: string): Promise<StudentRecord[]> {
    const result = await this.database.query<{
      id: string;
      full_name: string;
      academic_year: number;
      grade: string;
      class_name: string;
      has_photo: boolean;
      responsibles: StudentRecord['responsibles'];
    }>(
      `SELECT students.id,
              students.full_name,
              academic_years.year AS academic_year,
              grades.name AS grade,
              classes.name AS class_name,
              (students.photo_data IS NOT NULL) AS has_photo,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', responsible_contacts.id,
                    'fullName', responsible_contacts.full_name,
                    'phone', responsible_contacts.phone_e164,
                    'relationship', student_responsibles.relationship,
                    'notificationAuthorized', student_responsibles.notification_authorized
                  )
                  ORDER BY responsible_contacts.full_name
                ) FILTER (WHERE responsible_contacts.id IS NOT NULL),
                '[]'::json
              ) AS responsibles
       FROM students
       JOIN student_enrollments
         ON student_enrollments.school_id = students.school_id
        AND student_enrollments.student_id = students.id
        AND student_enrollments.status = 'active'
       JOIN academic_years
         ON academic_years.school_id = student_enrollments.school_id
        AND academic_years.id = student_enrollments.academic_year_id
       JOIN classes
         ON classes.school_id = student_enrollments.school_id
        AND classes.id = student_enrollments.class_id
       JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       LEFT JOIN student_responsibles
         ON student_responsibles.school_id = students.school_id
        AND student_responsibles.student_id = students.id
       LEFT JOIN responsible_contacts
         ON responsible_contacts.school_id = student_responsibles.school_id
        AND responsible_contacts.id = student_responsibles.responsible_id
       WHERE students.school_id = $1
       GROUP BY students.id, academic_years.year, grades.name, classes.name
       ORDER BY students.full_name`,
      [schoolId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      hasPhoto: row.has_photo,
      academicYear: row.academic_year,
      grade: row.grade,
      className: row.class_name,
      responsibles: row.responsibles,
    }));
  }

  async create(
    schoolId: string,
    actorId: string,
    input: CreateStudentInput,
  ): Promise<StudentRecord> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Informe os dados do aluno e da matrícula.');
    }

    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    if (fullName.length < 1 || fullName.length > 160) {
      throw new BadRequestException('O nome do aluno deve ter entre 1 e 160 caracteres.');
    }
    if (
      typeof input.academicYear !== 'number' ||
      !Number.isInteger(input.academicYear) ||
      input.academicYear < 2000 ||
      input.academicYear > 2200
    ) {
      throw new BadRequestException('Informe um ano letivo válido.');
    }
    if (typeof input.classId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.classId)) {
      throw new BadRequestException('Selecione uma turma válida.');
    }
    if (!Array.isArray(input.responsibles) || input.responsibles.length < 1 || input.responsibles.length > 5) {
      throw new BadRequestException('Informe de 1 a 5 responsáveis pelo aluno.');
    }

    const responsibles = input.responsibles.map((responsible) => {
      if (
        !responsible ||
        typeof responsible !== 'object' ||
        typeof responsible.fullName !== 'string' ||
        typeof responsible.phone !== 'string' ||
        typeof responsible.relationship !== 'string' ||
        typeof responsible.notificationAuthorized !== 'boolean'
      ) {
        throw new BadRequestException('Revise os dados dos responsáveis.');
      }

      const responsibleName = responsible.fullName.trim();
      const phone = this.normalizeBrazilianPhone(responsible.phone);
      const relationship = responsible.relationship.trim();
      if (responsibleName.length < 1 || responsibleName.length > 160) {
        throw new BadRequestException('O nome do responsável deve ter entre 1 e 160 caracteres.');
      }
      if (!phone) {
        throw new BadRequestException('Informe um telefone brasileiro válido com DDD.');
      }
      if (relationship.length < 1 || relationship.length > 80) {
        throw new BadRequestException('Informe o parentesco ou vínculo com o aluno.');
      }
      return {
        fullName: responsibleName,
        phone,
        relationship,
        notificationAuthorized: responsible.notificationAuthorized,
      };
    });

    const normalizedPhones = responsibles.map((responsible) => responsible.phone);
    if (new Set(normalizedPhones).size !== normalizedPhones.length) {
      throw new BadRequestException('Não repita o mesmo telefone nos responsáveis deste aluno.');
    }

    return this.database.transaction(async (client) => {
      const classResult = await client.query<{
        id: string;
        academic_year_id: string;
        year: number;
        grade: string;
        name: string;
      }>(
        `SELECT classes.id, classes.academic_year_id, academic_years.year,
                grades.name AS grade, classes.name
         FROM classes
         JOIN academic_years
           ON academic_years.school_id = classes.school_id
          AND academic_years.id = classes.academic_year_id
         JOIN grades
           ON grades.school_id = classes.school_id
          AND grades.id = classes.grade_id
         WHERE classes.school_id = $1 AND classes.id = $2`,
        [schoolId, input.classId],
      );
      const schoolClass = classResult.rows[0];
      if (!schoolClass) {
        throw new NotFoundException('A turma selecionada não existe nesta escola.');
      }
      if (schoolClass.year !== input.academicYear) {
        throw new BadRequestException('O ano letivo não corresponde à turma selecionada.');
      }

      const studentResult = await client.query<{ id: string }>(
        'INSERT INTO students (school_id, full_name, created_by) VALUES ($1, $2, $3) RETURNING id',
        [schoolId, fullName, actorId],
      );
      const studentId = studentResult.rows[0].id;

      const enrollmentResult = await client.query<{ id: string }>(
        `INSERT INTO student_enrollments
           (school_id, student_id, academic_year_id, class_id, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [schoolId, studentId, schoolClass.academic_year_id, schoolClass.id, actorId],
      );

      const createdResponsibles: StudentRecord['responsibles'] = [];
      for (const responsible of responsibles) {
        const contactResult = await client.query<{ id: string }>(
          `INSERT INTO responsible_contacts (school_id, full_name, phone_e164)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [schoolId, responsible.fullName, responsible.phone],
        );
        const responsibleId = contactResult.rows[0].id;
        await client.query(
          `INSERT INTO student_responsibles
             (school_id, student_id, responsible_id, relationship,
              notification_authorized, authorization_recorded_by, authorization_recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 THEN now() ELSE NULL END)`,
          [
            schoolId,
            studentId,
            responsibleId,
            responsible.relationship,
            responsible.notificationAuthorized,
            responsible.notificationAuthorized ? actorId : null,
          ],
        );
        createdResponsibles.push({
          id: responsibleId,
          fullName: responsible.fullName,
          phone: responsible.phone,
          relationship: responsible.relationship,
          notificationAuthorized: responsible.notificationAuthorized,
        });
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'student.created', 'student', $3, $4::jsonb)`,
        [
          schoolId,
          actorId,
          studentId,
          JSON.stringify({
            enrollmentId: enrollmentResult.rows[0].id,
            classId: schoolClass.id,
            responsibleCount: createdResponsibles.length,
          }),
        ],
      );

      return {
        id: studentId,
        fullName,
        hasPhoto: false,
        academicYear: schoolClass.year,
        grade: schoolClass.grade,
        className: schoolClass.name,
        responsibles: createdResponsibles,
      };
    });
  }

  private normalizeBrazilianPhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    const localDigits = digits.startsWith('55') ? digits.slice(2) : digits;
    if (!/^[1-9][0-9]{9,10}$/.test(localDigits)) {
      return null;
    }
    return `+55${localDigits}`;
  }
}

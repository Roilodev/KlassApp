import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { SchoolRole } from '../auth/roles.decorator.js';
import { DatabaseService } from '../database/database.service.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type PhotoMimeType = (typeof PHOTO_TYPES)[number];
type PhotoOwner = 'student' | 'teacher';

export interface LeaveInput {
  date: string;
  reason: string;
}

function isValidLeaveDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validateLeaveInput(input: LeaveInput): { date: string; reason: string } {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.date !== 'string' ||
    !isValidLeaveDate(input.date) ||
    typeof input.reason !== 'string'
  ) {
    throw new BadRequestException('Informe uma data e um motivo válidos para a baixa.');
  }
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 500) {
    throw new BadRequestException('O motivo da baixa deve ter entre 1 e 500 caracteres.');
  }
  return { date: input.date, reason };
}

export interface UpdateStudentProfileInput {
  fullName: string;
  homeAddress?: string;
  responsibles: Array<{
    id?: string;
    fullName: string;
    phone: string;
    relationship: string;
    notificationAuthorized: boolean;
  }>;
}

export interface UpdateTeacherProfileInput {
  displayName: string;
  email: string;
  phone: string;
  homeAddress?: string;
  classIds: string[];
  subjectIds?: string[];
}

interface PhotoRecord {
  photo_data: Buffer | null;
  photo_mime_type: PhotoMimeType | null;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly database: DatabaseService) {}

  async getStudentProfile(
    schoolId: string,
    userId: string,
    role: SchoolRole,
    studentId: string,
  ) {
    const student = await this.database.query(
      `SELECT students.id, students.full_name AS "fullName",
              CASE WHEN $4::text = 'admin' THEN students.home_address END AS "homeAddress",
              students.is_active AS "isActive",
              CASE WHEN $4::text = 'admin' THEN students.leave_date::text END AS "leaveDate",
              CASE WHEN $4::text = 'admin' THEN students.leave_reason END AS "leaveReason",
              schools.name AS "schoolName",
              students.created_at AS "createdAt",
              (students.photo_data IS NOT NULL) AS "hasPhoto",
              CASE WHEN $4::text = 'admin'
                    THEN students.photo_authorized_at END AS "photoAuthorizationDate",
              CASE WHEN $4::text = 'admin'
                    THEN photo_authorizer.display_name END AS "photoAuthorizedBy"
       FROM students
       JOIN schools ON schools.id = students.school_id
       LEFT JOIN users AS photo_authorizer
         ON photo_authorizer.id = students.photo_authorized_by
       WHERE students.school_id = $1 AND students.id = $2
         AND ($4::text = 'admin' OR EXISTS (
           SELECT 1
           FROM student_enrollments
           JOIN teacher_class_assignments
             ON teacher_class_assignments.school_id = student_enrollments.school_id
            AND teacher_class_assignments.class_id = student_enrollments.class_id
            AND teacher_class_assignments.user_id = $3
           WHERE student_enrollments.school_id = students.school_id
             AND student_enrollments.student_id = students.id
             AND students.is_active = true
             AND student_enrollments.status = 'active'
         ))`,
      [schoolId, studentId, userId, role],
    );
    if (!student.rows[0]) {
      throw new NotFoundException('Aluno não encontrado ou sem acesso autorizado.');
    }

    const [enrollments, responsibles, assessments, behavior, events, schedules] =
      await Promise.all([
        this.database.query(
          `SELECT academic_years.year, grades.name AS grade,
                  classes.name AS "className", student_enrollments.status,
                  student_enrollments.started_at AS "startedAt",
                  student_enrollments.ended_at AS "endedAt",
                  COALESCE(
                    json_agg(users.display_name ORDER BY users.display_name)
                      FILTER (WHERE users.id IS NOT NULL),
                    '[]'::json
                  ) AS teachers
           FROM student_enrollments
           JOIN academic_years
             ON academic_years.school_id = student_enrollments.school_id
            AND academic_years.id = student_enrollments.academic_year_id
           JOIN classes
             ON classes.school_id = student_enrollments.school_id
            AND classes.id = student_enrollments.class_id
           JOIN grades
             ON grades.school_id = classes.school_id
            AND grades.id = classes.grade_id
           LEFT JOIN teacher_class_assignments
             ON teacher_class_assignments.school_id = classes.school_id
            AND teacher_class_assignments.class_id = classes.id
           LEFT JOIN users ON users.id = teacher_class_assignments.user_id
           WHERE student_enrollments.school_id = $1
             AND student_enrollments.student_id = $2
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = student_enrollments.school_id
                 AND teacher_class_assignments.class_id = student_enrollments.class_id
                 AND teacher_class_assignments.user_id = $4
             ))
           GROUP BY student_enrollments.id, academic_years.year,
                    grades.name, classes.name
           ORDER BY academic_years.year DESC`,
          [schoolId, studentId, role, userId],
        ),
        this.database.query(
          `SELECT responsible_contacts.id,
                  responsible_contacts.full_name AS "fullName",
                  responsible_contacts.phone_e164 AS phone,
                  student_responsibles.relationship,
                  student_responsibles.notification_authorized AS "notificationAuthorized"
           FROM student_responsibles
           JOIN responsible_contacts
             ON responsible_contacts.school_id = student_responsibles.school_id
            AND responsible_contacts.id = student_responsibles.responsible_id
           WHERE student_responsibles.school_id = $1
             AND student_responsibles.student_id = $2
             AND $3::text = 'admin'
           ORDER BY responsible_contacts.full_name`,
          [schoolId, studentId, role],
        ),
        this.database.query(
          `SELECT assessments.id, assessments.title, school_subjects.name AS subject,
                  assessments.scheduled_on::text AS "scheduledOn",
                  assessments.max_points AS "maxPoints",
                  assessment_results.score,
                  grades.name || ' · Turma ' || classes.name AS "classLabel",
                  academic_years.year
           FROM student_enrollments
           JOIN assessments
             ON assessments.school_id = student_enrollments.school_id
            AND assessments.class_id = student_enrollments.class_id
            AND assessments.academic_year_id = student_enrollments.academic_year_id
           JOIN school_subjects
             ON school_subjects.school_id = assessments.school_id
            AND school_subjects.id = assessments.subject_id
           JOIN classes
             ON classes.school_id = assessments.school_id
            AND classes.id = assessments.class_id
           JOIN grades
             ON grades.school_id = classes.school_id
            AND grades.id = classes.grade_id
           JOIN academic_years
             ON academic_years.school_id = assessments.school_id
            AND academic_years.id = assessments.academic_year_id
           LEFT JOIN assessment_results
             ON assessment_results.school_id = assessments.school_id
            AND assessment_results.assessment_id = assessments.id
            AND assessment_results.student_id = student_enrollments.student_id
           WHERE student_enrollments.school_id = $1
             AND student_enrollments.student_id = $2
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = student_enrollments.school_id
                 AND teacher_class_assignments.class_id = student_enrollments.class_id
                 AND teacher_class_assignments.user_id = $4
             ))
           ORDER BY assessments.scheduled_on DESC, assessments.title`,
          [schoolId, studentId, role, userId],
        ),
        this.database.query(
          `SELECT behavior_records.id, behavior_records.category,
                  behavior_records.description,
                  behavior_records.occurred_on::text AS "occurredOn",
                  users.display_name AS "recordedBy",
                  grades.name || ' · Turma ' || classes.name AS "classLabel"
           FROM behavior_records
           JOIN classes
             ON classes.school_id = behavior_records.school_id
            AND classes.id = behavior_records.class_id
           JOIN grades
             ON grades.school_id = classes.school_id
            AND grades.id = classes.grade_id
           JOIN users ON users.id = behavior_records.created_by
           WHERE behavior_records.school_id = $1
             AND behavior_records.student_id = $2
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = behavior_records.school_id
                 AND teacher_class_assignments.class_id = behavior_records.class_id
                 AND teacher_class_assignments.user_id = $4
             ))
           ORDER BY behavior_records.occurred_on DESC,
                    behavior_records.created_at DESC`,
          [schoolId, studentId, role, userId],
        ),
        this.database.query(
          `SELECT school_events.id, school_events.title,
                  school_events.description, school_events.starts_at AS "startsAt",
                  school_events.location, school_events.status,
                  school_events.audience_type AS "audienceType"
           FROM school_events
           WHERE school_events.school_id = $1
             AND school_events.status <> 'draft'
             AND EXISTS (
               SELECT 1
               FROM student_enrollments
               JOIN classes ON classes.school_id = student_enrollments.school_id
                           AND classes.id = student_enrollments.class_id
               WHERE student_enrollments.school_id = school_events.school_id
                 AND student_enrollments.student_id = $2
                 AND (
                   school_events.audience_type = 'school'
                   OR school_events.class_id = classes.id
                   OR (
                     school_events.audience_type = 'grade'
                     AND school_events.grade_id = classes.grade_id
                     AND school_events.academic_year_id = classes.academic_year_id
                   )
                 )
             )
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1
               FROM student_enrollments AS accessible_enrollments
               JOIN teacher_class_assignments
                 ON teacher_class_assignments.school_id = accessible_enrollments.school_id
                AND teacher_class_assignments.class_id = accessible_enrollments.class_id
                AND teacher_class_assignments.user_id = $4
               JOIN classes AS accessible_classes
                 ON accessible_classes.school_id = accessible_enrollments.school_id
                AND accessible_classes.id = accessible_enrollments.class_id
               WHERE accessible_enrollments.school_id = school_events.school_id
                 AND accessible_enrollments.student_id = $2
                 AND accessible_enrollments.status = 'active'
                 AND (
                   school_events.audience_type = 'school'
                   OR school_events.class_id = accessible_classes.id
                   OR (
                     school_events.audience_type = 'grade'
                     AND school_events.grade_id = accessible_classes.grade_id
                     AND school_events.academic_year_id = accessible_classes.academic_year_id
                   )
                 )
             ))
           ORDER BY school_events.starts_at DESC`,
          [schoolId, studentId, role, userId],
        ),
        this.database.query(
          `SELECT academic_years.year, grades.name AS grade,
                  classes.name AS "className", class_schedules.day_of_week AS "dayOfWeek",
                  class_schedules.starts_at::text AS "startsAt",
                  class_schedules.ends_at::text AS "endsAt",
                  school_subjects.name AS subject,
                  users.display_name AS teacher
           FROM student_enrollments
           JOIN classes
             ON classes.school_id = student_enrollments.school_id
            AND classes.id = student_enrollments.class_id
           JOIN academic_years
             ON academic_years.school_id = classes.school_id
            AND academic_years.id = classes.academic_year_id
           JOIN grades
             ON grades.school_id = classes.school_id
            AND grades.id = classes.grade_id
           JOIN class_schedules
             ON class_schedules.school_id = classes.school_id
            AND class_schedules.class_id = classes.id
           JOIN school_subjects
             ON school_subjects.school_id = class_schedules.school_id
            AND school_subjects.id = class_schedules.subject_id
           LEFT JOIN users ON users.id = class_schedules.teacher_id
           WHERE student_enrollments.school_id = $1
             AND student_enrollments.student_id = $2
             AND ($3::text = 'admin' OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = student_enrollments.school_id
                 AND teacher_class_assignments.class_id = student_enrollments.class_id
                 AND teacher_class_assignments.user_id = $4
             ))
           ORDER BY academic_years.year DESC,
                    class_schedules.day_of_week, class_schedules.starts_at`,
          [schoolId, studentId, role, userId],
        ),
      ]);

    return {
      student: student.rows[0],
      enrollments: enrollments.rows,
      responsibles: responsibles.rows,
      assessments: assessments.rows,
      behavior: behavior.rows,
      events: events.rows,
      schedules: schedules.rows,
      responsiblesRestricted: role !== 'admin',
    };
  }

  async getTeacherProfile(schoolId: string, teacherId: string) {
    const teacher = await this.database.query(
      `SELECT users.id, users.display_name AS "displayName",
              users.email, users.created_at AS "createdAt", schools.name AS "schoolName",
              school_memberships.phone_e164 AS phone,
              school_memberships.home_address AS "homeAddress",
              school_memberships.is_active AS "isActive",
              school_memberships.leave_date::text AS "leaveDate",
              school_memberships.leave_reason AS "leaveReason",
              EXISTS (
                SELECT 1 FROM teacher_photos
                WHERE teacher_photos.school_id = school_memberships.school_id
                  AND teacher_photos.user_id = users.id
              ) AS "hasPhoto"
       FROM school_memberships
       JOIN users ON users.id = school_memberships.user_id
       JOIN schools ON schools.id = school_memberships.school_id
       WHERE school_memberships.school_id = $1
         AND school_memberships.user_id = $2
         AND school_memberships.role = 'teacher'`,
      [schoolId, teacherId],
    );
    if (!teacher.rows[0]) {
      throw new NotFoundException('Professor não encontrado nesta escola.');
    }
    const [classes, subjectAssignments, schedules, assessments, studentsCount, events] = await Promise.all([
      this.database.query(
        `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name
         FROM teacher_class_assignments
         JOIN classes
           ON classes.school_id = teacher_class_assignments.school_id
          AND classes.id = teacher_class_assignments.class_id
         JOIN academic_years
           ON academic_years.school_id = classes.school_id
          AND academic_years.id = classes.academic_year_id
         JOIN grades ON grades.school_id = classes.school_id
                    AND grades.id = classes.grade_id
         WHERE teacher_class_assignments.school_id = $1
           AND teacher_class_assignments.user_id = $2
         ORDER BY academic_years.year DESC, grades.name, classes.name`,
        [schoolId, teacherId],
      ),
      this.database.query<{ subject_id: string }>(
        `SELECT subject_id FROM teacher_subject_assignments
         WHERE school_id = $1 AND user_id = $2
         ORDER BY subject_id`,
        [schoolId, teacherId],
      ),
      this.database.query(
        `SELECT academic_years.year, grades.name AS grade, classes.name AS "className",
                class_schedules.day_of_week AS "dayOfWeek",
                class_schedules.starts_at::text AS "startsAt",
                class_schedules.ends_at::text AS "endsAt",
                school_subjects.name AS subject
         FROM class_schedules
         JOIN classes
           ON classes.school_id = class_schedules.school_id
          AND classes.id = class_schedules.class_id
         JOIN academic_years
           ON academic_years.school_id = classes.school_id
          AND academic_years.id = classes.academic_year_id
         JOIN grades ON grades.school_id = classes.school_id
                    AND grades.id = classes.grade_id
         JOIN school_subjects
           ON school_subjects.school_id = class_schedules.school_id
          AND school_subjects.id = class_schedules.subject_id
         WHERE class_schedules.school_id = $1
           AND class_schedules.teacher_id = $2
         ORDER BY academic_years.year DESC, class_schedules.day_of_week,
                  class_schedules.starts_at`,
        [schoolId, teacherId],
      ),
      this.database.query(
        `SELECT assessments.id, assessments.title, school_subjects.name AS subject,
                assessments.scheduled_on::text AS "scheduledOn",
                assessments.max_points AS "maxPoints",
                grades.name || ' · Turma ' || classes.name AS "classLabel",
                academic_years.year,
                (SELECT count(*)::int FROM assessment_results
                 WHERE assessment_results.school_id = assessments.school_id
                   AND assessment_results.assessment_id = assessments.id) AS "resultsRecorded"
         FROM assessments
         JOIN school_subjects
           ON school_subjects.school_id = assessments.school_id
          AND school_subjects.id = assessments.subject_id
         JOIN classes
           ON classes.school_id = assessments.school_id
          AND classes.id = assessments.class_id
         JOIN academic_years
           ON academic_years.school_id = classes.school_id
          AND academic_years.id = classes.academic_year_id
         JOIN grades ON grades.school_id = classes.school_id
                    AND grades.id = classes.grade_id
         WHERE assessments.school_id = $1
           AND (
             assessments.created_by = $2
             OR EXISTS (
               SELECT 1 FROM teacher_class_assignments
               WHERE teacher_class_assignments.school_id = assessments.school_id
                 AND teacher_class_assignments.class_id = assessments.class_id
                 AND teacher_class_assignments.user_id = $2
             )
           )
         ORDER BY assessments.scheduled_on DESC, assessments.title`,
        [schoolId, teacherId],
      ),
      this.database.query<{ count: number }>(
        `SELECT count(DISTINCT student_enrollments.student_id)::int AS count
         FROM student_enrollments
         JOIN teacher_class_assignments
           ON teacher_class_assignments.school_id = student_enrollments.school_id
          AND teacher_class_assignments.class_id = student_enrollments.class_id
         JOIN students
           ON students.school_id = student_enrollments.school_id
          AND students.id = student_enrollments.student_id
         WHERE student_enrollments.school_id = $1
           AND teacher_class_assignments.user_id = $2
           AND student_enrollments.status = 'active'
           AND students.is_active = true`,
        [schoolId, teacherId],
      ),
      this.database.query(
        `SELECT school_events.id, school_events.title, school_events.description,
                school_events.starts_at AS "startsAt", school_events.location,
                school_events.status, school_events.audience_type AS "audienceType",
                CASE
                  WHEN school_events.audience_type = 'school'
                    THEN 'Toda a escola'
                  WHEN school_events.audience_type = 'class'
                    THEN grades.name || ' · Turma ' || classes.name
                  ELSE grades.name || ' · ' || academic_years.year
                END AS "audience"
         FROM school_events
         LEFT JOIN classes
           ON classes.school_id = school_events.school_id
          AND classes.id = school_events.class_id
         LEFT JOIN grades
           ON grades.school_id = school_events.school_id
          AND grades.id = COALESCE(school_events.grade_id, classes.grade_id)
         LEFT JOIN academic_years
           ON academic_years.school_id = school_events.school_id
          AND academic_years.id = school_events.academic_year_id
         WHERE school_events.school_id = $1
           AND school_events.status <> 'draft'
           AND (
             school_events.created_by = $2
             OR EXISTS (
               SELECT 1
               FROM teacher_class_assignments
               JOIN classes AS assigned_classes
                 ON assigned_classes.school_id = teacher_class_assignments.school_id
                AND assigned_classes.id = teacher_class_assignments.class_id
               WHERE teacher_class_assignments.school_id = school_events.school_id
                 AND teacher_class_assignments.user_id = $2
                 AND (
                   school_events.audience_type = 'school'
                   OR school_events.class_id = assigned_classes.id
                   OR (
                     school_events.audience_type = 'grade'
                     AND school_events.grade_id = assigned_classes.grade_id
                     AND school_events.academic_year_id = assigned_classes.academic_year_id
                   )
                 )
             )
           )
         ORDER BY school_events.starts_at DESC`,
        [schoolId, teacherId],
      ),
    ]);
    return {
      teacher: teacher.rows[0],
      classes: classes.rows,
      subjectIds: subjectAssignments.rows.map((row) => row.subject_id),
      schedules: schedules.rows,
      assessments: assessments.rows,
      studentsCount: studentsCount.rows[0].count,
      events: events.rows,
    };
  }

  async updateStudentProfile(
    schoolId: string,
    actorId: string,
    studentId: string,
    input: UpdateStudentProfileInput,
  ) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Informe os dados do aluno e dos responsáveis.');
    }
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    if (fullName.length < 1 || fullName.length > 160) {
      throw new BadRequestException('O nome do aluno deve ter entre 1 e 160 caracteres.');
    }
    if (input.homeAddress !== undefined && typeof input.homeAddress !== 'string') {
      throw new BadRequestException('Informe um endereço residencial válido.');
    }
    const requestedHomeAddress = typeof input.homeAddress === 'string'
      ? input.homeAddress.trim()
      : undefined;
    if ((requestedHomeAddress ?? '').length > 300) {
      throw new BadRequestException('O endereço residencial deve ter no máximo 300 caracteres.');
    }
    if (!Array.isArray(input.responsibles) || input.responsibles.length < 1 || input.responsibles.length > 5) {
      throw new BadRequestException('Informe de 1 a 5 responsáveis pelo aluno.');
    }

    const responsibles = input.responsibles.map((responsible) => {
      if (
        !responsible ||
        typeof responsible !== 'object' ||
        (responsible.id !== undefined && (
          typeof responsible.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responsible.id)
        )) ||
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
        id: responsible.id,
        fullName: responsibleName,
        phone,
        relationship,
        notificationAuthorized: responsible.notificationAuthorized,
      };
    });

    const phones = responsibles.map((responsible) => responsible.phone);
    const ids = responsibles.flatMap((responsible) => responsible.id ? [responsible.id] : []);
    if (new Set(phones).size !== phones.length) {
      throw new BadRequestException('Não repita o mesmo telefone nos responsáveis deste aluno.');
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Não repita o mesmo responsável.');
    }

    return this.database.transaction(async (client) => {
      const studentResult = await client.query<{ full_name: string; home_address: string | null }>(
        `SELECT full_name, home_address FROM students
         WHERE school_id = $1 AND id = $2
         FOR UPDATE`,
        [schoolId, studentId],
      );
      if (!studentResult.rows[0]) {
        throw new NotFoundException('Aluno não encontrado nesta escola.');
      }
      const homeAddress = requestedHomeAddress ?? studentResult.rows[0].home_address ?? '';
      const existingResult = await client.query<{
        id: string;
        phone_e164: string;
        full_name: string;
        linked_students: number;
      }>(
        `SELECT responsible_contacts.id, responsible_contacts.phone_e164,
                responsible_contacts.full_name,
                (SELECT count(*)::integer
                 FROM student_responsibles AS linked_responsibles
                 WHERE linked_responsibles.school_id = responsible_contacts.school_id
                   AND linked_responsibles.responsible_id = responsible_contacts.id
                ) AS linked_students
         FROM student_responsibles
         JOIN responsible_contacts
           ON responsible_contacts.school_id = student_responsibles.school_id
          AND responsible_contacts.id = student_responsibles.responsible_id
         WHERE student_responsibles.school_id = $1
           AND student_responsibles.student_id = $2
         FOR UPDATE OF student_responsibles, responsible_contacts`,
        [schoolId, studentId],
      );
      const existingIds = new Set(existingResult.rows.map((row) => row.id));
      if (ids.some((id) => !existingIds.has(id))) {
        throw new BadRequestException('Um responsável selecionado não pertence a este aluno.');
      }

      await client.query(
        'UPDATE students SET full_name = $3, home_address = $4 WHERE school_id = $1 AND id = $2',
        [schoolId, studentId, fullName, homeAddress || null],
      );
      const updatedResponsibles: Array<{
        id: string;
        fullName: string;
        phone: string;
        relationship: string;
        notificationAuthorized: boolean;
      }> = [];
      for (const responsible of responsibles) {
        let responsibleId = responsible.id;
        if (responsibleId) {
          const existing = existingResult.rows.find((row) => row.id === responsibleId);
          if (!existing) {
            throw new BadRequestException('Um responsável selecionado não pertence a este aluno.');
          }
          const phoneChanged = existing.phone_e164 !== responsible.phone;
          const contactChanged = phoneChanged || existing.full_name !== responsible.fullName;
          if (contactChanged && existing.linked_students > 1) {
            const contact = await client.query<{ id: string }>(
              `INSERT INTO responsible_contacts (school_id, full_name, phone_e164)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [schoolId, responsible.fullName, responsible.phone],
            );
            const newResponsibleId = contact.rows[0].id;
            await client.query(
              `UPDATE student_responsibles
               SET responsible_id = $4
               WHERE school_id = $1 AND student_id = $2 AND responsible_id = $3`,
              [schoolId, studentId, responsibleId, newResponsibleId],
            );
            responsibleId = newResponsibleId;
          } else {
            await client.query(
              `UPDATE responsible_contacts
               SET full_name = $3, phone_e164 = $4
               WHERE school_id = $1 AND id = $2`,
              [schoolId, responsibleId, responsible.fullName, responsible.phone],
            );
          }
          await client.query(
            `UPDATE student_responsibles
             SET relationship = $4,
                 notification_authorized = $5,
                 authorization_recorded_by = CASE
                   WHEN $5 AND (NOT student_responsibles.notification_authorized OR $6::boolean)
                     THEN $7
                   WHEN $5 THEN student_responsibles.authorization_recorded_by
                   ELSE NULL
                 END,
                 authorization_recorded_at = CASE
                   WHEN $5 AND (NOT student_responsibles.notification_authorized OR $6::boolean)
                     THEN now()
                   WHEN $5 THEN student_responsibles.authorization_recorded_at
                   ELSE NULL
                 END
             WHERE school_id = $1 AND student_id = $2 AND responsible_id = $3`,
            [
              schoolId,
              studentId,
              responsibleId,
              responsible.relationship,
              responsible.notificationAuthorized,
              phoneChanged,
              actorId,
            ],
          );
        } else {
          const contact = await client.query<{ id: string }>(
            `INSERT INTO responsible_contacts (school_id, full_name, phone_e164)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [schoolId, responsible.fullName, responsible.phone],
          );
          responsibleId = contact.rows[0].id;
          await client.query(
            `INSERT INTO student_responsibles
               (school_id, student_id, responsible_id, relationship,
                notification_authorized, authorization_recorded_by, authorization_recorded_at)
             VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN $6::uuid ELSE NULL END,
                     CASE WHEN $5 THEN now() ELSE NULL END)`,
            [
              schoolId,
              studentId,
              responsibleId,
              responsible.relationship,
              responsible.notificationAuthorized,
              actorId,
            ],
          );
        }
        updatedResponsibles.push({ ...responsible, id: responsibleId });
      }

      const removedIds = [...existingIds].filter((id) => !ids.includes(id));
      if (removedIds.length > 0) {
        await client.query(
          `DELETE FROM student_responsibles
           WHERE school_id = $1 AND student_id = $2 AND responsible_id = ANY($3::uuid[])`,
          [schoolId, studentId, removedIds],
        );
        await client.query(
          `DELETE FROM responsible_contacts
           WHERE school_id = $1 AND id = ANY($2::uuid[])
             AND NOT EXISTS (
               SELECT 1 FROM student_responsibles
               WHERE student_responsibles.school_id = responsible_contacts.school_id
                 AND student_responsibles.responsible_id = responsible_contacts.id
             )`,
          [schoolId, removedIds],
        );
      }

      const nameChanged = studentResult.rows[0].full_name !== fullName;
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'student.updated', 'student', $3, $4::jsonb)`,
        [
          schoolId,
          actorId,
          studentId,
          JSON.stringify({
            nameChanged,
            homeAddressChanged: studentResult.rows[0].home_address !== (homeAddress || null),
            responsibleCount: updatedResponsibles.length,
            responsibleChanges: {
              added: responsibles.filter((responsible) => !responsible.id).length,
              removed: removedIds.length,
              updated: ids.length,
            },
          }),
        ],
      );
      return { id: studentId, fullName, homeAddress, responsibles: updatedResponsibles };
    });
  }

  async updateTeacherProfile(
    schoolId: string,
    actorId: string,
    teacherId: string,
    input: UpdateTeacherProfileInput,
  ) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      typeof input.displayName !== 'string' ||
      typeof input.email !== 'string' ||
      typeof input.phone !== 'string' ||
      (input.homeAddress !== undefined && typeof input.homeAddress !== 'string') ||
      !Array.isArray(input.classIds) ||
      (input.subjectIds !== undefined && !Array.isArray(input.subjectIds))
    ) {
      throw new BadRequestException('Informe nome, email, telefone e turmas do professor.');
    }
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    const phone = this.normalizeBrazilianPhone(input.phone);
    const requestedHomeAddress = typeof input.homeAddress === 'string'
      ? input.homeAddress.trim()
      : undefined;
    const classIds = [...new Set(input.classIds)];
    const subjectIds = input.subjectIds === undefined
      ? undefined
      : [...new Set(input.subjectIds)];
    if (displayName.length < 1 || displayName.length > 160) {
      throw new BadRequestException('O nome deve ter entre 1 e 160 caracteres.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException('Informe um email válido.');
    }
    if (!phone) {
      throw new BadRequestException('Informe um telefone brasileiro válido com DDD.');
    }
    if ((requestedHomeAddress ?? '').length > 300) {
      throw new BadRequestException('O endereço residencial deve ter no máximo 300 caracteres.');
    }
    if (
      classIds.length > 100 ||
      classIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
    ) {
      throw new BadRequestException('Selecione turmas válidas.');
    }
    if (
      subjectIds &&
      (subjectIds.length > 100 ||
        subjectIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id)))
    ) {
      throw new BadRequestException('Selecione matérias válidas.');
    }

    try {
      return await this.database.transaction(async (client) => {
        const teacherResult = await client.query<{
          display_name: string;
          email: string;
          phone_e164: string | null;
          home_address: string | null;
        }>(
          `SELECT users.display_name, users.email, school_memberships.phone_e164,
                  school_memberships.home_address
           FROM users
           JOIN school_memberships
             ON school_memberships.user_id = users.id
           WHERE school_memberships.school_id = $1
             AND school_memberships.user_id = $2
             AND school_memberships.role = 'teacher'
           FOR UPDATE OF users, school_memberships`,
          [schoolId, teacherId],
        );
        const teacher = teacherResult.rows[0];
        if (!teacher) {
          throw new NotFoundException('Professor não encontrado nesta escola.');
        }
        const homeAddress = requestedHomeAddress ?? teacher.home_address ?? '';
        const classResult = await client.query<{
          id: string;
          year: number;
          grade: string;
          name: string;
        }>(
          `SELECT classes.id, academic_years.year, grades.name AS grade, classes.name
           FROM classes
           JOIN academic_years
             ON academic_years.school_id = classes.school_id
            AND academic_years.id = classes.academic_year_id
           JOIN grades
             ON grades.school_id = classes.school_id
            AND grades.id = classes.grade_id
           WHERE classes.school_id = $1 AND classes.id = ANY($2::uuid[])
           ORDER BY academic_years.year DESC, grades.name, classes.name`,
          [schoolId, classIds],
        );
        if (classResult.rowCount !== classIds.length) {
          throw new BadRequestException('Uma ou mais turmas não pertencem a esta escola.');
        }
        if (subjectIds) {
          const subjectResult = await client.query(
            `SELECT id FROM school_subjects
             WHERE school_id = $1 AND id = ANY($2::uuid[])`,
            [schoolId, subjectIds],
          );
          if (subjectResult.rowCount !== subjectIds.length) {
            throw new BadRequestException('Uma ou mais matérias não pertencem a esta escola.');
          }
        }
        const currentClasses = await client.query<{ class_id: string }>(
          `SELECT class_id FROM teacher_class_assignments
           WHERE school_id = $1 AND user_id = $2
           FOR UPDATE`,
          [schoolId, teacherId],
        );
        const removedClassIds = currentClasses.rows
          .map((row) => row.class_id)
          .filter((id) => !classIds.includes(id));
        if (removedClassIds.length > 0) {
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1), 0)',
            [schoolId],
          );
          const scheduled = await client.query<{ class_id: string }>(
            `SELECT DISTINCT class_id FROM class_schedules
             WHERE school_id = $1 AND teacher_id = $2
               AND class_id = ANY($3::uuid[])`,
            [schoolId, teacherId, removedClassIds],
          );
          if (scheduled.rows.length > 0) {
            throw new ConflictException(
              'Reatribua ou remova os horários deste professor antes de retirar as turmas correspondentes.',
            );
          }
        }

        await client.query(
          'UPDATE users SET display_name = $2, email = $3 WHERE id = $1',
          [teacherId, displayName, email],
        );
        await client.query(
          `UPDATE school_memberships
           SET phone_e164 = $3, home_address = $4
           WHERE school_id = $1 AND user_id = $2 AND role = 'teacher'`,
          [schoolId, teacherId, phone, homeAddress || null],
        );
        if (removedClassIds.length > 0) {
          await client.query(
            `DELETE FROM teacher_class_assignments
             WHERE school_id = $1 AND user_id = $2 AND class_id = ANY($3::uuid[])`,
            [schoolId, teacherId, removedClassIds],
          );
        }
        if (classIds.length > 0) {
          await client.query(
            `INSERT INTO teacher_class_assignments (school_id, user_id, class_id)
             SELECT $1, $2, assigned.class_id
             FROM unnest($3::uuid[]) AS assigned(class_id)
             ON CONFLICT (school_id, user_id, class_id) DO NOTHING`,
            [schoolId, teacherId, classIds],
          );
        }
        let updatedSubjectIds: string[];
        if (subjectIds) {
          await client.query(
            'DELETE FROM teacher_subject_assignments WHERE school_id = $1 AND user_id = $2',
            [schoolId, teacherId],
          );
          if (subjectIds.length > 0) {
            await client.query(
              `INSERT INTO teacher_subject_assignments (school_id, user_id, subject_id)
               SELECT $1, $2, assigned.subject_id
               FROM unnest($3::uuid[]) AS assigned(subject_id)
               ON CONFLICT (school_id, user_id, subject_id) DO NOTHING`,
              [schoolId, teacherId, subjectIds],
            );
          }
          updatedSubjectIds = subjectIds;
        } else {
          const currentSubjects = await client.query<{ subject_id: string }>(
            `SELECT subject_id FROM teacher_subject_assignments
             WHERE school_id = $1 AND user_id = $2
             ORDER BY subject_id`,
            [schoolId, teacherId],
          );
          updatedSubjectIds = currentSubjects.rows.map((row) => row.subject_id);
        }
        await client.query(
          `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
           VALUES ($1, $2, 'teacher.updated', 'teacher', $3, $4::jsonb)`,
          [
            schoolId,
            actorId,
            teacherId,
            JSON.stringify({
              nameChanged: teacher.display_name !== displayName,
              emailChanged: teacher.email !== email,
              phoneChanged: teacher.phone_e164 !== phone,
              homeAddressChanged: teacher.home_address !== (homeAddress || null),
              addedClassIds: classIds.filter(
                (id) => !currentClasses.rows.some((row) => row.class_id === id),
              ),
              removedClassIds,
            }),
          ],
        );
        if (subjectIds) {
          await client.query(
            `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, 'teacher.subjects_updated', 'teacher', $3, $4::jsonb)`,
            [schoolId, actorId, teacherId, JSON.stringify({ subjectIds })],
          );
        }
        return {
          id: teacherId,
          displayName,
          email,
          phone,
          homeAddress,
          classes: classResult.rows,
          subjectIds: updatedSubjectIds,
        };
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'users_email_lower_unique'
      ) {
        throw new ConflictException('Este email já pertence a outra conta.');
      }
      throw error;
    }
  }

  async leaveStudent(
    schoolId: string,
    actorId: string,
    studentId: string,
    input: LeaveInput,
  ) {
    const leave = validateLeaveInput(input);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE students
         SET is_active = false, leave_date = $3::date, leave_reason = $4
         WHERE school_id = $1 AND id = $2 AND is_active = true
         RETURNING id`,
        [schoolId, studentId, leave.date, leave.reason],
      );
      if (!updated.rows[0]) {
        throw new NotFoundException('Aluno não encontrado ou já está de baixa.');
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'student.left', 'student', $3, $4::jsonb)`,
        [schoolId, actorId, studentId, JSON.stringify(leave)],
      );
      return { id: studentId, isActive: false, leaveDate: leave.date, leaveReason: leave.reason };
    });
  }

  async reactivateStudent(schoolId: string, actorId: string, studentId: string) {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        `UPDATE students
         SET is_active = true, leave_date = NULL, leave_reason = NULL
         WHERE school_id = $1 AND id = $2 AND is_active = false
         RETURNING id`,
        [schoolId, studentId],
      );
      if (!updated.rows[0]) {
        throw new NotFoundException('Aluno não encontrado ou já está ativo.');
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'student.reactivated', 'student', $3, '{}'::jsonb)`,
        [schoolId, actorId, studentId],
      );
      return { id: studentId, isActive: true, leaveDate: null, leaveReason: null };
    });
  }

  async leaveTeacher(
    schoolId: string,
    actorId: string,
    teacherId: string,
    input: LeaveInput,
  ) {
    const leave = validateLeaveInput(input);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ user_id: string }>(
        `UPDATE school_memberships
         SET is_active = false, leave_date = $3::date, leave_reason = $4
         WHERE school_id = $1 AND user_id = $2
           AND role = 'teacher' AND is_active = true
         RETURNING user_id`,
        [schoolId, teacherId, leave.date, leave.reason],
      );
      if (!updated.rows[0]) {
        throw new NotFoundException('Professor não encontrado ou já está de baixa.');
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'teacher.left', 'teacher', $3, $4::jsonb)`,
        [schoolId, actorId, teacherId, JSON.stringify(leave)],
      );
      return { id: teacherId, isActive: false, leaveDate: leave.date, leaveReason: leave.reason };
    });
  }

  async reactivateTeacher(schoolId: string, actorId: string, teacherId: string) {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ user_id: string }>(
        `UPDATE school_memberships
         SET is_active = true, leave_date = NULL, leave_reason = NULL
         WHERE school_id = $1 AND user_id = $2
           AND role = 'teacher' AND is_active = false
         RETURNING user_id`,
        [schoolId, teacherId],
      );
      if (!updated.rows[0]) {
        throw new NotFoundException('Professor não encontrado ou já está ativo.');
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'teacher.reactivated', 'teacher', $3, '{}'::jsonb)`,
        [schoolId, actorId, teacherId],
      );
      return { id: teacherId, isActive: true, leaveDate: null, leaveReason: null };
    });
  }

  async getPhoto(
    owner: PhotoOwner,
    schoolId: string,
    personId: string,
    userId: string,
    role: SchoolRole,
  ) {
    if (owner === 'student' && role !== 'admin') {
      const access = await this.database.query(
        `SELECT 1
         FROM students
         JOIN student_enrollments
           ON student_enrollments.school_id = students.school_id
          AND student_enrollments.student_id = students.id
          AND student_enrollments.status = 'active'
         JOIN teacher_class_assignments
           ON teacher_class_assignments.school_id = student_enrollments.school_id
          AND teacher_class_assignments.class_id = student_enrollments.class_id
          AND teacher_class_assignments.user_id = $3
         WHERE students.school_id = $1 AND students.id = $2
           AND students.is_active = true
         LIMIT 1`,
        [schoolId, personId, userId],
      );
      if (!access.rows[0]) {
        throw new NotFoundException('Foto não encontrada.');
      }
    }
    if (owner === 'teacher' && role !== 'admin') {
      throw new NotFoundException('Foto não encontrada.');
    }
    const record = await this.findPhoto(owner, schoolId, personId);
    if (!record?.photo_data || !record.photo_mime_type) {
      throw new NotFoundException('Ainda não há uma foto cadastrada.');
    }
    return { data: record.photo_data, mimeType: record.photo_mime_type };
  }

  async savePhoto(
    owner: PhotoOwner,
    schoolId: string,
    actorId: string,
    personId: string,
    mimeType: string,
    data: unknown,
    photoAuthorizationConfirmed = false,
  ): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length === 0 || data.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException('A foto deve ter no máximo 5 MB.');
    }
    if (!PHOTO_TYPES.includes(mimeType as PhotoMimeType) || !this.matchesMime(data, mimeType)) {
      throw new BadRequestException('Use uma foto JPEG, PNG ou WebP válida.');
    }
    if (owner === 'student' && !photoAuthorizationConfirmed) {
      throw new BadRequestException('Confirme que a escola possui autorização documentada para armazenar a foto.');
    }

    await this.database.transaction(async (client) => {
      await this.assertPhotoAccess(client, owner, schoolId, personId, true);
      if (owner === 'student') {
        await client.query(
          `UPDATE students
           SET photo_data = $1, photo_mime_type = $2,
               photo_authorized_by = $3, photo_authorized_at = now()
           WHERE school_id = $4 AND id = $5`,
          [data, mimeType, actorId, schoolId, personId],
        );
      } else {
        await client.query(
          `INSERT INTO teacher_photos (school_id, user_id, photo_data, photo_mime_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (school_id, user_id) DO UPDATE
           SET photo_data = EXCLUDED.photo_data,
               photo_mime_type = EXCLUDED.photo_mime_type,
               updated_at = now()`,
          [schoolId, personId, data, mimeType],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)`,
        [
          schoolId,
          actorId,
          `${owner}.photo_updated`,
          owner,
          personId,
        ],
      );
    });
  }

  async deletePhoto(
    owner: PhotoOwner,
    schoolId: string,
    actorId: string,
    personId: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.assertPhotoAccess(client, owner, schoolId, personId, true);
      if (owner === 'student') {
        await client.query(
          `UPDATE students
           SET photo_data = NULL, photo_mime_type = NULL,
               photo_authorized_by = NULL, photo_authorized_at = NULL
           WHERE school_id = $1 AND id = $2`,
          [schoolId, personId],
        );
      } else {
        await client.query(
          'DELETE FROM teacher_photos WHERE school_id = $1 AND user_id = $2',
          [schoolId, personId],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)`,
        [schoolId, actorId, `${owner}.photo_deleted`, owner, personId],
      );
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

  private async findPhoto(owner: PhotoOwner, schoolId: string, personId: string) {
    if (owner === 'student') {
      const result = await this.database.query<PhotoRecord>(
        `SELECT photo_data, photo_mime_type FROM students
         WHERE school_id = $1 AND id = $2`,
        [schoolId, personId],
      );
      return result.rows[0];
    }
    const result = await this.database.query<PhotoRecord>(
      `SELECT teacher_photos.photo_data, teacher_photos.photo_mime_type
       FROM users
       JOIN school_memberships
         ON school_memberships.user_id = users.id
       JOIN teacher_photos
         ON teacher_photos.school_id = school_memberships.school_id
        AND teacher_photos.user_id = users.id
       WHERE school_memberships.school_id = $1
         AND school_memberships.user_id = $2
         AND school_memberships.role = 'teacher'`,
      [schoolId, personId],
    );
    return result.rows[0];
  }

  private async assertPhotoAccess(
    client: PoolClient,
    owner: PhotoOwner,
    schoolId: string,
    personId: string,
    activeOnly: boolean,
  ): Promise<void> {
    let result;
    if (owner === 'student') {
      result = await client.query(
        'SELECT id FROM students WHERE school_id = $1 AND id = $2 FOR UPDATE',
        [schoolId, personId],
      );
    } else {
      result = await client.query(
        `SELECT users.id FROM users
         JOIN school_memberships ON school_memberships.user_id = users.id
         WHERE school_memberships.school_id = $1
           AND school_memberships.user_id = $2
           AND school_memberships.role = 'teacher'
           AND ($3::boolean = false OR school_memberships.is_active = true)
         FOR UPDATE OF users`,
        [schoolId, personId, activeOnly],
      );
    }
    if (!result.rows[0]) {
      throw new NotFoundException('Pessoa não encontrada nesta escola.');
    }
  }

  private matchesMime(data: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/jpeg') {
      return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    return (
      mimeType === 'image/webp' &&
      data.length >= 12 &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP'
    );
  }
}

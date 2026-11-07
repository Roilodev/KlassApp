import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export interface CreateEventInput {
  title: string;
  description?: string;
  startsAt: string;
  location?: string;
  audienceType: 'school' | 'grade' | 'class';
  classId?: string;
  grade?: string;
  year?: number;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  audienceType: 'school' | 'grade' | 'class';
  audienceLabel: string;
  timeZone: string;
  status: 'published' | 'cancelled';
  createdAt: string;
}

interface EventRow {
  id: string;
  title: string;
  description: string;
  starts_at: Date;
  location: string;
  audience_type: 'school' | 'grade' | 'class';
  audience_label: string;
  time_zone: string;
  status: 'published' | 'cancelled';
  created_at: Date;
}

function mapEvent(row: EventRow): SchoolEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at.toISOString(),
    location: row.location,
    audienceType: row.audience_type,
    audienceLabel: row.audience_label,
    timeZone: row.time_zone,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

const EVENT_SELECT = `SELECT school_events.id, school_events.title,
                             school_events.description, school_events.starts_at,
                             school_events.location, school_events.audience_type,
                             school_events.status, school_events.created_at,
                             schools.timezone AS time_zone,
                             CASE
                               WHEN school_events.audience_type = 'school'
                                 THEN 'Toda a escola'
                               WHEN school_events.audience_type = 'class'
                                 THEN class_grade.name || ' · Turma ' || target_class.name
                                      || ' · ' || class_year.year
                               ELSE event_grade.name || ' · ' || event_year.year
                             END AS audience_label
                      FROM school_events
                      JOIN schools ON schools.id = school_events.school_id
                      LEFT JOIN classes AS target_class
                        ON target_class.school_id = school_events.school_id
                       AND target_class.id = school_events.class_id
                      LEFT JOIN grades AS class_grade
                        ON class_grade.school_id = target_class.school_id
                       AND class_grade.id = target_class.grade_id
                      LEFT JOIN academic_years AS class_year
                        ON class_year.school_id = target_class.school_id
                       AND class_year.id = target_class.academic_year_id
                      LEFT JOIN grades AS event_grade
                        ON event_grade.school_id = school_events.school_id
                       AND event_grade.id = school_events.grade_id
                      LEFT JOIN academic_years AS event_year
                        ON event_year.school_id = school_events.school_id
                       AND event_year.id = school_events.academic_year_id`;

@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

  async list(schoolId: string): Promise<SchoolEvent[]> {
    const result = await this.database.query<EventRow>(
      `${EVENT_SELECT}
       WHERE school_events.school_id = $1
       ORDER BY school_events.starts_at DESC, school_events.created_at DESC`,
      [schoolId],
    );
    return result.rows.map(mapEvent);
  }

  async create(
    schoolId: string,
    createdBy: string,
    input: CreateEventInput,
  ): Promise<SchoolEvent> {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.title !== 'string' ||
      typeof input.startsAt !== 'string' ||
      (input.audienceType !== 'school' &&
        input.audienceType !== 'grade' &&
        input.audienceType !== 'class')
    ) {
      throw new BadRequestException('Informe título, data e público do evento.');
    }

    const title = input.title.trim();
    const description = input.description ?? '';
    const location = input.location ?? '';
    if (title.length < 1 || title.length > 160) {
      throw new BadRequestException('O título deve ter entre 1 e 160 caracteres.');
    }
    if (typeof description !== 'string' || description.length > 2000) {
      throw new BadRequestException('A descrição pode ter no máximo 2000 caracteres.');
    }
    if (typeof location !== 'string' || location.length > 160) {
      throw new BadRequestException('O local pode ter no máximo 160 caracteres.');
    }
    if (!isValidLocalDateTime(input.startsAt)) {
      throw new BadRequestException('Informe uma data e hora válidas para o evento.');
    }
    if (
      input.audienceType === 'class' &&
      (typeof input.classId !== 'string' || !UUID_PATTERN.test(input.classId))
    ) {
      throw new BadRequestException('Selecione uma turma válida para o evento.');
    }
    if (
      input.audienceType === 'grade' &&
      (typeof input.grade !== 'string' ||
        input.grade.trim().length < 1 ||
        input.grade.trim().length > 80 ||
        !Number.isInteger(input.year) ||
        (input.year ?? 0) < 2000 ||
        (input.year ?? 0) > 2200)
    ) {
      throw new BadRequestException('Selecione o ano letivo e o ano escolar do evento.');
    }

    const eventId = await this.database.transaction(async (client) => {
      const audience = await this.resolveAudience(client, schoolId, input);
      const eventResult = await client.query<{ id: string }>(
        `INSERT INTO school_events
           (school_id, title, description, starts_at, location, audience_type,
            academic_year_id, grade_id, class_id, created_by)
         SELECT $1, $2, $3, $4::timestamp AT TIME ZONE schools.timezone,
                $5, $6, $7, $8, $9, $10
         FROM schools
         WHERE schools.id = $1
         RETURNING id`,
        [
          schoolId,
          title,
          description.trim(),
          input.startsAt,
          location.trim(),
          input.audienceType,
          audience.academicYearId,
          audience.gradeId,
          audience.classId,
          createdBy,
        ],
      );
      const eventId = eventResult.rows[0]?.id;
      if (!eventId) {
        throw new Error('Não foi possível salvar o evento.');
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'event.created', 'school_event', $3, $4::jsonb)`,
        [
          schoolId,
          createdBy,
          eventId,
          JSON.stringify({
            audienceType: input.audienceType,
            audienceLabel: audience.label,
            startsAt: input.startsAt,
          }),
        ],
      );
      return eventId;
    });

    const result = await this.database.query<EventRow>(
      `${EVENT_SELECT}
       WHERE school_events.school_id = $1 AND school_events.id = $2`,
      [schoolId, eventId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('O evento salvo não pôde ser carregado.');
    }
    return mapEvent(row);
  }

  async cancel(
    schoolId: string,
    cancelledBy: string,
    eventId: string,
  ): Promise<{ cancelled: true }> {
    if (!UUID_PATTERN.test(eventId)) {
      throw new BadRequestException('Evento inválido.');
    }

    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string; title: string }>(
        `UPDATE school_events
         SET status = 'cancelled', cancelled_by = $3, cancelled_at = now()
         WHERE school_id = $1 AND id = $2 AND status = 'published'
         RETURNING id, title`,
        [schoolId, eventId, cancelledBy],
      );
      const event = result.rows[0];
      if (!event) {
        const existing = await client.query(
          'SELECT 1 FROM school_events WHERE school_id = $1 AND id = $2',
          [schoolId, eventId],
        );
        if (existing.rowCount) {
          throw new ConflictException('Este evento já foi cancelado.');
        }
        throw new NotFoundException('O evento não foi encontrado.');
      }

      await client.query(
        `INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'event.cancelled', 'school_event', $3, $4::jsonb)`,
        [schoolId, cancelledBy, event.id, JSON.stringify({ title: event.title })],
      );
      return { cancelled: true };
    });
  }

  private async resolveAudience(
    client: PoolClient,
    schoolId: string,
    input: CreateEventInput,
  ): Promise<{
    academicYearId: string | null;
    gradeId: string | null;
    classId: string | null;
    label: string;
  }> {
    if (input.audienceType === 'school') {
      return {
        academicYearId: null,
        gradeId: null,
        classId: null,
        label: 'Toda a escola',
      };
    }

    if (input.audienceType === 'class') {
      if (typeof input.classId !== 'string' || !UUID_PATTERN.test(input.classId)) {
        throw new BadRequestException('Selecione uma turma válida para o evento.');
      }
      const result = await client.query<{
        class_id: string;
        class_name: string;
        grade: string;
        year: number;
      }>(
        `SELECT classes.id AS class_id, classes.name AS class_name,
                grades.name AS grade, academic_years.year
         FROM classes
         JOIN grades
           ON grades.school_id = classes.school_id AND grades.id = classes.grade_id
         JOIN academic_years
           ON academic_years.school_id = classes.school_id
          AND academic_years.id = classes.academic_year_id
         WHERE classes.school_id = $1 AND classes.id = $2`,
        [schoolId, input.classId],
      );
      const schoolClass = result.rows[0];
      if (!schoolClass) {
        throw new NotFoundException('A turma selecionada não foi encontrada.');
      }
      return {
        academicYearId: null,
        gradeId: null,
        classId: schoolClass.class_id,
        label: `${schoolClass.grade} · Turma ${schoolClass.class_name} · ${schoolClass.year}`,
      };
    }

    if (
      typeof input.grade !== 'string' ||
      !Number.isInteger(input.year) ||
      (input.year ?? 0) < 2000 ||
      (input.year ?? 0) > 2200
    ) {
      throw new BadRequestException('Selecione o ano letivo e o ano escolar do evento.');
    }
    const grade = input.grade.trim();
    if (grade.length < 1 || grade.length > 80) {
      throw new BadRequestException('Selecione um ano escolar válido.');
    }
    const result = await client.query<{
      grade_id: string;
      grade: string;
      academic_year_id: string;
      year: number;
    }>(
      `SELECT grades.id AS grade_id, grades.name AS grade,
              academic_years.id AS academic_year_id, academic_years.year
       FROM grades
       JOIN classes
         ON classes.school_id = grades.school_id AND classes.grade_id = grades.id
       JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       WHERE grades.school_id = $1 AND grades.name = $2 AND academic_years.year = $3
       LIMIT 1`,
      [schoolId, grade, input.year],
    );
    const gradeYear = result.rows[0];
    if (!gradeYear) {
      throw new NotFoundException('Não há turmas desse ano escolar no ano letivo selecionado.');
    }
    return {
      academicYearId: gradeYear.academic_year_id,
      gradeId: gradeYear.grade_id,
      classId: null,
      label: `${gradeYear.grade} · ${gradeYear.year}`,
    };
  }
}

function isValidLocalDateTime(value: string): boolean {
  if (!LOCAL_DATETIME_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 16) === value &&
    date.getUTCFullYear() >= 2000 &&
    date.getUTCFullYear() <= 2200
  );
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { EventsService } from './events.service.js';

const classId = '123e4567-e89b-42d3-a456-426614174000';
const eventId = 'c0a80123-e89b-42d3-a456-426614174000';
const validClassEvent = {
  title: 'Festa da primavera',
  description: 'Uma manhã de atividades.',
  startsAt: '2026-11-15T09:00',
  location: 'Pátio da escola',
  audienceType: 'class' as const,
  classId,
};

function makeService(
  queryHandler: (sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>,
) {
  const query = vi.fn(queryHandler);
  const transaction = vi.fn(
    (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query } as unknown as PoolClient),
  );
  const service = new EventsService({ query, transaction } as unknown as DatabaseService);
  return { service, query, transaction };
}

describe('EventsService', () => {
  it('returns the next published event for the school and teacher audience', async () => {
    const { service, query } = makeService(async () => ({
      rows: [{
        id: eventId,
        title: validClassEvent.title,
        description: validClassEvent.description,
        starts_at: new Date(validClassEvent.startsAt),
        location: validClassEvent.location,
        audience_type: 'class',
        audience_label: '4º ano · Turma A · 2026',
        time_zone: 'America/Sao_Paulo',
        status: 'published',
        created_at: new Date(validClassEvent.startsAt),
      }],
      rowCount: 1,
    }));

    await expect(service.nextFor('school-id', 'teacher-id', 'teacher')).resolves.toMatchObject({
      id: eventId,
      title: validClassEvent.title,
      audienceType: 'class',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("school_events.starts_at >= now()"),
      ['school-id', 'teacher-id', 'teacher'],
    );
    expect(query.mock.calls[0]?.[0]).toContain('teacher_class_assignments');
    expect(query.mock.calls[0]?.[0]).toContain('ORDER BY school_events.starts_at');
  });

  it('returns null when there is no upcoming event', async () => {
    const { service } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(service.nextFor('school-id', 'user-id', 'admin')).resolves.toBeNull();
  });

  it('lists events in chronological order', async () => {
    const { service, query } = makeService(async () => ({ rows: [], rowCount: 0 }));

    await expect(service.list('school-id')).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ORDER BY school_events.starts_at, school_events.created_at DESC',
      ),
      ['school-id'],
    );
  });

  it.each([
    ['blank title', { ...validClassEvent, title: '   ' }],
    ['invalid date', { ...validClassEvent, startsAt: 'not-a-date' }],
    ['malformed date', { ...validClassEvent, startsAt: '2026-02-31T09:00' }],
    ['missing class', { ...validClassEvent, classId: 'not-a-uuid' }],
    ['overlong description', { ...validClassEvent, description: 'x'.repeat(2001) }],
    ['invalid status', { ...validClassEvent, status: 'cancelled' }],
  ])('rejects %s before touching the database', async (_case, input) => {
    const { service, query, transaction } = makeService(async () => ({ rows: [], rowCount: 0 }));
    await expect(service.create('school-id', 'user-id', input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates a class event and records its audience in the audit log', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('FROM classes') && sql.includes('WHERE classes.school_id')) {
        return {
          rows: [{ class_id: classId, class_name: 'A', grade: '4º ano', year: 2026 }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO school_events')) {
        expect(sql).toContain('AT TIME ZONE schools.timezone');
        return { rows: [{ id: eventId }], rowCount: 1 };
      }
      if (sql.includes('SELECT school_events.id')) {
        return {
          rows: [{
            id: eventId,
            title: validClassEvent.title,
            description: validClassEvent.description,
            starts_at: new Date(validClassEvent.startsAt),
            location: validClassEvent.location,
            audience_type: 'class',
            audience_label: '4º ano · Turma A · 2026',
            time_zone: 'America/Sao_Paulo',
            status: 'published',
            created_at: new Date(validClassEvent.startsAt),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query, transaction } = makeService(queryHandler);

    await expect(
      service.create('school-id', 'user-id', validClassEvent),
    ).resolves.toMatchObject({
      id: eventId,
      audienceType: 'class',
      audienceLabel: '4º ano · Turma A · 2026',
      timeZone: 'America/Sao_Paulo',
      status: 'published',
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'event.created'"),
      expect.anything(),
    );
  });

  it('creates an event for the whole school without requiring a class', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO school_events')) {
        expect(sql).toContain('audience_type');
        return { rows: [{ id: eventId }], rowCount: 1 };
      }
      if (sql.includes('SELECT school_events.id')) {
        expect(sql).toContain("THEN 'Toda a escola'");
        return {
          rows: [{
            id: eventId,
            title: 'Reunião comunitária',
            description: '',
            starts_at: new Date('2026-11-15T12:00:00.000Z'),
            location: '',
            audience_type: 'school',
            audience_label: 'Toda a escola',
            time_zone: 'America/Sao_Paulo',
            status: 'published',
            created_at: new Date('2026-11-07T12:00:00.000Z'),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(service.create('school-id', 'user-id', {
      title: 'Reunião comunitária',
      startsAt: '2026-11-15T09:00',
      audienceType: 'school',
    })).resolves.toMatchObject({
      audienceType: 'school',
      audienceLabel: 'Toda a escola',
    });

    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO school_events'));
    expect(insertCall?.[1]).toEqual([
      'school-id',
      'Reunião comunitária',
      '',
      '2026-11-15T09:00',
      '',
      'school',
      null,
      null,
      null,
      'user-id',
      'published',
    ]);
  });

  it('creates an event as a draft when requested', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO school_events')) {
        return { rows: [{ id: eventId }], rowCount: 1 };
      }
      if (sql.includes('SELECT school_events.id')) {
        return {
          rows: [{
            id: eventId,
            title: 'Reunião comunitária',
            description: '',
            starts_at: new Date('2026-11-15T12:00:00.000Z'),
            location: '',
            audience_type: 'school',
            audience_label: 'Toda a escola',
            time_zone: 'America/Sao_Paulo',
            status: 'draft',
            created_at: new Date('2026-11-07T12:00:00.000Z'),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(service.create('school-id', 'user-id', {
      title: 'Reunião comunitária',
      startsAt: '2026-11-15T09:00',
      audienceType: 'school',
      status: 'draft',
    })).resolves.toMatchObject({ status: 'draft' });

    const insertCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO school_events'));
    expect(insertCall?.[1]?.at(-1)).toBe('draft');
  });

  it('updates event details and records the change in the audit log', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT status') && sql.includes('FOR UPDATE')) {
        return { rows: [{ status: 'published' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE school_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT school_events.id')) {
        return {
          rows: [{
            id: eventId,
            title: 'Evento atualizado',
            description: '',
            starts_at: new Date(validClassEvent.startsAt),
            location: '',
            audience_type: 'school',
            audience_label: 'Toda a escola',
            time_zone: 'America/Sao_Paulo',
            class_id: null,
            audience_grade: null,
            audience_year: null,
            status: 'published',
            created_at: new Date(validClassEvent.startsAt),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(service.update('school-id', 'user-id', eventId, {
      title: 'Evento atualizado',
      startsAt: validClassEvent.startsAt,
      audienceType: 'school',
    })).resolves.toMatchObject({
      id: eventId,
      title: 'Evento atualizado',
      status: 'published',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'event.updated'"),
      expect.anything(),
    );
  });

  it('publishes a draft and records the action in the audit log', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE school_events')) {
        return { rows: [{ id: eventId, title: 'Reunião comunitária' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(service.publish('school-id', 'user-id', eventId)).resolves.toEqual({
      published: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'event.published'"),
      expect.anything(),
    );
  });

  it('cancels a published event and audits the cancellation', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE school_events')) {
        return { rows: [{ id: eventId, title: validClassEvent.title }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const { service, query } = makeService(queryHandler);

    await expect(service.cancel('school-id', 'user-id', eventId)).resolves.toEqual({
      cancelled: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'event.cancelled'"),
      expect.anything(),
    );
  });

  it('does not cancel an already cancelled event twice', async () => {
    const queryHandler = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE school_events')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    });
    const { service } = makeService(queryHandler);

    await expect(service.cancel('school-id', 'user-id', eventId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

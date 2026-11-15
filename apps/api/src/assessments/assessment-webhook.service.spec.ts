import type { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { AssessmentWebhookService } from './assessment-webhook.service.js';

const assessment = {
  id: 'c0a80123-e89b-42d3-a456-426614174000',
  classId: '123e4567-e89b-42d3-a456-426614174000',
  classLabel: '4º ano · Turma A',
  year: 2026,
  title: 'Atividade do capítulo 3',
  subjectId: '223e4567-e89b-42d3-a456-426614174000',
  subject: 'Ciências',
  scheduledOn: '2026-11-15',
  maxPoints: 10,
};
const studentResult = {
  studentId: 'a0b80123-e89b-42d3-a456-426614174000',
  fullName: 'Estudante de teste',
  score: 8.5,
  updatedAt: '2026-11-15T12:00:00.000Z',
  whatsappAuthorized: true,
};

describe('AssessmentWebhookService', () => {
  it('queues the selected student, evaluation, and saved score', async () => {
    const clientQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const service = new AssessmentWebhookService(
      {} as DatabaseService,
      {
        getOrThrow: () => 'http://host.docker.internal:5678/webhook-test/test-id',
      } as ConfigService,
    );

    await service.enqueueAssessmentResult(
      { query: clientQuery } as unknown as PoolClient,
      'school-id',
      assessment,
      studentResult,
    );

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO assessment_webhook_outbox'),
      [
        'school-id',
        assessment.id,
        studentResult.studentId,
        JSON.stringify(assessment),
        JSON.stringify({ score: studentResult.score, updatedAt: studentResult.updatedAt }),
        JSON.stringify({
          assignedScore: studentResult.score,
          maxPoints: assessment.maxPoints,
        }),
      ],
    );
  });

  it('cancels a pending delivery if notification authorization is no longer active', async () => {
    const deliveryId = 'd0b80123-e89b-42d3-a456-426614174000';
    let deliveryClaimed = false;
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, school_id, student_id, payload, attempt_count')) {
        if (deliveryClaimed) {
          return { rows: [], rowCount: 0 };
        }
        deliveryClaimed = true;
        return {
          rows: [{
            id: deliveryId,
            school_id: 'school-id',
            student_id: studentResult.studentId,
            payload: { studentId: studentResult.studentId, evaluation: assessment, result: studentResult },
            attempt_count: 0,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const databaseQuery = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT EXISTS')) {
        return { rows: [{ authorized: false }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const database = {
      query: databaseQuery,
      transaction: vi.fn(
        (work: (client: PoolClient) => Promise<unknown>) =>
          work({ query: clientQuery } as unknown as PoolClient),
      ),
    } as unknown as DatabaseService;
    const service = new AssessmentWebhookService(
      database,
      { getOrThrow: () => 'http://localhost:5678/webhook/test' } as ConfigService,
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      service.wake();
      await vi.waitFor(() =>
        expect(databaseQuery).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'cancelled'"),
          [deliveryId],
        ),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

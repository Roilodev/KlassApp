import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type {
  AssessmentRecord,
  AssessmentStudentResult,
} from './assessments.service.js';

interface WebhookOutboxRow {
  id: string;
  school_id: string;
  student_id: string;
  payload: {
    studentId: string;
    evaluation: AssessmentRecord;
    result: {
      score: number;
      updatedAt: string | null;
    };
    assignedScore: number;
    maxPoints: number;
  };
  attempt_count: number;
}

export interface AssessmentWebhook {
  enqueueAssessmentResult(
    client: PoolClient,
    schoolId: string,
    evaluation: AssessmentRecord,
    result: AssessmentStudentResult,
  ): Promise<void>;
  wake(): void;
}

@Injectable()
export class AssessmentWebhookService
  implements AssessmentWebhook, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AssessmentWebhookService.name);
  private readonly webhookUrl: string;
  private dispatchPromise: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    const webhookUrl = new URL(config.getOrThrow<string>('ASSESSMENT_WEBHOOK_URL'));
    if (webhookUrl.protocol !== 'http:' && webhookUrl.protocol !== 'https:') {
      throw new Error('ASSESSMENT_WEBHOOK_URL must use HTTP or HTTPS.');
    }
    this.webhookUrl = webhookUrl.toString();
  }

  onApplicationBootstrap(): void {
    this.retryTimer = setInterval(() => this.wake(), 30_000);
    this.retryTimer.unref();
    this.wake();
  }

  onApplicationShutdown(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
  }

  async enqueueAssessmentResult(
    client: PoolClient,
    schoolId: string,
    evaluation: AssessmentRecord,
    result: AssessmentStudentResult,
  ): Promise<void> {
    await client.query(
      `INSERT INTO assessment_webhook_outbox
         (school_id, assessment_id, student_id, payload)
       VALUES (
         $1,
         $2,
         $3,
         jsonb_build_object(
           'studentId', $3::uuid,
           'evaluation', $4::jsonb,
           'result', $5::jsonb
         ) || $6::jsonb
       )`,
      [
        schoolId,
        evaluation.id,
        result.studentId,
        JSON.stringify(evaluation),
        JSON.stringify({ score: result.score, updatedAt: result.updatedAt }),
        JSON.stringify({
          assignedScore: result.score,
          maxPoints: evaluation.maxPoints,
        }),
      ],
    );
  }

  wake(): void {
    if (this.dispatchPromise) {
      return;
    }
    this.dispatchPromise = this.dispatchPending()
      .catch((error: unknown) => {
        this.logger.error(
          'Could not process assessment webhook deliveries.',
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        this.dispatchPromise = null;
      });
  }

  private async dispatchPending(): Promise<void> {
    await this.database.query(
      `UPDATE assessment_webhook_outbox
       SET status = 'pending', locked_at = NULL, next_attempt_at = now()
       WHERE status = 'sending'
         AND locked_at < now() - interval '2 minutes'`,
    );

    while (true) {
      const delivery = await this.claimNext();
      if (!delivery) {
        return;
      }
      await this.deliver(delivery);
    }
  }

  private async claimNext(): Promise<WebhookOutboxRow | null> {
    return this.database.transaction(async (client) => {
      const result = await client.query<WebhookOutboxRow>(
        `SELECT id, school_id, student_id, payload, attempt_count
         FROM assessment_webhook_outbox
         WHERE status = 'pending' AND next_attempt_at <= now()
         ORDER BY created_at, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      const delivery = result.rows[0];
      if (!delivery) {
        return null;
      }
      await client.query(
        `UPDATE assessment_webhook_outbox
         SET status = 'sending', locked_at = now(), attempt_count = attempt_count + 1
         WHERE id = $1`,
        [delivery.id],
      );
      return { ...delivery, attempt_count: delivery.attempt_count + 1 };
    });
  }

  private async deliver(delivery: WebhookOutboxRow): Promise<void> {
    try {
      const authorization = await this.database.query<{ authorized: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM student_responsibles
           WHERE school_id = $1
             AND student_id = $2
             AND notification_authorized = true
         ) AS authorized`,
        [delivery.school_id, delivery.student_id],
      );
      const authorized = authorization.rows[0]?.authorized;
      if (authorized === undefined) {
        throw new Error('Student notification authorization could not be verified.');
      }
      if (!authorized) {
        await this.database.query(
          `UPDATE assessment_webhook_outbox
           SET status = 'cancelled',
               locked_at = NULL,
               last_error = 'Cancelled because no responsible has active WhatsApp notification authorization.'
           WHERE id = $1`,
          [delivery.id],
        );
        return;
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': delivery.id,
        },
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}.`);
      }
      await this.database.query(
        `UPDATE assessment_webhook_outbox
         SET status = 'delivered', delivered_at = now(), locked_at = NULL, last_error = NULL
         WHERE id = $1`,
        [delivery.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retrySeconds = Math.min(
        300,
        5 * 2 ** Math.min(delivery.attempt_count - 1, 6),
      );
      await this.database.query(
        `UPDATE assessment_webhook_outbox
         SET status = 'pending',
             next_attempt_at = now() + make_interval(secs => $2),
             locked_at = NULL,
             last_error = $3
         WHERE id = $1`,
        [delivery.id, retrySeconds, message.slice(0, 1000)],
      );
      this.logger.error(
        `Assessment webhook delivery ${delivery.id} failed; retry scheduled: ${message}`,
      );
    }
  }
}

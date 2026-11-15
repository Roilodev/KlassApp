CREATE TABLE assessment_webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'delivered')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (school_id, assessment_id, student_id)
);

CREATE INDEX assessment_webhook_outbox_pending_idx
  ON assessment_webhook_outbox (next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE INDEX assessment_webhook_outbox_stale_idx
  ON assessment_webhook_outbox (locked_at)
  WHERE status = 'sending';

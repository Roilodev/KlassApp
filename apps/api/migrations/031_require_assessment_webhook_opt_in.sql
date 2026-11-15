ALTER TABLE assessment_webhook_outbox
  DROP CONSTRAINT assessment_webhook_outbox_status_check,
  ADD CONSTRAINT assessment_webhook_outbox_status_check
    CHECK (status IN ('pending', 'sending', 'delivered', 'cancelled'));

UPDATE assessment_webhook_outbox
SET status = 'cancelled',
    locked_at = NULL,
    last_error = 'Cancelled because per-student webhook publishing now requires opt-in.'
WHERE status IN ('pending', 'sending');

ALTER TABLE school_events
  DROP CONSTRAINT school_events_status_check,
  DROP CONSTRAINT school_events_check1;

ALTER TABLE school_events
  ADD CONSTRAINT school_events_status_check
    CHECK (status IN ('draft', 'published', 'cancelled')),
  ADD CONSTRAINT school_events_status_details_check
    CHECK (
      (status IN ('draft', 'published') AND cancelled_by IS NULL AND cancelled_at IS NULL)
      OR
      (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    );

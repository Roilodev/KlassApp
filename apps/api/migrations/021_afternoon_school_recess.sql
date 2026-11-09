ALTER TABLE school_recesses
  ALTER COLUMN starts_at DROP NOT NULL,
  ALTER COLUMN ends_at DROP NOT NULL,
  ADD COLUMN afternoon_starts_at time,
  ADD COLUMN afternoon_ends_at time,
  ADD CONSTRAINT school_recesses_morning_pair_check
    CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  ADD CONSTRAINT school_recesses_afternoon_pair_check
    CHECK ((afternoon_starts_at IS NULL) = (afternoon_ends_at IS NULL)),
  ADD CONSTRAINT school_recesses_afternoon_time_check
    CHECK (afternoon_starts_at IS NULL OR afternoon_starts_at < afternoon_ends_at);

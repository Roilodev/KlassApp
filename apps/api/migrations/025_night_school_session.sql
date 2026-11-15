ALTER TABLE school_class_session_periods
  DROP CONSTRAINT school_class_session_periods_session_check,
  ADD CONSTRAINT school_class_session_periods_session_check
    CHECK (session IN ('morning', 'afternoon', 'night'));

ALTER TABLE classes
  DROP CONSTRAINT classes_session_check,
  ADD CONSTRAINT classes_session_check
    CHECK (session IN ('morning', 'afternoon', 'night'));

ALTER TABLE school_recesses
  ADD COLUMN night_starts_at time,
  ADD COLUMN night_ends_at time,
  ADD CONSTRAINT school_recesses_night_pair_check
    CHECK ((night_starts_at IS NULL) = (night_ends_at IS NULL)),
  ADD CONSTRAINT school_recesses_night_time_check
    CHECK (night_starts_at IS NULL OR night_starts_at < night_ends_at);

ALTER TABLE school_subjects
  ADD COLUMN weekly_frequency smallint
  CHECK (weekly_frequency BETWEEN 1 AND 40);

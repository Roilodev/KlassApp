ALTER TABLE schools
  ADD COLUMN max_teacher_weekly_periods integer
  CHECK (max_teacher_weekly_periods IS NULL OR max_teacher_weekly_periods > 0);

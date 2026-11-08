ALTER TABLE students
  ADD COLUMN home_address text
  CHECK (home_address IS NULL OR length(trim(home_address)) <= 300);

ALTER TABLE school_memberships
  ADD COLUMN home_address text
  CHECK (home_address IS NULL OR length(trim(home_address)) <= 300);

ALTER TABLE teacher_invitations
  ADD COLUMN home_address text
  CHECK (home_address IS NULL OR length(trim(home_address)) <= 300);

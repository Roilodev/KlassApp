ALTER TABLE students
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN leave_date date,
  ADD COLUMN leave_reason text,
  ADD CONSTRAINT students_leave_details_check CHECK (
    (leave_date IS NULL AND leave_reason IS NULL)
    OR (
      leave_date IS NOT NULL
      AND leave_reason IS NOT NULL
      AND length(trim(leave_reason)) BETWEEN 1 AND 500
    )
  );

ALTER TABLE school_memberships
  ADD COLUMN leave_date date,
  ADD COLUMN leave_reason text,
  ADD CONSTRAINT school_memberships_leave_details_check CHECK (
    (leave_date IS NULL AND leave_reason IS NULL)
    OR (
      leave_date IS NOT NULL
      AND leave_reason IS NOT NULL
      AND length(trim(leave_reason)) BETWEEN 1 AND 500
    )
  );

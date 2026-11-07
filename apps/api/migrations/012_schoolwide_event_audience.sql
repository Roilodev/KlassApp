ALTER TABLE school_events
  DROP CONSTRAINT school_events_audience_type_check,
  DROP CONSTRAINT school_events_check;

ALTER TABLE school_events
  ADD CONSTRAINT school_events_audience_type_check
    CHECK (audience_type IN ('school', 'grade', 'class')),
  ADD CONSTRAINT school_events_audience_target_check
    CHECK (
      (audience_type = 'school'
        AND class_id IS NULL
        AND academic_year_id IS NULL
        AND grade_id IS NULL)
      OR
      (audience_type = 'class'
        AND class_id IS NOT NULL
        AND academic_year_id IS NULL
        AND grade_id IS NULL)
      OR
      (audience_type = 'grade'
        AND class_id IS NULL
        AND academic_year_id IS NOT NULL
        AND grade_id IS NOT NULL)
    );

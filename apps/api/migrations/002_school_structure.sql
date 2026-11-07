CREATE TABLE academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, year),
  UNIQUE (school_id, id)
);

CREATE TABLE grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  UNIQUE (school_id, id)
);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL,
  grade_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, academic_year_id)
    REFERENCES academic_years (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, grade_id)
    REFERENCES grades (school_id, id) ON DELETE CASCADE,
  UNIQUE (school_id, academic_year_id, grade_id, name)
);

CREATE INDEX classes_school_year_grade_idx
  ON classes (school_id, academic_year_id, grade_id);

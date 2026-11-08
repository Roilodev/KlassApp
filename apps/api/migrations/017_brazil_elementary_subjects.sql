WITH standard_subjects(name) AS (
  VALUES
    ('Língua Portuguesa'),
    ('Arte'),
    ('Educação Física'),
    ('Matemática'),
    ('Ciências'),
    ('Geografia'),
    ('História'),
    ('Língua Inglesa'),
    ('Ensino Religioso')
)
INSERT INTO school_subjects (school_id, name, created_by)
SELECT schools.id, standard_subjects.name, admins.user_id
FROM schools
JOIN LATERAL (
  SELECT school_memberships.user_id
  FROM school_memberships
  WHERE school_memberships.school_id = schools.id
    AND school_memberships.role = 'admin'
  ORDER BY school_memberships.created_at
  LIMIT 1
) AS admins ON true
CROSS JOIN standard_subjects
ON CONFLICT (school_id, lower(name)) DO NOTHING;

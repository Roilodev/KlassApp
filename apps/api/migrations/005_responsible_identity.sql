CREATE TABLE responsible_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE responsible_contacts
  ADD COLUMN responsible_person_id uuid
  REFERENCES responsible_people (id) ON DELETE SET NULL;

CREATE INDEX responsible_contacts_person_idx
  ON responsible_contacts (responsible_person_id)
  WHERE responsible_person_id IS NOT NULL;

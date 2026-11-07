ALTER TABLE school_memberships
  ADD COLUMN phone_e164 text
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^[+]55[1-9][0-9]{9,10}$');

ALTER TABLE teacher_invitations
  ADD COLUMN phone_e164 text
  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^[+]55[1-9][0-9]{9,10}$');

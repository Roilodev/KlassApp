ALTER TABLE classes
  ADD COLUMN session text NOT NULL DEFAULT 'morning'
    CHECK (session IN ('morning', 'afternoon'));

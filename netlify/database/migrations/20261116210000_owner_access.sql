CREATE TABLE crm_owner (
  id text PRIMARY KEY CHECK (id = 'owner'),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

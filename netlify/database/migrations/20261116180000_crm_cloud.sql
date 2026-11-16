CREATE TABLE crm_workspace (
  id text PRIMARY KEY CHECK (id = 'personal'),
  version integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  workspace_version integer NOT NULL,
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL
);
CREATE TABLE crm_requests (
  id text PRIMARY KEY,
  actor text NOT NULL,
  input_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_auth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  challenge text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE crm_tokens (
  token_hash text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('access', 'refresh', 'session')),
  client_id text NOT NULL,
  family text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX crm_token_family ON crm_tokens(family);

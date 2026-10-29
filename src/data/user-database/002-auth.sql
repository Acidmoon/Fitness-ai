CREATE TABLE fitness_users.credentials (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%' AND octet_length(password_hash) <= 512),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);

CREATE TABLE fitness_users.sessions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_lookup varchar(64) NOT NULL CHECK (token_lookup ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT sessions_token_unique UNIQUE (tenant_id, token_lookup),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX sessions_user ON fitness_users.sessions(tenant_id, user_id, created_at DESC);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['credentials', 'sessions']
  LOOP
    EXECUTE format('ALTER TABLE fitness_users.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE fitness_users.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY tenant_scope ON fitness_users.%I USING (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid)', relation_name);
  END LOOP;
END;
$policies$;

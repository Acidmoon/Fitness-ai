CREATE TABLE fitness_users.key_registry (
  id integer PRIMARY KEY CHECK (id = 1),
  lookup_key_check varchar(64) NOT NULL CHECK (lookup_key_check ~ '^[a-f0-9]{64}$'),
  initialized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE fitness_users.tenants (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE fitness_users.accounts (
  tenant_id uuid NOT NULL REFERENCES fitness_users.tenants(id),
  id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  erased_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CHECK ((status = 'deleted') = (erased_at IS NOT NULL))
);
CREATE INDEX accounts_status_page ON fitness_users.accounts(tenant_id, status, id);

CREATE TABLE fitness_users.profiles (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sealed_profile text NOT NULL CHECK (sealed_profile LIKE 'v1.%' AND octet_length(sealed_profile) <= 100000),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);

CREATE TABLE fitness_users.identities (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider varchar(64) NOT NULL CHECK (provider ~ '^[a-z][a-z0-9._:-]{0,63}$'),
  subject_lookup varchar(64) NOT NULL CHECK (subject_lookup ~ '^[a-f0-9]{64}$'),
  sealed_subject text NOT NULL CHECK (sealed_subject LIKE 'v1.%' AND octet_length(sealed_subject) <= 100000),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT identities_subject_unique UNIQUE (tenant_id, provider, subject_lookup),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX identities_user ON fitness_users.identities(tenant_id, user_id, id);

CREATE TABLE fitness_users.mutation_receipts (
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  kind varchar(40) NOT NULL,
  actor_id varchar(80) NOT NULL,
  user_id uuid NOT NULL,
  applied_version integer NOT NULL CHECK (applied_version > 0),
  identity_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, operation_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX mutation_receipts_user ON fitness_users.mutation_receipts(tenant_id, user_id);

CREATE TABLE fitness_users.audit_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_version integer NOT NULL CHECK (user_version > 0),
  kind varchar(40) NOT NULL CHECK (kind IN ('user.created', 'user.profile-updated', 'user.status-changed', 'user.identity-linked', 'user.identity-unlinked', 'user.erased', 'user.encryption-rotated')),
  actor_id varchar(80) NOT NULL,
  operation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, operation_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX audit_events_user_time ON fitness_users.audit_events(tenant_id, user_id, occurred_at, id);

CREATE TABLE fitness_users.outbox (
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  lease_owner varchar(64),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, event_id) REFERENCES fitness_users.audit_events(tenant_id, id),
  CHECK ((lease_owner IS NULL AND lease_token IS NULL AND lease_until IS NULL)
    OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX outbox_pending ON fitness_users.outbox(tenant_id, event_id) WHERE delivered_at IS NULL;

ALTER TABLE fitness_users.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_users.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON fitness_users.tenants
  USING (id = nullif(current_setting('fitness.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('fitness.tenant_id', true), '')::uuid);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['accounts', 'profiles', 'identities', 'mutation_receipts', 'audit_events', 'outbox']
  LOOP
    EXECUTE format('ALTER TABLE fitness_users.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE fitness_users.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY tenant_scope ON fitness_users.%I USING (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid)', relation_name);
  END LOOP;
END;
$policies$;

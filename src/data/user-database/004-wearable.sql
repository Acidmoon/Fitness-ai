CREATE TABLE fitness_users.wearable_samples (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind varchar(32) NOT NULL CHECK (kind IN ('heart-rate', 'spo2', 'steps', 'cadence', 'energy')),
  unit varchar(16) NOT NULL CHECK (unit IN ('bpm', 'percent', 'count', 'spm', 'kcal')),
  source varchar(32) NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 32),
  captured_at timestamptz NOT NULL,
  sealed_value text NOT NULL CHECK (sealed_value LIKE 'v1.%' AND octet_length(sealed_value) <= 4096),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id),
  CONSTRAINT wearable_sample_unique UNIQUE (tenant_id, user_id, kind, source, captured_at)
);
CREATE INDEX wearable_samples_user_time ON fitness_users.wearable_samples(tenant_id, user_id, captured_at DESC, id DESC);
CREATE INDEX wearable_samples_user_kind ON fitness_users.wearable_samples(tenant_id, user_id, kind, captured_at DESC);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['wearable_samples']
  LOOP
    EXECUTE format('ALTER TABLE fitness_users.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE fitness_users.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY tenant_scope ON fitness_users.%I USING (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid)', relation_name);
  END LOOP;
END;
$policies$;

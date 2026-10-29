CREATE TABLE fitness_users.workout_records (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id varchar(128) NOT NULL CHECK (length(btrim(session_id)) > 0),
  exercise varchar(64) NOT NULL CHECK (length(btrim(exercise)) > 0),
  target_repetitions integer NOT NULL CHECK (target_repetitions BETWEEN 1 AND 10000),
  observed_repetitions integer NOT NULL CHECK (observed_repetitions BETWEEN 0 AND 10000),
  total_score numeric(5,2) NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  sealed_detail text NOT NULL CHECK (sealed_detail LIKE 'v1.%' AND octet_length(sealed_detail) <= 100000),
  source varchar(8) NOT NULL CHECK (source IN ('video', 'json')),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX workout_records_user_time ON fitness_users.workout_records(tenant_id, user_id, captured_at DESC, id DESC);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['workout_records']
  LOOP
    EXECUTE format('ALTER TABLE fitness_users.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE fitness_users.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY tenant_scope ON fitness_users.%I USING (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid)', relation_name);
  END LOOP;
END;
$policies$;

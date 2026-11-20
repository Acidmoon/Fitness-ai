CREATE TABLE fitness_users.workout_pose_tracks (
  tenant_id uuid NOT NULL,
  workout_id uuid NOT NULL,
  user_id uuid NOT NULL,
  schema_version varchar(16) NOT NULL CHECK (schema_version = '1.0'),
  frame_count integer NOT NULL CHECK (frame_count BETWEEN 1 AND 150),
  fps numeric(4,2) NOT NULL CHECK (fps > 0 AND fps <= 10),
  payload_bytes integer NOT NULL CHECK (payload_bytes BETWEEN 1 AND 57344),
  content_sha256 varchar(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  sealed_track text NOT NULL CHECK (sealed_track LIKE 'v1.%' AND octet_length(sealed_track) <= 100000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, workout_id),
  FOREIGN KEY (tenant_id, workout_id) REFERENCES fitness_users.workout_records(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX workout_pose_tracks_user ON fitness_users.workout_pose_tracks(tenant_id, user_id, updated_at DESC);

DO $policies$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['workout_pose_tracks']
  LOOP
    EXECUTE format('ALTER TABLE fitness_users.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE fitness_users.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('CREATE POLICY tenant_scope ON fitness_users.%I USING (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''fitness.tenant_id'', true), '''')::uuid)', relation_name);
  END LOOP;
END;
$policies$;

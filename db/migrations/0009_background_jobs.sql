DO $$ BEGIN
  CREATE TYPE background_job_status AS ENUM (
    'pending',
    'running',
    'succeeded',
    'failed',
    'retry_wait',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(120) NOT NULL,
  status background_job_status NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash varchar(64) NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  result jsonb,
  error jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  started_at timestamptz,
  finished_at timestamptz,
  locked_at timestamptz,
  locked_by varchar(120),
  lease_token uuid,
  heartbeat_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key varchar(180) NOT NULL,
  requested_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  correlation_id varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_jobs_idempotency_key_check CHECK (
    char_length(btrim(idempotency_key)) BETWEEN 1 AND 180
  ),
  CONSTRAINT background_jobs_state_lease_check CHECK (
    (
      status = 'running'
      AND locked_by IS NOT NULL
      AND locked_at IS NOT NULL
      AND heartbeat_at IS NOT NULL
      AND lease_token IS NOT NULL
      AND finished_at IS NULL
    )
    OR (
      status IN ('pending', 'retry_wait')
      AND locked_by IS NULL
      AND locked_at IS NULL
      AND heartbeat_at IS NULL
      AND lease_token IS NULL
      AND finished_at IS NULL
    )
    OR (
      status IN ('succeeded', 'failed', 'cancelled')
      AND locked_by IS NULL
      AND locked_at IS NULL
      AND heartbeat_at IS NULL
      AND lease_token IS NULL
      AND finished_at IS NOT NULL
    )
  ),
  CONSTRAINT background_jobs_succeeded_progress_check CHECK (
    status <> 'succeeded' OR progress = 100
  )
);

CREATE INDEX IF NOT EXISTS background_jobs_claim_idx
  ON background_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS background_jobs_running_lease_idx
  ON background_jobs(status, heartbeat_at);

CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_type_idempotency_key_unique
  ON background_jobs(type, idempotency_key);

DROP TRIGGER IF EXISTS background_jobs_set_updated_at ON background_jobs;
CREATE TRIGGER background_jobs_set_updated_at BEFORE UPDATE ON background_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

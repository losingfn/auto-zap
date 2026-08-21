ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS analyze_job_id uuid REFERENCES background_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publish_job_id uuid REFERENCES background_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase varchar(40),
  ADD COLUMN IF NOT EXISTS stage varchar(255),
  ADD COLUMN IF NOT EXISTS progress integer,
  ADD COLUMN IF NOT EXISTS publish_checkpoint varchar(80),
  ADD COLUMN IF NOT EXISTS last_error_code varchar(120),
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS processing_updated_at timestamptz;

ALTER TABLE import_batches
  DROP CONSTRAINT IF EXISTS import_batches_progress_check;
ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_progress_check
  CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100));

CREATE UNIQUE INDEX IF NOT EXISTS import_batches_analyze_job_unique
  ON import_batches(analyze_job_id)
  WHERE analyze_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS import_batches_publish_job_unique
  ON import_batches(publish_job_id)
  WHERE publish_job_id IS NOT NULL;

-- New worker imports reserve one lightweight batch at a time. Existing history has NULL phase.
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_one_active_worker_analyze
  ON import_batches ((1))
  WHERE status = 'uploaded' AND phase IN ('queued', 'analyzing', 'retrying');

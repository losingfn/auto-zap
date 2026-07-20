CREATE INDEX IF NOT EXISTS review_queue_version_status_created_idx
  ON review_queue(catalog_version_id, status, created_at);

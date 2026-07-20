DO $$ BEGIN
  CREATE TYPE review_reapply_run_mode AS ENUM ('dry_run', 'apply');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_reapply_run_status AS ENUM (
    'pending',
    'running',
    'paused',
    'completed',
    'completed_with_errors',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_reapply_run_item_status AS ENUM (
    'pending',
    'processed',
    'prepared',
    'already_pending',
    'skipped',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS review_reapply_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode review_reapply_run_mode NOT NULL,
  status review_reapply_run_status NOT NULL DEFAULT 'pending',
  workspace_id uuid NOT NULL REFERENCES review_workspaces(id) ON DELETE CASCADE,
  source_catalog_version_id uuid REFERENCES catalog_versions(id) ON DELETE SET NULL,
  dry_run_id uuid,
  pipeline_version varchar(160) NOT NULL,
  scope_fingerprint varchar(128) NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  prepared_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  manual_rows integer NOT NULL DEFAULT 0,
  blocked_rows integer NOT NULL DEFAULT 0,
  do_not_publish_rows integer NOT NULL DEFAULT 0,
  group_review_rows integer NOT NULL DEFAULT 0,
  auto_ready_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  already_pending_rows integer NOT NULL DEFAULT 0,
  current_cursor_created_at timestamptz,
  current_cursor_review_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  last_heartbeat_at timestamptz,
  locked_by varchar(120),
  lock_expires_at timestamptz,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  error_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_reapply_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES review_reapply_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES review_workspaces(id) ON DELETE CASCADE,
  review_queue_id uuid NOT NULL REFERENCES review_queue(id) ON DELETE CASCADE,
  review_queue_created_at timestamptz NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status review_reapply_run_item_status NOT NULL DEFAULT 'pending',
  decision_status varchar(40),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  confidence numeric(6, 4),
  reason text,
  review_reason_code varchar(120),
  group_key varchar(255),
  pipeline_version varchar(160) NOT NULL,
  result_fingerprint varchar(128),
  workspace_action_id uuid REFERENCES review_workspace_actions(id) ON DELETE SET NULL,
  workspace_item_id uuid REFERENCES review_workspace_items(id) ON DELETE SET NULL,
  error_code varchar(120),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_reapply_run_items_run_review_unique UNIQUE (run_id, review_queue_id)
);

CREATE TABLE IF NOT EXISTS review_reapply_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES review_reapply_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES review_workspaces(id) ON DELETE CASCADE,
  decision_status varchar(40) NOT NULL,
  group_key varchar(255) NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  product_count integer NOT NULL DEFAULT 0,
  confidence_min numeric(6, 4),
  confidence_max numeric(6, 4),
  sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_reapply_groups_run_decision_group_unique UNIQUE (run_id, decision_status, group_key)
);

CREATE INDEX IF NOT EXISTS review_reapply_runs_workspace_status_idx
  ON review_reapply_runs(workspace_id, status, created_at);

CREATE INDEX IF NOT EXISTS review_reapply_runs_dry_run_idx
  ON review_reapply_runs(dry_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS review_reapply_runs_one_active_workspace_idx
  ON review_reapply_runs(workspace_id)
  WHERE status IN ('pending', 'running', 'paused');

CREATE INDEX IF NOT EXISTS review_reapply_run_items_run_cursor_idx
  ON review_reapply_run_items(run_id, review_queue_created_at, review_queue_id);

CREATE INDEX IF NOT EXISTS review_reapply_run_items_workspace_review_idx
  ON review_reapply_run_items(workspace_id, review_queue_id);

CREATE INDEX IF NOT EXISTS review_reapply_run_items_decision_idx
  ON review_reapply_run_items(run_id, decision_status);

CREATE INDEX IF NOT EXISTS review_reapply_groups_run_decision_idx
  ON review_reapply_groups(run_id, decision_status);

DROP TRIGGER IF EXISTS review_reapply_runs_set_updated_at ON review_reapply_runs;
CREATE TRIGGER review_reapply_runs_set_updated_at BEFORE UPDATE ON review_reapply_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS review_reapply_run_items_set_updated_at ON review_reapply_run_items;
CREATE TRIGGER review_reapply_run_items_set_updated_at BEFORE UPDATE ON review_reapply_run_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS review_reapply_groups_set_updated_at ON review_reapply_groups;
CREATE TRIGGER review_reapply_groups_set_updated_at BEFORE UPDATE ON review_reapply_groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS review_recalculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES review_workspaces(id) ON DELETE CASCADE,
  source_catalog_version_id uuid REFERENCES catalog_versions(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'running',
  rules_version varchar(160) NOT NULL,
  commit_hash varchar(64),
  input_fingerprint varchar(128) NOT NULL,
  preview_token varchar(128) NOT NULL,
  total_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  before_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  rollback_of_id uuid REFERENCES review_recalculations(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_recalculations_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'rolled_back'))
);

CREATE TABLE IF NOT EXISTS review_recalculation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recalculation_id uuid NOT NULL REFERENCES review_recalculations(id) ON DELETE CASCADE,
  review_queue_id uuid REFERENCES review_queue(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  old_suggested_subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  new_suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  new_suggested_subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  old_reason text,
  new_reason text NOT NULL,
  decision_status varchar(40) NOT NULL,
  decision_source varchar(80) NOT NULL,
  review_reason_code varchar(120),
  confidence numeric(6, 4) NOT NULL DEFAULT 0,
  family_id varchar(120),
  family_label varchar(180),
  matched_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_other_products boolean NOT NULL DEFAULT false,
  is_exact_assignment boolean NOT NULL DEFAULT false,
  original_product_status varchar(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_recalculation_items_decision_status_check
    CHECK (decision_status IN (
      'AUTO_READY',
      'GROUP_REVIEW',
      'MANUAL_REVIEW',
      'BLOCKED_CONFLICT',
      'DO_NOT_PUBLISH',
      'INVALID_INPUT'
    ))
);

CREATE INDEX IF NOT EXISTS review_recalculations_workspace_status_idx
  ON review_recalculations(workspace_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS review_recalculations_one_running_workspace_idx
  ON review_recalculations(workspace_id)
  WHERE status = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS review_recalculation_items_recalc_review_unique
  ON review_recalculation_items(recalculation_id, review_queue_id);

CREATE INDEX IF NOT EXISTS review_recalculation_items_recalc_status_idx
  ON review_recalculation_items(recalculation_id, decision_status);

CREATE INDEX IF NOT EXISTS review_recalculation_items_product_idx
  ON review_recalculation_items(product_id);

DROP TRIGGER IF EXISTS review_recalculations_set_updated_at ON review_recalculations;
CREATE TRIGGER review_recalculations_set_updated_at BEFORE UPDATE ON review_recalculations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS review_recalculation_items_set_updated_at ON review_recalculation_items;
CREATE TRIGGER review_recalculation_items_set_updated_at BEFORE UPDATE ON review_recalculation_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

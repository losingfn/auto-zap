DO $$ BEGIN
  CREATE TYPE review_workspace_status AS ENUM ('open', 'publishing', 'published', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_workspace_action_status AS ENUM ('applied', 'undone', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_workspace_item_status AS ENUM ('pending', 'excluded', 'undone', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS review_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_catalog_version_id uuid REFERENCES catalog_versions(id) ON DELETE SET NULL,
  published_catalog_version_id uuid REFERENCES catalog_versions(id) ON DELETE SET NULL,
  status review_workspace_status NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_workspace_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES review_workspaces(id) ON DELETE CASCADE,
  action_type varchar(80) NOT NULL,
  status review_workspace_action_status NOT NULL DEFAULT 'applied',
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES categorization_rules(id) ON DELETE SET NULL,
  rule_pattern varchar(255),
  product_count integer NOT NULL DEFAULT 0,
  excluded_count integer NOT NULL DEFAULT 0,
  preview_token varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_workspace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES review_workspaces(id) ON DELETE CASCADE,
  action_id uuid REFERENCES review_workspace_actions(id) ON DELETE SET NULL,
  review_queue_id uuid REFERENCES review_queue(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status review_workspace_item_status NOT NULL DEFAULT 'pending',
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  original_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  original_subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  original_status varchar(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_workspace_items_workspace_product_unique UNIQUE (workspace_id, product_id)
);

CREATE INDEX IF NOT EXISTS review_workspaces_source_status_idx
  ON review_workspaces(source_catalog_version_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS review_workspaces_one_open_source_idx
  ON review_workspaces(source_catalog_version_id)
  WHERE source_catalog_version_id IS NOT NULL
    AND status IN ('open', 'publishing');

CREATE INDEX IF NOT EXISTS review_workspace_actions_workspace_status_idx
  ON review_workspace_actions(workspace_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS review_workspace_actions_preview_token_idx
  ON review_workspace_actions(workspace_id, preview_token)
  WHERE preview_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS review_workspace_items_workspace_status_idx
  ON review_workspace_items(workspace_id, status);

CREATE INDEX IF NOT EXISTS review_workspace_items_product_idx
  ON review_workspace_items(product_id);

DROP TRIGGER IF EXISTS review_workspaces_set_updated_at ON review_workspaces;
CREATE TRIGGER review_workspaces_set_updated_at BEFORE UPDATE ON review_workspaces
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS review_workspace_actions_set_updated_at ON review_workspace_actions;
CREATE TRIGGER review_workspace_actions_set_updated_at BEFORE UPDATE ON review_workspace_actions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS review_workspace_items_set_updated_at ON review_workspace_items;
CREATE TRIGGER review_workspace_items_set_updated_at BEFORE UPDATE ON review_workspace_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

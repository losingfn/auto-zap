BEGIN;

CREATE TABLE IF NOT EXISTS product_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_identities_created_idx
  ON product_identities(created_at);

DROP TRIGGER IF EXISTS product_identities_set_updated_at ON product_identities;
CREATE TRIGGER product_identities_set_updated_at BEFORE UPDATE ON product_identities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_identity_id uuid
    REFERENCES product_identities(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS products_version_identity_unique
  ON products(catalog_version_id, product_identity_id)
  WHERE product_identity_id IS NOT NULL;

ALTER TABLE review_queue
  ADD COLUMN IF NOT EXISTS identity_candidate_id uuid
    REFERENCES product_identities(id) ON DELETE RESTRICT;

ALTER TABLE review_workspace_items
  ADD COLUMN IF NOT EXISTS identity_decision varchar(16),
  ADD COLUMN IF NOT EXISTS product_identity_id uuid
    REFERENCES product_identities(id) ON DELETE RESTRICT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'review_workspace_items_identity_decision_check'
  ) THEN
    ALTER TABLE review_workspace_items
      ADD CONSTRAINT review_workspace_items_identity_decision_check
      CHECK (
        identity_decision IS NULL
        OR identity_decision IN ('same', 'new')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'review_workspace_items_identity_resolution_check'
  ) THEN
    ALTER TABLE review_workspace_items
      ADD CONSTRAINT review_workspace_items_identity_resolution_check
      CHECK (
        (identity_decision IS NULL AND product_identity_id IS NULL)
        OR (identity_decision = 'same' AND product_identity_id IS NOT NULL)
        OR (identity_decision = 'new' AND product_identity_id IS NULL)
      );
  END IF;
END $$;

CREATE TEMP TABLE product_identity_active_backfill (
  product_id uuid PRIMARY KEY,
  product_identity_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

WITH active_catalog_version AS (
  SELECT id
  FROM catalog_versions
  WHERE status = 'active'
  ORDER BY published_at DESC NULLS LAST, created_at DESC
  LIMIT 1
)
INSERT INTO product_identity_active_backfill (product_id, product_identity_id)
SELECT products.id, gen_random_uuid()
FROM products
INNER JOIN active_catalog_version
  ON active_catalog_version.id = products.catalog_version_id
WHERE products.product_identity_id IS NULL;

INSERT INTO product_identities (id)
SELECT product_identity_id
FROM product_identity_active_backfill
ON CONFLICT (id) DO NOTHING;

UPDATE products
SET product_identity_id = product_identity_active_backfill.product_identity_id
FROM product_identity_active_backfill
WHERE products.id = product_identity_active_backfill.product_id
  AND products.product_identity_id IS NULL;

COMMIT;

CREATE INDEX IF NOT EXISTS products_shop_code_trgm_idx ON products USING gin (shop_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_raw_name_trgm_idx ON products USING gin (raw_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_active_version_category_idx
  ON products (catalog_version_id, status, category_id, subcategory_id);

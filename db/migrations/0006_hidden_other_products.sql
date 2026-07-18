ALTER TABLE subcategories
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS subcategories_category_hidden_active_idx
  ON subcategories(category_id, is_hidden, is_active, sort_order);

UPDATE subcategories
SET
  slug = 'other-products',
  is_active = true,
  is_hidden = true,
  sort_order = 20,
  updated_at = now()
FROM categories
WHERE subcategories.category_id = categories.id
  AND categories.slug = 'ves-assortiment'
  AND subcategories.name = 'Прочие товары'
  AND subcategories.slug <> 'other-products'
  AND NOT EXISTS (
    SELECT 1
    FROM subcategories existing
    WHERE existing.category_id = categories.id
      AND existing.slug = 'other-products'
  );

INSERT INTO subcategories (category_id, slug, name, sort_order, is_active, is_hidden)
SELECT categories.id, 'other-products', 'Прочие товары', 20, true, true
FROM categories
WHERE categories.slug = 'ves-assortiment'
ON CONFLICT (category_id, slug) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_hidden = true,
  updated_at = now();

UPDATE subcategories
SET
  is_hidden = false,
  is_active = true,
  updated_at = now()
FROM categories
WHERE subcategories.category_id = categories.id
  AND categories.slug = 'ves-assortiment'
  AND subcategories.slug = 'vse-tovary';

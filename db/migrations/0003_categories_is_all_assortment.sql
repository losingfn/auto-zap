ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_all_assortment boolean NOT NULL DEFAULT false;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS icon_asset_id uuid;

UPDATE categories
SET is_all_assortment = slug = 'ves-assortiment'
WHERE slug IN ('ves-assortiment', 'podveska', 'elektrika', 'filtry-i-masla', 'tormoznaya-sistema', 'kuzov-i-optika', 'dvigatel-i-transmissiya', 'aksessuary');

UPDATE categories
SET icon_asset_id = NULL
WHERE slug IN ('ves-assortiment', 'podveska', 'elektrika', 'filtry-i-masla', 'tormoznaya-sistema', 'kuzov-i-optika', 'dvigatel-i-transmissiya', 'aksessuary');

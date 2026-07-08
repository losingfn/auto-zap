CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('owner', 'manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE asset_kind AS ENUM ('logo', 'favicon', 'og_image', 'store_photo', 'category_icon', 'vacancy_image');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE catalog_version_status AS ENUM ('draft', 'active', 'archived', 'rolled_back');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('active', 'archived', 'needs_review', 'invalid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE import_status AS ENUM ('uploaded', 'analyzed', 'published', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('open', 'resolved', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rule_match_type AS ENUM ('contains', 'starts_with', 'exact', 'regex');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  full_name varchar(255),
  password_hash text NOT NULL,
  role admin_role NOT NULL DEFAULT 'owner',
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip_address varchar(64),
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind asset_kind NOT NULL,
  original_filename varchar(255) NOT NULL,
  public_path text NOT NULL,
  mime_type varchar(120) NOT NULL,
  width integer,
  height integer,
  size_bytes integer,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(160) NOT NULL UNIQUE,
  name varchar(160) NOT NULL UNIQUE,
  description text,
  icon_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_all_assortment boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug varchar(160) NOT NULL,
  name varchar(160) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcategories_category_slug_unique UNIQUE (category_id, slug),
  CONSTRAINT subcategories_category_name_unique UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status catalog_version_status NOT NULL DEFAULT 'draft',
  source_file_name varchar(255),
  source_file_hash varchar(128),
  total_rows integer NOT NULL DEFAULT 0,
  parsed_rows integer NOT NULL DEFAULT 0,
  added_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  archived_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  notes text,
  published_at timestamptz,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  shop_code varchar(64) NOT NULL,
  raw_name text NOT NULL,
  name text NOT NULL,
  slug varchar(220) NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price > 0),
  stock_quantity numeric(14,3),
  stock_sum numeric(14,2),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  status product_status NOT NULL DEFAULT 'active',
  review_reason text,
  search_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_version_code_unique UNIQUE (catalog_version_id, shop_code)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid REFERENCES catalog_versions(id) ON DELETE SET NULL,
  status import_status NOT NULL DEFAULT 'uploaded',
  source_file_name varchar(255) NOT NULL,
  storage_path text,
  file_hash varchar(128),
  uploaded_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  analyzed_at timestamptz,
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_name text,
  parsed_shop_code varchar(64),
  parsed_name text,
  stock_quantity numeric(14,3),
  price numeric(12,2),
  stock_sum numeric(14,2),
  validation_status varchar(64) NOT NULL,
  error_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT import_rows_batch_row_unique UNIQUE (import_batch_id, row_number)
);

CREATE TABLE IF NOT EXISTS import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number integer,
  field_name varchar(120),
  code varchar(120) NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern varchar(255) NOT NULL,
  match_type rule_match_type NOT NULL DEFAULT 'contains',
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categorization_rules_pattern_unique UNIQUE (pattern, match_type, category_id, subcategory_id)
);

CREATE TABLE IF NOT EXISTS synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_term varchar(160) NOT NULL UNIQUE,
  target_terms text[] NOT NULL,
  is_bidirectional boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid REFERENCES catalog_versions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  import_row_id uuid REFERENCES import_rows(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status review_status NOT NULL DEFAULT 'open',
  suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  suggested_subcategory_id uuid REFERENCES subcategories(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name varchar(255) NOT NULL,
  phone varchar(64) NOT NULL,
  email varchar(255) NOT NULL,
  address text NOT NULL,
  latitude numeric(10,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  yandex_maps_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_hours_day_unique UNIQUE (day_of_week)
);

CREATE TABLE IF NOT EXISTS vacancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  description text NOT NULL,
  image_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key varchar(120) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action varchar(160) NOT NULL,
  entity_type varchar(120),
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_sessions_admin_user_idx ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS assets_kind_idx ON assets(kind);
CREATE INDEX IF NOT EXISTS assets_active_idx ON assets(is_active);
CREATE INDEX IF NOT EXISTS categories_active_sort_idx ON categories(is_active, sort_order);
CREATE INDEX IF NOT EXISTS subcategories_category_sort_idx ON subcategories(category_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS catalog_versions_status_idx ON catalog_versions(status);
CREATE INDEX IF NOT EXISTS catalog_versions_published_idx ON catalog_versions(published_at);
CREATE INDEX IF NOT EXISTS products_version_status_idx ON products(catalog_version_id, status);
CREATE INDEX IF NOT EXISTS products_shop_code_idx ON products(shop_code);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS products_search_trgm_idx ON products USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS import_batches_status_idx ON import_batches(status);
CREATE INDEX IF NOT EXISTS import_batches_created_idx ON import_batches(created_at);
CREATE INDEX IF NOT EXISTS import_rows_batch_status_idx ON import_rows(import_batch_id, validation_status);
CREATE INDEX IF NOT EXISTS import_errors_batch_idx ON import_errors(import_batch_id);
CREATE INDEX IF NOT EXISTS categorization_rules_priority_idx ON categorization_rules(is_active, priority);
CREATE INDEX IF NOT EXISTS synonyms_active_idx ON synonyms(is_active);
CREATE INDEX IF NOT EXISTS review_queue_status_idx ON review_queue(status);
CREATE INDEX IF NOT EXISTS review_queue_version_idx ON review_queue(catalog_version_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS audit_logs_admin_idx ON audit_logs(admin_user_id);

DROP TRIGGER IF EXISTS admin_users_set_updated_at ON admin_users;
CREATE TRIGGER admin_users_set_updated_at BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS assets_set_updated_at ON assets;
CREATE TRIGGER assets_set_updated_at BEFORE UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS subcategories_set_updated_at ON subcategories;
CREATE TRIGGER subcategories_set_updated_at BEFORE UPDATE ON subcategories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS catalog_versions_set_updated_at ON catalog_versions;
CREATE TRIGGER catalog_versions_set_updated_at BEFORE UPDATE ON catalog_versions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS categorization_rules_set_updated_at ON categorization_rules;
CREATE TRIGGER categorization_rules_set_updated_at BEFORE UPDATE ON categorization_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS synonyms_set_updated_at ON synonyms;
CREATE TRIGGER synonyms_set_updated_at BEFORE UPDATE ON synonyms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS review_queue_set_updated_at ON review_queue;
CREATE TRIGGER review_queue_set_updated_at BEFORE UPDATE ON review_queue
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS business_hours_set_updated_at ON business_hours;
CREATE TRIGGER business_hours_set_updated_at BEFORE UPDATE ON business_hours
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS vacancies_set_updated_at ON vacancies;
CREATE TRIGGER vacancies_set_updated_at BEFORE UPDATE ON vacancies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

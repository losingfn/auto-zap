# Migration plan

- Apply `db/migrations/0006_hidden_other_products.sql` after existing migrations.
- The migration adds `subcategories.is_hidden` with default `false`.
- It upserts `ves-assortiment/other-products` as active and hidden.
- It keeps `ves-assortiment/vse-tovary` active and visible.
- It is idempotent and does not publish, replay or index catalog products.

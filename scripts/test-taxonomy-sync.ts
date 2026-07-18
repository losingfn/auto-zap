import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { catalogTaxonomy, defaultCategorizationRules } from "../src/config/catalog-taxonomy";
import { catalogCategories } from "../src/config/categories";
import { syncTaxonomy } from "./sync-taxonomy";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to test taxonomy sync.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  const schemaName = `taxonomy_sync_test_${Date.now()}`;
  const conflictSchemaName = `${schemaName}_conflict`;

  try {
    await createMigratedSchema(schemaName);
    await useSchema(schemaName);

    const dryRun = await syncTaxonomy(sql, { dryRun: true });
    assert(dryRun.dryRun, "dry-run summary should be marked as dryRun");
    assert(dryRun.conflicts.length === 0, "initial dry-run should not have conflicts");
    assert(dryRun.categories.add.length === catalogCategories.length, "dry-run should plan category inserts");
    await assertTableCount("categories", 0, "dry-run must not insert categories");

    const apply = await syncTaxonomy(sql, { dryRun: false });
    assert(apply.conflicts.length === 0, "apply should not have conflicts");
    await assertTableCount("categories", catalogCategories.length, "apply should insert categories");
    await assertTableCount(
      "subcategories",
      catalogTaxonomy.reduce((count, category) => count + category.subcategories.length, 0),
      "apply should insert subcategories"
    );
    await assertTableCount(
      "categorization_rules",
      defaultCategorizationRules.length,
      "apply should insert system rules"
    );
    await assertValidRuleTargets();
    await assertOtherProductsVisibility();

    const categoryIdsBeforeRepeat = await loadCategoryIds();
    const repeat = await syncTaxonomy(sql, { dryRun: false });
    assert(repeat.conflicts.length === 0, "repeat apply should not have conflicts");
    assert(repeat.categories.add.length === 0, "repeat apply should not add categories");
    assert(repeat.subcategories.add.length === 0, "repeat apply should not add subcategories");
    assert(repeat.rules.add.length === 0, "repeat apply should not add rules");
    assert(repeat.rules.update.length === 0, "repeat apply should not update rules");
    assert(repeat.rules.deactivateSystemDeprecated.length === 0, "repeat apply should not deactivate rules");
    assertCategoryIdsUnchanged(categoryIdsBeforeRepeat, await loadCategoryIds());
    await assertOtherProductsVisibility();

    await insertLearningRule();
    const afterLearning = await syncTaxonomy(sql, { dryRun: false });
    assert(afterLearning.conflicts.length === 0, "sync after learning rule should not have conflicts");
    await assertLearningRulePreserved();

    await createMigratedSchema(conflictSchemaName);
    await useSchema(conflictSchemaName);
    await sql`
      INSERT INTO categories (slug, name, sort_order)
      VALUES ('manual-podveska', 'Подвеска', 1)
    `;
    const conflictDryRun = await syncTaxonomy(sql, { dryRun: true });
    assert(
      conflictDryRun.conflicts.some((conflict) => conflict.code === "category_name_conflict"),
      "dry-run should report category slug/name conflict"
    );
    const conflictApply = await syncTaxonomy(sql, { dryRun: false });
    assert(
      conflictApply.conflicts.some((conflict) => conflict.code === "category_name_conflict"),
      "apply should block on category slug/name conflict"
    );
    await assertTableCount("categories", 1, "conflict apply must not write taxonomy rows");

    console.log("taxonomy sync fixture passed");
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(conflictSchemaName)} CASCADE`);
    await sql.end();
  }
}

async function createMigratedSchema(schemaName: string) {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await useSchema(schemaName);

  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const migrationSql = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.unsafe(migrationSql);
  }
}

async function useSchema(schemaName: string) {
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
}

async function assertTableCount(tableName: string, expected: number, message: string) {
  const [row] = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM ${sql(tableName)}`;
  assert(Number(row.count) === expected, `${message}: expected ${expected}, got ${row.count}`);
}

async function assertValidRuleTargets() {
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM categorization_rules
    LEFT JOIN categories ON categories.id = categorization_rules.category_id
    LEFT JOIN subcategories
      ON subcategories.id = categorization_rules.subcategory_id
     AND subcategories.category_id = categories.id
    WHERE categories.id IS NULL
       OR subcategories.id IS NULL
  `;
  assert(Number(row.count) === 0, `expected all rules to have valid targets, got ${row.count}`);
}

async function assertOtherProductsVisibility() {
  const rows = await sql<{ slug: string; is_hidden: boolean }[]>`
    SELECT subcategories.slug, subcategories.is_hidden
    FROM subcategories
    INNER JOIN categories ON categories.id = subcategories.category_id
    WHERE categories.slug = 'ves-assortiment'
      AND subcategories.slug IN ('vse-tovary', 'other-products')
    ORDER BY subcategories.slug
  `;
  const visibility = new Map(rows.map((row) => [row.slug, row.is_hidden]));

  assert(visibility.get("vse-tovary") === false, "vse-tovary should remain visible");
  assert(visibility.get("other-products") === true, "other-products should be hidden");
}

async function loadCategoryIds() {
  const rows = await sql<{ slug: string; id: string }[]>`
    SELECT slug, id
    FROM categories
    ORDER BY slug
  `;
  return new Map(rows.map((row) => [row.slug, row.id]));
}

function assertCategoryIdsUnchanged(before: Map<string, string>, after: Map<string, string>) {
  assert(before.size === after.size, "category count changed on repeat sync");
  for (const [slug, id] of before.entries()) {
    assert(after.get(slug) === id, `category id changed for ${slug}`);
  }
}

async function insertLearningRule() {
  const [admin] = await sql<{ id: string }[]>`
    INSERT INTO admin_users (email, full_name, password_hash)
    VALUES ('taxonomy-sync-test@example.com', 'Taxonomy Sync Test', 'fixture')
    RETURNING id
  `;

  await sql`
    INSERT INTO categorization_rules (pattern, match_type, category_id, subcategory_id, priority, created_by)
    SELECT
      'fixture-learning-rule',
      'contains'::rule_match_type,
      categories.id,
      subcategories.id,
      777,
      ${admin.id}
    FROM categories
    INNER JOIN subcategories
      ON subcategories.category_id = categories.id
     AND subcategories.slug = 'amortizatory'
    WHERE categories.slug = 'podveska'
  `;
}

async function assertLearningRulePreserved() {
  const [row] = await sql<{ count: string; priority: number | null }[]>`
    SELECT count(*)::text AS count, max(priority) AS priority
    FROM categorization_rules
    WHERE pattern = 'fixture-learning-rule'
      AND created_by IS NOT NULL
      AND is_active = true
  `;
  assert(Number(row.count) === 1, "learning rule should remain active");
  assert(row.priority === 777, "learning rule priority should remain unchanged");
}

function quoteIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

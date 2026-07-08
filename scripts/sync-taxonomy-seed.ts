import { writeFileSync } from "node:fs";
import path from "node:path";
import { catalogTaxonomy, defaultCategorizationRules } from "../src/config/catalog-taxonomy";

const outputPath = path.resolve("db/seeds/002_taxonomy_rules.sql");
const deprecatedRulePatterns = ["воздушн", "топлив", "салон", "шланг"];

const subcategoryValues = catalogTaxonomy.flatMap((category) =>
  category.subcategories.map(([slug, name], index) =>
    tuple([category.slug, slug, name, (index + 1) * 10])
  )
);

const ruleValues = defaultCategorizationRules.map((rule) =>
  tuple([rule.pattern, rule.categorySlug, rule.subcategorySlug, rule.priority])
);

const contents = `WITH subcategory_seed(category_slug, slug, name, sort_order) AS (
  VALUES
${subcategoryValues.join(",\n")}
)
INSERT INTO subcategories (category_id, slug, name, sort_order)
SELECT categories.id, subcategory_seed.slug, subcategory_seed.name, subcategory_seed.sort_order
FROM subcategory_seed
JOIN categories ON categories.slug = subcategory_seed.category_slug
ON CONFLICT (category_id, slug) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

WITH rule_seed(pattern, category_slug, subcategory_slug, priority) AS (
  VALUES
${ruleValues.join(",\n")}
)
INSERT INTO categorization_rules (pattern, match_type, category_id, subcategory_id, priority)
SELECT
  rule_seed.pattern,
  'contains',
  categories.id,
  subcategories.id,
  rule_seed.priority
FROM rule_seed
JOIN categories ON categories.slug = rule_seed.category_slug
JOIN subcategories
  ON subcategories.category_id = categories.id
 AND subcategories.slug = rule_seed.subcategory_slug
ON CONFLICT (pattern, match_type, category_id, subcategory_id) DO UPDATE
SET
  priority = EXCLUDED.priority,
  is_active = true,
  updated_at = now();

UPDATE categorization_rules
SET
  is_active = false,
  updated_at = now()
WHERE
  match_type = 'contains'
  AND pattern IN (${deprecatedRulePatterns.map(sqlString).join(", ")});
`;

writeFileSync(outputPath, contents);
console.log(`Updated ${path.relative(process.cwd(), outputPath)}`);

function tuple(values: Array<string | number>) {
  return `    (${values.map((value) => (typeof value === "number" ? value : sqlString(value))).join(", ")})`;
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  catalogTaxonomy,
  defaultCategorizationRules,
  deprecatedCategorizationRules
} from "../src/config/catalog-taxonomy";
import { isHiddenPublicSubcategory } from "../src/config/public-taxonomy";

const outputPath = path.resolve("db/seeds/002_taxonomy_rules.sql");

const subcategoryValues = catalogTaxonomy.flatMap((category) =>
  category.subcategories.map(([slug, name], index) =>
    tuple([category.slug, slug, name, (index + 1) * 10, isHiddenPublicSubcategory(category.slug, slug)])
  )
);

const ruleValues = defaultCategorizationRules.map((rule) =>
  tuple([rule.pattern, rule.categorySlug, rule.subcategorySlug, rule.priority])
);

const deprecatedRuleValues = deprecatedCategorizationRules.map((rule) =>
  tuple([
    rule.pattern,
    rule.matchType,
    rule.categorySlug ?? null,
    rule.subcategorySlug ?? null
  ])
);

const contents = `WITH subcategory_seed(category_slug, slug, name, sort_order, is_hidden) AS (
  VALUES
${subcategoryValues.join(",\n")}
)
INSERT INTO subcategories (category_id, slug, name, sort_order, is_hidden)
SELECT categories.id, subcategory_seed.slug, subcategory_seed.name, subcategory_seed.sort_order, subcategory_seed.is_hidden
FROM subcategory_seed
JOIN categories ON categories.slug = subcategory_seed.category_slug
ON CONFLICT (category_id, slug) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_hidden = EXCLUDED.is_hidden,
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

WITH deprecated_rule_seed(pattern, match_type, category_slug, subcategory_slug) AS (
  VALUES
${deprecatedRuleValues.join(",\n")}
)
UPDATE categorization_rules
SET
  is_active = false,
  updated_at = now()
FROM deprecated_rule_seed
LEFT JOIN categories
  ON categories.slug = deprecated_rule_seed.category_slug
LEFT JOIN subcategories
  ON subcategories.category_id = categories.id
 AND subcategories.slug = deprecated_rule_seed.subcategory_slug
WHERE
  categorization_rules.created_by IS NULL
  AND categorization_rules.pattern = deprecated_rule_seed.pattern
  AND categorization_rules.match_type = deprecated_rule_seed.match_type::rule_match_type
  AND (
    deprecated_rule_seed.category_slug IS NULL
    OR (
      categorization_rules.category_id = categories.id
      AND categorization_rules.subcategory_id = subcategories.id
    )
  );
`;

writeFileSync(outputPath, contents);
console.log(`Updated ${path.relative(process.cwd(), outputPath)}`);

function tuple(values: Array<string | number | boolean | null>) {
  return `    (${values.map(toSqlValue).join(", ")})`;
}

function toSqlValue(value: string | number | boolean | null) {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return typeof value === "number" ? String(value) : sqlString(value);
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

import postgres from "postgres";

const FASTENERS_SLUG = "krepezh";

type Queryable = postgres.Sql | postgres.TransactionSql;

interface FastenersCategoryRow {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

interface FastenersSubcategoryRow {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

interface FastenersRuleRow {
  id: string;
  pattern: string;
  match_type: string;
  priority: number;
}

interface FastenersRemovalPlan {
  category: FastenersCategoryRow | null;
  subcategories: FastenersSubcategoryRow[];
  systemRules: FastenersRuleRow[];
  manualOrLearningRuleCount: number;
  activeProductCount: number;
  draftOrReviewProductCount: number;
}

const dryRun = process.argv.includes("--dry-run");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

async function main() {
  const sql = postgres(databaseUrl!, { max: 1 });

  try {
  const plan = await buildFastenersRemovalPlan(sql);
  const summary = summarizePlan(plan, dryRun);

  if (!dryRun) {
    await sql.begin(async (tx) => {
      await applyFastenersRemovalPlan(tx, plan);
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export async function buildFastenersRemovalPlan(
  sql: Queryable
): Promise<FastenersRemovalPlan> {
  const [category] = await sql<FastenersCategoryRow[]>`
    SELECT id, slug, name, is_active
    FROM categories
    WHERE slug = ${FASTENERS_SLUG}
    LIMIT 1
  `;

  if (!category) {
    return {
      category: null,
      subcategories: [],
      systemRules: [],
      manualOrLearningRuleCount: 0,
      activeProductCount: 0,
      draftOrReviewProductCount: 0
    };
  }

  const subcategories = await sql<FastenersSubcategoryRow[]>`
    SELECT id, slug, name, is_active
    FROM subcategories
    WHERE category_id = ${category.id}
    ORDER BY sort_order, name
  `;

  const systemRules = await sql<FastenersRuleRow[]>`
    SELECT categorization_rules.id, categorization_rules.pattern, categorization_rules.match_type, categorization_rules.priority
    FROM categorization_rules
    LEFT JOIN subcategories
      ON subcategories.id = categorization_rules.subcategory_id
    WHERE categorization_rules.is_active = true
      AND categorization_rules.created_by IS NULL
      AND (
        categorization_rules.category_id = ${category.id}
        OR subcategories.category_id = ${category.id}
      )
    ORDER BY categorization_rules.priority, categorization_rules.pattern
  `;

  const [manualRuleRow] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM categorization_rules
    LEFT JOIN subcategories
      ON subcategories.id = categorization_rules.subcategory_id
    WHERE categorization_rules.is_active = true
      AND categorization_rules.created_by IS NOT NULL
      AND (
        categorization_rules.category_id = ${category.id}
        OR subcategories.category_id = ${category.id}
      )
  `;

  const [activeProductsRow] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM products
    INNER JOIN catalog_versions
      ON catalog_versions.id = products.catalog_version_id
    WHERE catalog_versions.status = 'active'
      AND products.status = 'active'
      AND (
        products.category_id = ${category.id}
        OR products.subcategory_id IN (SELECT id FROM subcategories WHERE category_id = ${category.id})
      )
  `;

  const [draftOrReviewProductsRow] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM products
    INNER JOIN catalog_versions
      ON catalog_versions.id = products.catalog_version_id
    WHERE (
        catalog_versions.status = 'draft'
        OR products.status = 'needs_review'
      )
      AND (
        products.category_id = ${category.id}
        OR products.subcategory_id IN (SELECT id FROM subcategories WHERE category_id = ${category.id})
      )
  `;

  return {
    category,
    subcategories,
    systemRules,
    manualOrLearningRuleCount: Number(manualRuleRow?.count ?? 0),
    activeProductCount: Number(activeProductsRow?.count ?? 0),
    draftOrReviewProductCount: Number(draftOrReviewProductsRow?.count ?? 0)
  };
}

export async function applyFastenersRemovalPlan(
  tx: postgres.TransactionSql,
  plan: FastenersRemovalPlan
) {
  if (!plan.category) {
    return;
  }

  if (plan.systemRules.length > 0) {
    await tx`
      UPDATE categorization_rules
      SET is_active = false, updated_at = now()
      WHERE id IN ${tx(plan.systemRules.map((rule) => rule.id))}
        AND created_by IS NULL
    `;
  }

  await tx`
    UPDATE subcategories
    SET is_active = false, updated_at = now()
    WHERE category_id = ${plan.category.id}
  `;

  await tx`
    UPDATE categories
    SET is_active = false, updated_at = now()
    WHERE id = ${plan.category.id}
  `;
}

function summarizePlan(plan: FastenersRemovalPlan, dryRun: boolean) {
  const warnings = [];

  if (plan.activeProductCount > 0) {
    warnings.push(
      "В активном каталоге есть товары с категорией krepezh. Команда не меняет товары; публикация нового импорта должна вывести их из публичного каталога или оставить в review."
    );
  }

  if (plan.manualOrLearningRuleCount > 0) {
    warnings.push(
      "Найдены manual/learning rules по krepezh. Команда оставит их без изменений."
    );
  }

  return {
    dryRun,
    categoryFound: Boolean(plan.category),
    category: plan.category
      ? {
          slug: plan.category.slug,
          name: plan.category.name,
          active: plan.category.is_active,
          willDeactivate: plan.category.is_active
        }
      : null,
    subcategories: plan.subcategories.map((subcategory) => ({
      slug: subcategory.slug,
      name: subcategory.name,
      active: subcategory.is_active,
      willDeactivate: subcategory.is_active
    })),
    systemRulesToDeactivate: plan.systemRules.map((rule) => ({
      pattern: rule.pattern,
      matchType: rule.match_type,
      priority: rule.priority
    })),
    manualOrLearningRuleCount: plan.manualOrLearningRuleCount,
    activeProductCount: plan.activeProductCount,
    draftOrReviewProductCount: plan.draftOrReviewProductCount,
    changes: {
      categories: plan.category?.is_active ? 1 : 0,
      subcategories: plan.subcategories.filter((subcategory) => subcategory.is_active).length,
      systemRules: plan.systemRules.length,
      products: 0,
      manualOrLearningRules: 0
    },
    warnings
  };
}

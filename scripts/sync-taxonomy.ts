import postgres from "postgres";
import { catalogTaxonomy, defaultCategorizationRules, deprecatedCategorizationRules } from "../src/config/catalog-taxonomy";
import { catalogCategories } from "../src/config/categories";
import { isHiddenPublicSubcategory } from "../src/config/public-taxonomy";

type Queryable = postgres.Sql | postgres.TransactionSql;

type MatchType = "contains" | "starts_with" | "exact" | "regex";

interface CategorySeed {
  slug: string;
  name: string;
  sortOrder: number;
  isAllAssortment: boolean;
  seoTitle: string;
  seoDescription: string;
}

interface SubcategorySeed {
  categorySlug: string;
  slug: string;
  name: string;
  sortOrder: number;
  isHidden: boolean;
}

interface RuleSeed {
  pattern: string;
  matchType: MatchType;
  categorySlug: string;
  subcategorySlug: string;
  priority: number;
}

interface DeprecatedRuleSeed {
  pattern: string;
  matchType: MatchType;
  categorySlug?: string;
  subcategorySlug?: string;
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_all_assortment: boolean;
  seo_title: string | null;
  seo_description: string | null;
}

interface SubcategoryRow {
  id: string;
  category_id: string;
  category_slug: string;
  slug: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
}

interface RuleRow {
  id: string;
  pattern: string;
  match_type: MatchType;
  category_id: string;
  category_slug: string;
  subcategory_id: string | null;
  subcategory_slug: string | null;
  priority: number;
  is_active: boolean;
  created_by: string | null;
}

interface SyncIssue {
  code: string;
  message: string;
  details?: unknown;
}

interface CategoryUpdate {
  slug: string;
  id: string;
  changes: Record<string, { from: string | number | boolean | null; to: string | number | boolean | null }>;
}

interface SubcategoryUpdate {
  categorySlug: string;
  slug: string;
  id: string;
  changes: Record<string, { from: string | number | boolean | null; to: string | number | boolean | null }>;
}

interface RuleUpdate {
  pattern: string;
  matchType: MatchType;
  categorySlug: string;
  subcategorySlug: string;
  id: string;
  changes: Record<string, { from: string | number | boolean | null; to: string | number | boolean | null }>;
}

interface ManualRuleMatch {
  pattern: string;
  matchType: MatchType;
  categorySlug: string;
  subcategorySlug: string;
  id: string;
}

interface TaxonomySyncPlan {
  categoriesToAdd: CategorySeed[];
  categoriesToUpdate: CategoryUpdate[];
  categoriesUnchanged: number;
  subcategoriesToAdd: SubcategorySeed[];
  subcategoriesToUpdate: SubcategoryUpdate[];
  subcategoriesUnchanged: number;
  rulesToAdd: RuleSeed[];
  rulesToUpdate: RuleUpdate[];
  rulesUnchanged: number;
  rulesBackedByManualRows: ManualRuleMatch[];
  rulesToDeactivate: RuleRow[];
  conflicts: SyncIssue[];
  warnings: SyncIssue[];
}

export interface TaxonomySyncSummary {
  dryRun: boolean;
  categories: {
    add: Array<Pick<CategorySeed, "slug" | "name" | "sortOrder">>;
    update: CategoryUpdate[];
    unchanged: number;
  };
  subcategories: {
    add: Array<Pick<SubcategorySeed, "categorySlug" | "slug" | "name" | "sortOrder" | "isHidden">>;
    update: SubcategoryUpdate[];
    unchanged: number;
  };
  rules: {
    add: Array<Pick<RuleSeed, "pattern" | "matchType" | "categorySlug" | "subcategorySlug" | "priority">>;
    update: RuleUpdate[];
    unchanged: number;
    backedByManualRows: ManualRuleMatch[];
    deactivateSystemDeprecated: Array<Pick<RuleRow, "id" | "pattern" | "match_type" | "category_slug" | "subcategory_slug" | "priority">>;
  };
  conflicts: SyncIssue[];
  warnings: SyncIssue[];
}

const categorySeo = new Map<string, Pick<CategorySeed, "seoTitle" | "seoDescription">>([
  [
    "podveska",
    {
      seoTitle: "Подвеска | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Детали подвески в каталоге магазина автозапчастей в Талдоме."
    }
  ],
  [
    "elektrika",
    {
      seoTitle: "Электрика | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Автомобильная электрика и сопутствующие товары в каталоге магазина."
    }
  ],
  [
    "filtry-i-masla",
    {
      seoTitle: "Фильтры и масла | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Масла, фильтры и расходные материалы для обслуживания автомобиля."
    }
  ],
  [
    "tormoznaya-sistema",
    {
      seoTitle: "Тормозная система | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Товары для тормозной системы в каталоге автозапчастей."
    }
  ],
  [
    "kuzov-i-optika",
    {
      seoTitle: "Кузов и оптика | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Кузовные детали, фары, фонари и элементы оптики."
    }
  ],
  [
    "dvigatel-i-transmissiya",
    {
      seoTitle: "Двигатель и трансмиссия | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Детали двигателя и трансмиссии в каталоге магазина."
    }
  ],
  [
    "aksessuary",
    {
      seoTitle: "Аксессуары | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Автомобильные аксессуары и сопутствующие товары."
    }
  ],
  [
    "ves-assortiment",
    {
      seoTitle: "Весь ассортимент | Автозапчасти на Салтыкова-Щедрина",
      seoDescription: "Полный каталог товаров магазина автозапчастей в Талдоме."
    }
  ]
]);

export async function buildTaxonomySyncPlan(sql: Queryable): Promise<TaxonomySyncPlan> {
  const desired = buildDesiredTaxonomy();
  const conflicts = validateDesiredTaxonomy(desired);
  const warnings: SyncIssue[] = [];

  const [categoryRows, subcategoryRows, ruleRows] = await Promise.all([
    loadCategories(sql),
    loadSubcategories(sql),
    loadRules(sql)
  ]);

  const categoriesBySlug = new Map(categoryRows.map((row) => [row.slug, row]));
  const categoriesByName = new Map(categoryRows.map((row) => [row.name, row]));
  const subcategoriesByCategorySlug = groupSubcategories(subcategoryRows);

  const categoriesToAdd: CategorySeed[] = [];
  const categoriesToUpdate: CategoryUpdate[] = [];
  let categoriesUnchanged = 0;

  for (const seed of desired.categories) {
    const existingBySlug = categoriesBySlug.get(seed.slug);
    const existingByName = categoriesByName.get(seed.name);

    if (existingByName && existingByName.slug !== seed.slug) {
      conflicts.push({
        code: "category_name_conflict",
        message: `Category name "${seed.name}" already belongs to slug "${existingByName.slug}".`,
        details: { desiredSlug: seed.slug, existingSlug: existingByName.slug }
      });
      continue;
    }

    if (!existingBySlug) {
      categoriesToAdd.push(seed);
      continue;
    }

    const changes = diffCategory(existingBySlug, seed);
    if (Object.keys(changes).length > 0) {
      categoriesToUpdate.push({ slug: seed.slug, id: existingBySlug.id, changes });
    } else {
      categoriesUnchanged += 1;
    }
  }

  const subcategoriesToAdd: SubcategorySeed[] = [];
  const subcategoriesToUpdate: SubcategoryUpdate[] = [];
  let subcategoriesUnchanged = 0;

  for (const seed of desired.subcategories) {
    const categoryExistsOrWillBeAdded =
      categoriesBySlug.has(seed.categorySlug) ||
      categoriesToAdd.some((category) => category.slug === seed.categorySlug);

    if (!categoryExistsOrWillBeAdded) {
      conflicts.push({
        code: "missing_subcategory_category",
        message: `Subcategory "${seed.slug}" points to missing category "${seed.categorySlug}".`,
        details: seed
      });
      continue;
    }

    const siblings = subcategoriesByCategorySlug.get(seed.categorySlug) ?? [];
    const existingBySlug = siblings.find((row) => row.slug === seed.slug);
    const existingByName = siblings.find((row) => row.name === seed.name);

    if (existingByName && existingByName.slug !== seed.slug) {
      conflicts.push({
        code: "subcategory_name_conflict",
        message: `Subcategory name "${seed.name}" already belongs to slug "${existingByName.slug}" in "${seed.categorySlug}".`,
        details: {
          categorySlug: seed.categorySlug,
          desiredSlug: seed.slug,
          existingSlug: existingByName.slug
        }
      });
      continue;
    }

    if (!existingBySlug) {
      subcategoriesToAdd.push(seed);
      continue;
    }

    const changes = diffSubcategory(existingBySlug, seed);
    if (Object.keys(changes).length > 0) {
      subcategoriesToUpdate.push({
        categorySlug: seed.categorySlug,
        slug: seed.slug,
        id: existingBySlug.id,
        changes
      });
    } else {
      subcategoriesUnchanged += 1;
    }
  }

  const rulesByTarget = groupRulesByTarget(ruleRows);
  const rulesToAdd: RuleSeed[] = [];
  const rulesToUpdate: RuleUpdate[] = [];
  const rulesBackedByManualRows: ManualRuleMatch[] = [];
  let rulesUnchanged = 0;

  for (const seed of desired.rules) {
    if (!targetExistsAfterPlan(seed, categoriesBySlug, subcategoriesByCategorySlug, categoriesToAdd, subcategoriesToAdd)) {
      conflicts.push({
        code: "invalid_rule_target",
        message: `Rule "${seed.pattern}" points to missing target "${seed.categorySlug}/${seed.subcategorySlug}".`,
        details: seed
      });
      continue;
    }

    const conflictingRules = ruleRows.filter(
      (row) =>
        row.is_active &&
        row.pattern === seed.pattern &&
        row.match_type === seed.matchType &&
        targetKeyFromRuleRow(row) !== targetKey(seed.categorySlug, seed.subcategorySlug)
    );

    for (const conflict of conflictingRules) {
      if (conflict.created_by === null && isDeprecatedRuleRow(conflict, desired.deprecatedRules)) {
        continue;
      }

      const issue = {
        code: conflict.created_by ? "manual_rule_pattern_conflict" : "system_rule_pattern_conflict",
        message: `Active rule "${seed.pattern}" also points to "${conflict.category_slug}/${conflict.subcategory_slug}".`,
        details: {
          pattern: seed.pattern,
          desiredTarget: targetKey(seed.categorySlug, seed.subcategorySlug),
          existingTarget: targetKeyFromRuleRow(conflict),
          existingRuleId: conflict.id,
          createdBy: conflict.created_by
        }
      };

      if (conflict.created_by) {
        warnings.push(issue);
      } else {
        conflicts.push(issue);
      }
    }

    const exactRows = rulesByTarget.get(ruleIdentityKey(seed.pattern, seed.matchType, seed.categorySlug, seed.subcategorySlug)) ?? [];
    const systemExact = exactRows.find((row) => row.created_by === null);
    const manualExact = exactRows.find((row) => row.created_by !== null);

    if (systemExact) {
      const changes = diffRule(systemExact, seed);
      if (Object.keys(changes).length > 0) {
        rulesToUpdate.push({
          pattern: seed.pattern,
          matchType: seed.matchType,
          categorySlug: seed.categorySlug,
          subcategorySlug: seed.subcategorySlug,
          id: systemExact.id,
          changes
        });
      } else {
        rulesUnchanged += 1;
      }
      continue;
    }

    if (manualExact) {
      if (!manualExact.is_active) {
        conflicts.push({
          code: "inactive_manual_rule_blocks_system_rule",
          message: `Inactive manual rule "${seed.pattern}" blocks system rule for "${seed.categorySlug}/${seed.subcategorySlug}".`,
          details: { ruleId: manualExact.id, pattern: seed.pattern }
        });
      } else {
        rulesBackedByManualRows.push({
          pattern: seed.pattern,
          matchType: seed.matchType,
          categorySlug: seed.categorySlug,
          subcategorySlug: seed.subcategorySlug,
          id: manualExact.id
        });
      }
      continue;
    }

    rulesToAdd.push(seed);
  }

  const rulesToDeactivate = ruleRows.filter(
    (row) => row.is_active && row.created_by === null && isDeprecatedRuleRow(row, desired.deprecatedRules)
  );

  return {
    categoriesToAdd,
    categoriesToUpdate,
    categoriesUnchanged,
    subcategoriesToAdd,
    subcategoriesToUpdate,
    subcategoriesUnchanged,
    rulesToAdd,
    rulesToUpdate,
    rulesUnchanged,
    rulesBackedByManualRows,
    rulesToDeactivate,
    conflicts,
    warnings
  };
}

export async function syncTaxonomy(
  sql: postgres.Sql,
  options: { dryRun: boolean }
): Promise<TaxonomySyncSummary> {
  const plan = await buildTaxonomySyncPlan(sql);
  const summary = summarizePlan(plan, options.dryRun);

  if (summary.conflicts.length > 0 || options.dryRun) {
    return summary;
  }

  await sql.begin(async (tx) => {
    await applyTaxonomySyncPlan(tx, plan);
  });

  return summary;
}

export async function applyTaxonomySyncPlan(tx: postgres.TransactionSql, plan: TaxonomySyncPlan) {
  for (const seed of plan.categoriesToAdd) {
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO categories (slug, name, sort_order, is_all_assortment, seo_title, seo_description)
      VALUES (${seed.slug}, ${seed.name}, ${seed.sortOrder}, ${seed.isAllAssortment}, ${seed.seoTitle}, ${seed.seoDescription})
      RETURNING id
    `;
    assertAffected(inserted.length, `category insert ${seed.slug}`);
  }

  for (const update of plan.categoriesToUpdate) {
    const seed = buildDesiredTaxonomy().categories.find((category) => category.slug === update.slug);
    if (!seed) {
      throw new Error(`Missing desired category seed for ${update.slug}`);
    }

    const updated = await tx<{ id: string }[]>`
      UPDATE categories
      SET
        name = ${seed.name},
        sort_order = ${seed.sortOrder},
        is_all_assortment = ${seed.isAllAssortment},
        seo_title = ${seed.seoTitle},
        seo_description = ${seed.seoDescription},
        updated_at = now()
      WHERE id = ${update.id}
      RETURNING id
    `;
    assertAffected(updated.length, `category update ${update.slug}`);
  }

  for (const seed of plan.subcategoriesToAdd) {
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO subcategories (category_id, slug, name, sort_order, is_hidden)
      SELECT categories.id, ${seed.slug}, ${seed.name}, ${seed.sortOrder}, ${seed.isHidden}
      FROM categories
      WHERE categories.slug = ${seed.categorySlug}
      RETURNING id
    `;
    assertAffected(inserted.length, `subcategory insert ${seed.categorySlug}/${seed.slug}`);
  }

  for (const update of plan.subcategoriesToUpdate) {
    const seed = buildDesiredTaxonomy().subcategories.find(
      (subcategory) =>
        subcategory.categorySlug === update.categorySlug && subcategory.slug === update.slug
    );
    if (!seed) {
      throw new Error(`Missing desired subcategory seed for ${update.categorySlug}/${update.slug}`);
    }

    const updated = await tx<{ id: string }[]>`
      UPDATE subcategories
      SET
        name = ${seed.name},
        sort_order = ${seed.sortOrder},
        is_hidden = ${seed.isHidden},
        updated_at = now()
      WHERE id = ${update.id}
      RETURNING id
    `;
    assertAffected(updated.length, `subcategory update ${update.categorySlug}/${update.slug}`);
  }

  for (const seed of plan.rulesToAdd) {
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO categorization_rules (pattern, match_type, category_id, subcategory_id, priority)
      SELECT
        ${seed.pattern},
        ${seed.matchType}::rule_match_type,
        categories.id,
        subcategories.id,
        ${seed.priority}
      FROM categories
      INNER JOIN subcategories
        ON subcategories.category_id = categories.id
       AND subcategories.slug = ${seed.subcategorySlug}
      WHERE categories.slug = ${seed.categorySlug}
      RETURNING id
    `;
    assertAffected(inserted.length, `rule insert ${seed.pattern}`);
  }

  for (const update of plan.rulesToUpdate) {
    const seed = buildDesiredTaxonomy().rules.find(
      (rule) =>
        rule.pattern === update.pattern &&
        rule.matchType === update.matchType &&
        rule.categorySlug === update.categorySlug &&
        rule.subcategorySlug === update.subcategorySlug
    );
    if (!seed) {
      throw new Error(`Missing desired rule seed for ${update.pattern}`);
    }

    const updated = await tx<{ id: string }[]>`
      UPDATE categorization_rules
      SET
        priority = ${seed.priority},
        is_active = true,
        updated_at = now()
      WHERE id = ${update.id}
        AND created_by IS NULL
      RETURNING id
    `;
    assertAffected(updated.length, `rule update ${update.pattern}`);
  }

  for (const row of plan.rulesToDeactivate) {
    const updated = await tx<{ id: string }[]>`
      UPDATE categorization_rules
      SET
        is_active = false,
        updated_at = now()
      WHERE id = ${row.id}
        AND created_by IS NULL
      RETURNING id
    `;
    assertAffected(updated.length, `deprecated rule deactivate ${row.pattern}`);
  }
}

export function summarizePlan(plan: TaxonomySyncPlan, dryRun: boolean): TaxonomySyncSummary {
  return {
    dryRun,
    categories: {
      add: plan.categoriesToAdd.map(({ slug, name, sortOrder }) => ({ slug, name, sortOrder })),
      update: plan.categoriesToUpdate,
      unchanged: plan.categoriesUnchanged
    },
    subcategories: {
      add: plan.subcategoriesToAdd.map(({ categorySlug, slug, name, sortOrder, isHidden }) => ({
        categorySlug,
        slug,
        name,
        sortOrder,
        isHidden
      })),
      update: plan.subcategoriesToUpdate,
      unchanged: plan.subcategoriesUnchanged
    },
    rules: {
      add: plan.rulesToAdd.map(({ pattern, matchType, categorySlug, subcategorySlug, priority }) => ({
        pattern,
        matchType,
        categorySlug,
        subcategorySlug,
        priority
      })),
      update: plan.rulesToUpdate,
      unchanged: plan.rulesUnchanged,
      backedByManualRows: plan.rulesBackedByManualRows,
      deactivateSystemDeprecated: plan.rulesToDeactivate.map(
        ({ id, pattern, match_type, category_slug, subcategory_slug, priority }) => ({
          id,
          pattern,
          match_type,
          category_slug,
          subcategory_slug,
          priority
        })
      )
    },
    conflicts: plan.conflicts,
    warnings: plan.warnings
  };
}

function buildDesiredTaxonomy() {
  const categories: CategorySeed[] = catalogCategories.map((category) => {
    const seo = categorySeo.get(category.slug);
    if (!seo) {
      throw new Error(`Missing SEO seed data for category "${category.slug}".`);
    }

    return {
      slug: category.slug,
      name: category.name,
      sortOrder: category.sortOrder,
      isAllAssortment: "isAllAssortment" in category ? Boolean(category.isAllAssortment) : false,
      seoTitle: seo.seoTitle,
      seoDescription: seo.seoDescription
    };
  });

  const subcategories: SubcategorySeed[] = catalogTaxonomy.flatMap((category) =>
    category.subcategories.map(([slug, name], index) => ({
      categorySlug: category.slug,
      slug,
      name,
      sortOrder: (index + 1) * 10,
      isHidden: isHiddenPublicSubcategory(category.slug, slug)
    }))
  );

  const rules: RuleSeed[] = defaultCategorizationRules.map((rule) => ({
    pattern: rule.pattern,
    matchType: rule.matchType,
    categorySlug: rule.categorySlug,
    subcategorySlug: rule.subcategorySlug,
    priority: rule.priority
  }));

  const deprecatedRules: DeprecatedRuleSeed[] = deprecatedCategorizationRules.map((rule) => ({
    pattern: rule.pattern,
    matchType: rule.matchType,
    categorySlug: rule.categorySlug,
    subcategorySlug: rule.subcategorySlug
  }));

  return { categories, subcategories, rules, deprecatedRules };
}

function validateDesiredTaxonomy(desired: ReturnType<typeof buildDesiredTaxonomy>) {
  const conflicts: SyncIssue[] = [];
  const categorySlugs = new Set<string>();
  const categoryNames = new Set<string>();

  for (const category of desired.categories) {
    pushDuplicateConflict(conflicts, categorySlugs, category.slug, "duplicate_config_category_slug");
    pushDuplicateConflict(conflicts, categoryNames, category.name, "duplicate_config_category_name");
  }

  const taxonomyCategorySlugs = new Set(desired.subcategories.map((subcategory) => subcategory.categorySlug));
  for (const categorySlug of taxonomyCategorySlugs) {
    if (!categorySlugs.has(categorySlug)) {
      conflicts.push({
        code: "taxonomy_category_missing_static_category",
        message: `Taxonomy category "${categorySlug}" is missing from src/config/categories.ts.`
      });
    }
  }

  const subcategoryKeys = new Set<string>();
  const subcategoryNameKeys = new Set<string>();
  for (const subcategory of desired.subcategories) {
    pushDuplicateConflict(
      conflicts,
      subcategoryKeys,
      `${subcategory.categorySlug}/${subcategory.slug}`,
      "duplicate_config_subcategory_slug"
    );
    pushDuplicateConflict(
      conflicts,
      subcategoryNameKeys,
      `${subcategory.categorySlug}/${subcategory.name}`,
      "duplicate_config_subcategory_name"
    );
  }

  const ruleKeys = new Set<string>();
  for (const rule of desired.rules) {
    const target = `${rule.categorySlug}/${rule.subcategorySlug}`;
    if (!subcategoryKeys.has(target)) {
      conflicts.push({
        code: "config_rule_missing_target",
        message: `Rule "${rule.pattern}" points to missing config target "${target}".`,
        details: rule
      });
    }

    pushDuplicateConflict(
      conflicts,
      ruleKeys,
      `${rule.pattern}:${rule.matchType}`,
      "duplicate_config_rule_pattern"
    );
  }

  return conflicts;
}

async function loadCategories(sql: Queryable) {
  return sql<CategoryRow[]>`
    SELECT id, slug, name, sort_order, is_all_assortment, seo_title, seo_description
    FROM categories
  `;
}

async function loadSubcategories(sql: Queryable) {
  return sql<SubcategoryRow[]>`
    SELECT
      subcategories.id,
      subcategories.category_id,
      categories.slug AS category_slug,
      subcategories.slug,
      subcategories.name,
      subcategories.sort_order,
      subcategories.is_hidden
    FROM subcategories
    INNER JOIN categories ON categories.id = subcategories.category_id
  `;
}

async function loadRules(sql: Queryable) {
  return sql<RuleRow[]>`
    SELECT
      categorization_rules.id,
      categorization_rules.pattern,
      categorization_rules.match_type,
      categorization_rules.category_id,
      categories.slug AS category_slug,
      categorization_rules.subcategory_id,
      subcategories.slug AS subcategory_slug,
      categorization_rules.priority,
      categorization_rules.is_active,
      categorization_rules.created_by
    FROM categorization_rules
    INNER JOIN categories ON categories.id = categorization_rules.category_id
    LEFT JOIN subcategories ON subcategories.id = categorization_rules.subcategory_id
  `;
}

function groupSubcategories(rows: SubcategoryRow[]) {
  const result = new Map<string, SubcategoryRow[]>();
  for (const row of rows) {
    const current = result.get(row.category_slug) ?? [];
    current.push(row);
    result.set(row.category_slug, current);
  }
  return result;
}

function groupRulesByTarget(rows: RuleRow[]) {
  const result = new Map<string, RuleRow[]>();
  for (const row of rows) {
    if (!row.subcategory_slug) {
      continue;
    }
    const key = ruleIdentityKey(row.pattern, row.match_type, row.category_slug, row.subcategory_slug);
    const current = result.get(key) ?? [];
    current.push(row);
    result.set(key, current);
  }
  return result;
}

function diffCategory(row: CategoryRow, seed: CategorySeed): CategoryUpdate["changes"] {
  return compactChanges({
    name: change(row.name, seed.name),
    sortOrder: change(row.sort_order, seed.sortOrder),
    isAllAssortment: change(row.is_all_assortment, seed.isAllAssortment),
    seoTitle: change(row.seo_title, seed.seoTitle),
    seoDescription: change(row.seo_description, seed.seoDescription)
  });
}

function diffSubcategory(row: SubcategoryRow, seed: SubcategorySeed): SubcategoryUpdate["changes"] {
  return compactChanges({
    name: change(row.name, seed.name),
    sortOrder: change(row.sort_order, seed.sortOrder),
    isHidden: change(row.is_hidden, seed.isHidden)
  });
}

function diffRule(row: RuleRow, seed: RuleSeed): RuleUpdate["changes"] {
  return compactChanges({
    priority: change(row.priority, seed.priority),
    isActive: change(row.is_active, true)
  });
}

function targetExistsAfterPlan(
  seed: RuleSeed,
  categoriesBySlug: Map<string, CategoryRow>,
  subcategoriesByCategorySlug: Map<string, SubcategoryRow[]>,
  categoriesToAdd: CategorySeed[],
  subcategoriesToAdd: SubcategorySeed[]
) {
  const categoryExists =
    categoriesBySlug.has(seed.categorySlug) ||
    categoriesToAdd.some((category) => category.slug === seed.categorySlug);
  const subcategoryExists =
    (subcategoriesByCategorySlug.get(seed.categorySlug) ?? []).some(
      (subcategory) => subcategory.slug === seed.subcategorySlug
    ) ||
    subcategoriesToAdd.some(
      (subcategory) =>
        subcategory.categorySlug === seed.categorySlug &&
        subcategory.slug === seed.subcategorySlug
    );

  return categoryExists && subcategoryExists;
}

function isDeprecatedRuleRow(row: RuleRow, deprecatedRules: DeprecatedRuleSeed[]) {
  return deprecatedRules.some((rule) => {
    if (row.pattern !== rule.pattern || row.match_type !== rule.matchType) {
      return false;
    }

    if (!rule.categorySlug) {
      return true;
    }

    return row.category_slug === rule.categorySlug && row.subcategory_slug === rule.subcategorySlug;
  });
}

function ruleIdentityKey(
  pattern: string,
  matchType: MatchType,
  categorySlug: string,
  subcategorySlug: string
) {
  return `${pattern}\u0000${matchType}\u0000${categorySlug}\u0000${subcategorySlug}`;
}

function targetKey(categorySlug: string, subcategorySlug: string) {
  return `${categorySlug}/${subcategorySlug}`;
}

function targetKeyFromRuleRow(row: RuleRow) {
  return `${row.category_slug}/${row.subcategory_slug ?? ""}`;
}

function compactChanges<T extends Record<string, { from: unknown; to: unknown } | null>>(changes: T) {
  return Object.fromEntries(
    Object.entries(changes).filter((entry): entry is [string, { from: never; to: never }] => entry[1] !== null)
  );
}

function change<T extends string | number | boolean | null>(from: T, to: T) {
  return from === to ? null : { from, to };
}

function pushDuplicateConflict(
  conflicts: SyncIssue[],
  seen: Set<string>,
  key: string,
  code: string
) {
  if (seen.has(key)) {
    conflicts.push({
      code,
      message: `Duplicate taxonomy config key "${key}".`,
      details: { key }
    });
    return;
  }

  seen.add(key);
}

function assertAffected(count: number, label: string) {
  if (count !== 1) {
    throw new Error(`Expected to affect exactly one row for ${label}, affected ${count}.`);
  }
}

function printSummary(summary: TaxonomySyncSummary) {
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;

  if (args.has("--help") || args.has("-h")) {
    console.log("Usage: pnpm taxonomy:sync [--dry-run]");
    return;
  }

  if (!databaseUrl) {
    console.error("DATABASE_URL is required to sync taxonomy.");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const summary = await syncTaxonomy(sql, { dryRun });
    printSummary(summary);
    if (summary.conflicts.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("sync-taxonomy.ts")) {
  void main();
}

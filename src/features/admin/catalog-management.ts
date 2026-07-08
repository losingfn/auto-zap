import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  catalogVersions,
  categories,
  categorizationRules,
  products,
  subcategories,
  synonyms
} from "@/db/schema";
import { validateRulePattern } from "@/features/categorization/learning";
import { normalizeForCategorization } from "@/features/categorization/engine";
import { buildProductSearchText, getActiveCatalogVersionId } from "@/features/search/documents";
import { syncSearchIndexForActiveCatalog, syncSearchIndexForCatalogVersion } from "@/features/search/indexing";
import { getSearchSynonyms } from "@/features/search/synonyms";
import { slugify } from "@/lib/slug";

export type ProductStatusFilter = "all" | "active" | "archived" | "needs_review" | "invalid";

export async function getAdminCatalogPageData({
  query,
  categoryId,
  subcategoryId,
  status
}: {
  query?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: ProductStatusFilter;
}) {
  const [versionId, taxonomy] = await Promise.all([
    getActiveOrLatestVersionId(),
    getAdminTaxonomyOptions()
  ]);

  if (!versionId) {
    return {
      versionId: null,
      taxonomy,
      products: []
    };
  }

  const where = [eq(products.catalogVersionId, versionId)];
  if (status && status !== "all") {
    where.push(eq(products.status, status));
  }
  if (categoryId) {
    where.push(eq(products.categoryId, categoryId));
  }
  if (subcategoryId) {
    where.push(eq(products.subcategoryId, subcategoryId));
  }
  const trimmedQuery = query?.trim();
  if (trimmedQuery) {
    const like = `%${trimmedQuery}%`;
    where.push(sql`(
      ${products.shopCode} ILIKE ${like}
      OR ${products.name} ILIKE ${like}
      OR ${products.rawName} ILIKE ${like}
      OR ${products.searchText} ILIKE ${like}
    )`);
  }

  const rows = await db
    .select({
      id: products.id,
      shopCode: products.shopCode,
      name: products.name,
      price: products.price,
      status: products.status,
      categoryId: products.categoryId,
      categoryName: categories.name,
      subcategoryId: products.subcategoryId,
      subcategoryName: subcategories.name,
      updatedAt: products.updatedAt
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(and(...where))
    .orderBy(asc(products.name))
    .limit(80);

  return {
    versionId,
    taxonomy,
    products: rows.map((row) => ({ ...row, price: Number(row.price) }))
  };
}

export async function updateAdminProductCategory({
  productId,
  categoryId,
  subcategoryId,
  adminUserId
}: {
  productId: string;
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
}) {
  const { category, subcategory } = await requireCategoryPair(categoryId, subcategoryId);
  const [product] = await db
    .select({
      id: products.id,
      catalogVersionId: products.catalogVersionId,
      shopCode: products.shopCode,
      name: products.name,
      rawName: products.rawName,
      status: products.status,
      previousCategoryId: products.categoryId,
      previousSubcategoryId: products.subcategoryId
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    throw new Error("Товар не найден.");
  }

  const searchSynonyms = await getSearchSynonyms();
  await db
    .update(products)
    .set({
      categoryId,
      subcategoryId,
      searchText: buildProductSearchText({
        shopCode: product.shopCode,
        name: product.name,
        rawName: product.rawName,
        categoryName: category.name,
        subcategoryName: subcategory.name,
        synonyms: searchSynonyms
      }),
      updatedAt: new Date()
    })
    .where(eq(products.id, productId));

  const searchIndex = await syncIndexForVersionSafely(product.catalogVersionId);
  await db.insert(auditLogs).values({
    adminUserId,
    action: "catalog.product_category.update",
    entityType: "product",
    entityId: productId,
    metadata: {
      previousCategoryId: product.previousCategoryId,
      previousSubcategoryId: product.previousSubcategoryId,
      categoryId,
      subcategoryId,
      searchIndex
    }
  });
}

export async function getAdminTaxonomyOptions() {
  const [categoryRows, subcategoryRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        sortOrder: categories.sortOrder,
        isActive: categories.isActive,
        isAllAssortment: categories.isAllAssortment
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({
        id: subcategories.id,
        categoryId: subcategories.categoryId,
        slug: subcategories.slug,
        name: subcategories.name,
        sortOrder: subcategories.sortOrder,
        isActive: subcategories.isActive
      })
      .from(subcategories)
      .orderBy(asc(subcategories.sortOrder), asc(subcategories.name))
  ]);

  return categoryRows.map((category) => ({
    ...category,
    subcategories: subcategoryRows.filter((subcategory) => subcategory.categoryId === category.id)
  }));
}

export async function getAdminCategoriesPageData() {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      isAllAssortment: categories.isAllAssortment
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const counts = await db
    .select({
      categoryId: products.categoryId,
      count: sql<number>`count(*)::int`
    })
    .from(products)
    .where(sql`${products.categoryId} is not null`)
    .groupBy(products.categoryId);
  const countByCategory = new Map(counts.map((row) => [row.categoryId, Number(row.count)]));

  return rows.map((category) => ({
    ...category,
    productCount: countByCategory.get(category.id) ?? 0
  }));
}

export async function createAdminCategory(input: {
  name: string;
  slug?: string;
  sortOrder: number;
  isActive: boolean;
  adminUserId: string;
}) {
  const slug = normalizeSlug(input.slug || input.name);
  const [category] = await db
    .insert(categories)
    .values({
      name: input.name.trim(),
      slug,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isAllAssortment: false
    })
    .returning({ id: categories.id });

  await logAdminAction(input.adminUserId, "taxonomy.category.create", "category", category.id, {
    name: input.name,
    slug
  });
}

export async function updateAdminCategory(input: {
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  adminUserId: string;
}) {
  const [current] = await db
    .select({ id: categories.id, isActive: categories.isActive })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!current) throw new Error("Категория не найдена.");

  if (current.isActive && !input.isActive) {
    await assertNoProducts("category", input.categoryId);
  }

  await db
    .update(categories)
    .set({
      name: input.name.trim(),
      slug: normalizeSlug(input.slug),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date()
    })
    .where(eq(categories.id, input.categoryId));

  const searchIndex = await syncActiveIndexSafely();
  await logAdminAction(input.adminUserId, "taxonomy.category.update", "category", input.categoryId, {
    name: input.name,
    slug: input.slug,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    searchIndex
  });
}

export async function getAdminSubcategoriesPageData() {
  const [taxonomy, counts] = await Promise.all([
    getAdminTaxonomyOptions(),
    db
      .select({
        subcategoryId: products.subcategoryId,
        count: sql<number>`count(*)::int`
      })
      .from(products)
      .where(sql`${products.subcategoryId} is not null`)
      .groupBy(products.subcategoryId)
  ]);
  const countBySubcategory = new Map(counts.map((row) => [row.subcategoryId, Number(row.count)]));

  return {
    taxonomy,
    subcategories: taxonomy.flatMap((category) =>
      category.subcategories.map((subcategory) => ({
        ...subcategory,
        categoryName: category.name,
        productCount: countBySubcategory.get(subcategory.id) ?? 0
      }))
    )
  };
}

export async function createAdminSubcategory(input: {
  categoryId: string;
  name: string;
  slug?: string;
  sortOrder: number;
  isActive: boolean;
  adminUserId: string;
}) {
  const slug = normalizeSlug(input.slug || input.name);
  const [subcategory] = await db
    .insert(subcategories)
    .values({
      categoryId: input.categoryId,
      name: input.name.trim(),
      slug,
      sortOrder: input.sortOrder,
      isActive: input.isActive
    })
    .returning({ id: subcategories.id });

  await logAdminAction(input.adminUserId, "taxonomy.subcategory.create", "subcategory", subcategory.id, {
    categoryId: input.categoryId,
    name: input.name,
    slug
  });
}

export async function updateAdminSubcategory(input: {
  subcategoryId: string;
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  adminUserId: string;
}) {
  const [current] = await db
    .select({
      id: subcategories.id,
      categoryId: subcategories.categoryId,
      isActive: subcategories.isActive
    })
    .from(subcategories)
    .where(eq(subcategories.id, input.subcategoryId))
    .limit(1);
  if (!current) throw new Error("Подкатегория не найдена.");

  const used = await countProducts({ subcategoryId: input.subcategoryId });
  if ((current.isActive && !input.isActive) || current.categoryId !== input.categoryId) {
    if (used > 0) {
      throw new Error("Нельзя отключить или перенести подкатегорию, пока в ней есть товары.");
    }
  }

  await db
    .update(subcategories)
    .set({
      categoryId: input.categoryId,
      name: input.name.trim(),
      slug: normalizeSlug(input.slug),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      updatedAt: new Date()
    })
    .where(eq(subcategories.id, input.subcategoryId));

  const searchIndex = await syncActiveIndexSafely();
  await logAdminAction(input.adminUserId, "taxonomy.subcategory.update", "subcategory", input.subcategoryId, {
    categoryId: input.categoryId,
    name: input.name,
    slug: input.slug,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    searchIndex
  });
}

export async function getAdminRulesPageData() {
  const [taxonomy, rows] = await Promise.all([
    getAdminTaxonomyOptions(),
    db
      .select({
        id: categorizationRules.id,
        pattern: categorizationRules.pattern,
        matchType: categorizationRules.matchType,
        priority: categorizationRules.priority,
        isActive: categorizationRules.isActive,
        categoryId: categories.id,
        categoryName: categories.name,
        subcategoryId: subcategories.id,
        subcategoryName: subcategories.name
      })
      .from(categorizationRules)
      .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
      .innerJoin(subcategories, eq(subcategories.id, categorizationRules.subcategoryId))
      .orderBy(asc(categorizationRules.priority), asc(categorizationRules.pattern))
  ]);

  const conflictKeys = new Map<string, Set<string>>();
  for (const rule of rows.filter((row) => row.isActive)) {
    const key = `${rule.matchType}:${normalizeForCategorization(rule.pattern)}`;
    const targets = conflictKeys.get(key) ?? new Set<string>();
    targets.add(`${rule.categoryId}:${rule.subcategoryId}`);
    conflictKeys.set(key, targets);
  }

  return {
    taxonomy,
    rules: rows.map((rule) => ({
      ...rule,
      hasConflict:
        (conflictKeys.get(`${rule.matchType}:${normalizeForCategorization(rule.pattern)}`)?.size ?? 0) > 1
    }))
  };
}

export async function createAdminRule(input: {
  pattern: string;
  matchType: "contains" | "starts_with" | "exact" | "regex";
  categoryId: string;
  subcategoryId: string;
  priority: number;
  isActive: boolean;
  adminUserId: string;
}) {
  const pattern = validateAndNormalizeRulePattern(input.pattern, input.matchType);
  await requireCategoryPair(input.categoryId, input.subcategoryId);
  const [rule] = await db
    .insert(categorizationRules)
    .values({
      pattern,
      matchType: input.matchType,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      priority: input.priority,
      isActive: input.isActive,
      createdBy: input.adminUserId
    })
    .returning({ id: categorizationRules.id });

  await logAdminAction(input.adminUserId, "taxonomy.rule.create", "categorization_rule", rule.id, input);
}

export async function updateAdminRule(input: {
  ruleId: string;
  pattern: string;
  matchType: "contains" | "starts_with" | "exact" | "regex";
  categoryId: string;
  subcategoryId: string;
  priority: number;
  isActive: boolean;
  adminUserId: string;
}) {
  const pattern = validateAndNormalizeRulePattern(input.pattern, input.matchType);
  await requireCategoryPair(input.categoryId, input.subcategoryId);

  await db
    .update(categorizationRules)
    .set({
      pattern,
      matchType: input.matchType,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      priority: input.priority,
      isActive: input.isActive,
      updatedAt: new Date()
    })
    .where(eq(categorizationRules.id, input.ruleId));

  await logAdminAction(input.adminUserId, "taxonomy.rule.update", "categorization_rule", input.ruleId, input);
}

export async function getAdminSynonymsPageData() {
  return db
    .select({
      id: synonyms.id,
      sourceTerm: synonyms.sourceTerm,
      targetTerms: synonyms.targetTerms,
      isBidirectional: synonyms.isBidirectional,
      isActive: synonyms.isActive,
      updatedAt: synonyms.updatedAt
    })
    .from(synonyms)
    .orderBy(asc(synonyms.sourceTerm));
}

export async function createAdminSynonym(input: {
  sourceTerm: string;
  targetTerms: string[];
  isBidirectional: boolean;
  isActive: boolean;
  adminUserId: string;
}) {
  const normalized = normalizeSynonymInput(input);
  const [synonym] = await db
    .insert(synonyms)
    .values({
      sourceTerm: normalized.sourceTerm,
      targetTerms: normalized.targetTerms,
      isBidirectional: input.isBidirectional,
      isActive: input.isActive,
      createdBy: input.adminUserId
    })
    .returning({ id: synonyms.id });

  const searchIndex = await syncActiveIndexSafely();
  await logAdminAction(input.adminUserId, "search.synonym.create", "synonym", synonym.id, {
    ...normalized,
    searchIndex
  });
}

export async function updateAdminSynonym(input: {
  synonymId: string;
  sourceTerm: string;
  targetTerms: string[];
  isBidirectional: boolean;
  isActive: boolean;
  adminUserId: string;
}) {
  const normalized = normalizeSynonymInput(input);
  await db
    .update(synonyms)
    .set({
      sourceTerm: normalized.sourceTerm,
      targetTerms: normalized.targetTerms,
      isBidirectional: input.isBidirectional,
      isActive: input.isActive,
      updatedAt: new Date()
    })
    .where(eq(synonyms.id, input.synonymId));

  const searchIndex = await syncActiveIndexSafely();
  await logAdminAction(input.adminUserId, "search.synonym.update", "synonym", input.synonymId, {
    ...normalized,
    isBidirectional: input.isBidirectional,
    isActive: input.isActive,
    searchIndex
  });
}

export async function deleteAdminSynonym(input: { synonymId: string; adminUserId: string }) {
  await db.delete(synonyms).where(eq(synonyms.id, input.synonymId));
  const searchIndex = await syncActiveIndexSafely();
  await logAdminAction(input.adminUserId, "search.synonym.delete", "synonym", input.synonymId, {
    searchIndex
  });
}

export function parseSynonymTargets(value: string) {
  return value
    .split(/[\n,;]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

async function getActiveOrLatestVersionId() {
  const active = await getActiveCatalogVersionId();
  if (active) return active;

  const [latest] = await db
    .select({ id: catalogVersions.id })
    .from(catalogVersions)
    .where(inArray(catalogVersions.status, ["draft", "active"]))
    .orderBy(desc(catalogVersions.createdAt))
    .limit(1);
  return latest?.id ?? null;
}

async function requireCategoryPair(categoryId: string, subcategoryId: string) {
  const [category] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  const [subcategory] = await db
    .select({ id: subcategories.id, name: subcategories.name })
    .from(subcategories)
    .where(and(eq(subcategories.id, subcategoryId), eq(subcategories.categoryId, categoryId)))
    .limit(1);

  if (!category || !subcategory) {
    throw new Error("Подкатегория должна принадлежать выбранной категории.");
  }

  return { category, subcategory };
}

async function assertNoProducts(kind: "category" | "subcategory", id: string) {
  const count = await countProducts(kind === "category" ? { categoryId: id } : { subcategoryId: id });
  if (count > 0) {
    throw new Error("Нельзя отключить раздел, пока в нём есть товары.");
  }
}

async function countProducts(filter: { categoryId?: string; subcategoryId?: string }) {
  const where = [];
  if (filter.categoryId) where.push(eq(products.categoryId, filter.categoryId));
  if (filter.subcategoryId) where.push(eq(products.subcategoryId, filter.subcategoryId));
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...where));
  return Number(result?.count ?? 0);
}

function validateAndNormalizeRulePattern(
  pattern: string,
  matchType: "contains" | "starts_with" | "exact" | "regex"
) {
  const trimmed = pattern.trim();
  if (matchType === "regex") {
    if (trimmed.length < 6) throw new Error("Слишком общий шаблон правила.");
    new RegExp(trimmed, "iu");
    return trimmed;
  }

  const validation = validateRulePattern(trimmed);
  if (!validation.ok) {
    throw new Error("Слишком общий шаблон правила.");
  }
  return validation.pattern;
}

function normalizeSynonymInput(input: { sourceTerm: string; targetTerms: string[] }) {
  const sourceTerm = input.sourceTerm.trim().toLowerCase();
  const targetTerms = [...new Set(input.targetTerms.map((term) => term.trim().toLowerCase()).filter(Boolean))]
    .filter((term) => term !== sourceTerm);

  if (!sourceTerm || targetTerms.length === 0) {
    throw new Error("Синоним должен содержать исходный термин и хотя бы одну замену.");
  }

  return { sourceTerm, targetTerms };
}

function normalizeSlug(value: string) {
  const slug = slugify(value.trim());
  if (!slug) {
    throw new Error("Slug не может быть пустым.");
  }
  return slug;
}

async function syncIndexForVersionSafely(catalogVersionId: string) {
  try {
    const activeVersionId = await getActiveCatalogVersionId();
    if (activeVersionId !== catalogVersionId) {
      return "not_active_version";
    }
    const result = await syncSearchIndexForCatalogVersion(catalogVersionId);
    return `synced:${result.indexedCount}`;
  } catch (error) {
    return `sync_failed:${error instanceof Error ? error.message : "unknown"}`;
  }
}

async function syncActiveIndexSafely() {
  try {
    const result = await syncSearchIndexForActiveCatalog();
    return `synced:${result.indexedCount}`;
  } catch (error) {
    return `sync_failed:${error instanceof Error ? error.message : "unknown"}`;
  }
}

async function logAdminAction(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  await db.insert(auditLogs).values({
    adminUserId,
    action,
    entityType,
    entityId,
    metadata
  });
}

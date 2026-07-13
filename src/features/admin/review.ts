import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  catalogVersions,
  categories,
  importRows,
  products,
  reviewQueue,
  subcategories
} from "@/db/schema";
import { categorizeProductName } from "@/features/categorization/engine";
import { learnSafeCategorizationRule, suggestRulePatternForProduct, validateRulePattern } from "@/features/categorization/learning";
import { getCategorizationContext } from "@/features/categorization/repository";
import { buildProductSearchText } from "@/features/search/documents";
import { getSearchSynonyms } from "@/features/search/synonyms";

export const REVIEW_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export type AdminReviewVersionScope = "draft" | "active" | "all";
export type AdminReviewIssueFilter =
  | "all"
  | "missing_category"
  | "missing_subcategory"
  | "missing_name"
  | "no_suggestion";

export type AdminReviewCategoryOption = {
  id: string;
  name: string;
  slug: string;
  subcategories: {
    id: string;
    name: string;
    slug: string;
  }[];
};

export type AdminReviewParams = {
  scope: AdminReviewVersionScope;
  issue: AdminReviewIssueFilter;
  query: string;
  reason: string;
  group: string;
  page: number;
  pageSize: (typeof REVIEW_PAGE_SIZE_OPTIONS)[number];
};

export type AdminReviewItem = {
  reviewId: string;
  productId: string;
  reason: string;
  createdAt: Date;
  catalogVersionId: string | null;
  catalogVersionStatus: string;
  catalogVersionCreatedAt: Date;
  importRowNumber: number | null;
  shopCode: string;
  name: string;
  rawName: string;
  price: number;
  currentCategoryId: string | null;
  currentSubcategoryId: string | null;
  currentCategoryName: string | null;
  currentSubcategoryName: string | null;
  suggestedCategoryId: string | null;
  suggestedSubcategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedSubcategoryName: string | null;
  rulePattern: string | null;
};

export type AdminReviewGroup = {
  key: string;
  label: string;
  count: number;
  examples: string[];
  reason: string;
  suggestedCount: number;
  missingCategoryCount: number;
  missingSubcategoryCount: number;
  rulePattern: string | null;
  ruleWarning: string | null;
};

export type AdminReviewActionFilters = Pick<
  AdminReviewParams,
  "scope" | "issue" | "query" | "reason" | "group"
>;

export const REVIEW_BULK_DRAFT_ONLY_MESSAGE =
  "Массовые действия разрешены только для черновика текущего импорта.";
export const REVIEW_BULK_COUNT_CONFIRMATION_MESSAGE =
  "Для массового действия больше 100 товаров нужно ввести точное количество.";
export const REVIEW_BULK_RULE_BLOCKED_MESSAGE =
  "Правило не создано: шаблон слишком широкий или опасный. Массовое действие не выполнено.";

export class AdminReviewBulkSafetyError extends Error {
  constructor(
    readonly code: "scope_forbidden" | "count_confirmation_required" | "rule_blocked",
    message: string,
    readonly ruleSkippedReason?: string
  ) {
    super(message);
    this.name = "AdminReviewBulkSafetyError";
  }
}

const OTHER_GROUP_KEY = "other";
const DEFAULT_PAGE_SIZE = 20;
const LARGE_ACTION_CONFIRMATION_THRESHOLD = 100;

const ISSUE_LABELS: Record<AdminReviewIssueFilter, string> = {
  all: "Все",
  missing_category: "Без категории",
  missing_subcategory: "Без подкатегории",
  missing_name: "Без названия",
  no_suggestion: "Без уверенного предложения"
};

const GROUP_LABELS: Record<string, string> = {
  болт: "Болты",
  болты: "Болты",
  гайка: "Гайки",
  гайки: "Гайки",
  шайба: "Шайбы",
  шайбы: "Шайбы",
  штуцер: "Штуцеры",
  штуцеры: "Штуцеры",
  фитинг: "Фитинги",
  фитинги: "Фитинги",
  кольцо: "Кольца",
  кольца: "Кольца",
  накладка: "Накладки",
  накладки: "Накладки",
  маска: "Маски",
  маски: "Маски",
  крепеж: "Крепёж",
  соединитель: "Соединители",
  соединители: "Соединители"
};

const GROUP_STOP_WORDS = [
  "для",
  "под",
  "без",
  "при",
  "над",
  "или",
  "и",
  "на",
  "в",
  "во",
  "от",
  "до",
  "из",
  "с",
  "со",
  "к",
  "по",
  "а",
  "the",
  "and",
  "with",
  "new",
  "old",
  "передний",
  "передняя",
  "переднее",
  "задний",
  "задняя",
  "заднее",
  "левый",
  "левая",
  "левое",
  "правый",
  "правая",
  "правое",
  "верхний",
  "верхняя",
  "верхнее",
  "нижний",
  "нижняя",
  "нижнее"
];

export function normalizeAdminReviewParams(input: Partial<Record<string, string | string[] | undefined>> = {}): AdminReviewParams {
  const scope = readEnum(input.scope, ["draft", "active", "all"], "draft");
  const issue = readEnum(
    input.issue ?? input.filter,
    ["all", "missing_category", "missing_subcategory", "missing_name", "no_suggestion"],
    "all"
  );
  const pageSizeValue = Number(readSingle(input.pageSize));
  const pageSize = REVIEW_PAGE_SIZE_OPTIONS.includes(pageSizeValue as AdminReviewParams["pageSize"])
    ? (pageSizeValue as AdminReviewParams["pageSize"])
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(readSingle(input.page)) || 1);

  return {
    scope,
    issue,
    query: readSingle(input.q).trim().slice(0, 120),
    reason: readSingle(input.reason).trim().slice(0, 300),
    group: readSingle(input.group).trim().slice(0, 80),
    page,
    pageSize
  };
}

export async function getAdminReviewPageData(rawParams: Partial<Record<string, string | string[] | undefined>> = {}) {
  const params = normalizeAdminReviewParams(rawParams);
  const versionContext = await getReviewVersionContext();
  const [categoryRows, subcategoryRows] = await Promise.all([getActiveCategories(), getActiveSubcategories()]);
  const categoryOptions = buildCategoryOptions(categoryRows, subcategoryRows);
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategoryRows.map((subcategory) => [subcategory.id, subcategory]));

  const filteredConditions = buildReviewConditions(params, versionContext);
  const offset = (params.page - 1) * params.pageSize;

  const [summary, reasonOptions, groups, filteredCount, reviewRows] = await Promise.all([
    getReviewSummary(params, versionContext),
    getReasonOptions(params, versionContext),
    getReviewGroups(params, versionContext),
    countReviewRows(filteredConditions),
    db
      .select({
        reviewId: reviewQueue.id,
        reason: reviewQueue.reason,
        createdAt: reviewQueue.createdAt,
        suggestedCategoryId: reviewQueue.suggestedCategoryId,
        suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId,
        importRowNumber: importRows.rowNumber,
        productId: products.id,
        catalogVersionId: reviewQueue.catalogVersionId,
        shopCode: products.shopCode,
        name: products.name,
        rawName: products.rawName,
        price: products.price,
        currentCategoryId: products.categoryId,
        currentSubcategoryId: products.subcategoryId,
        catalogVersionStatus: catalogVersions.status,
        catalogVersionCreatedAt: catalogVersions.createdAt
      })
      .from(reviewQueue)
      .innerJoin(products, eq(products.id, reviewQueue.productId))
      .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
      .leftJoin(importRows, eq(importRows.id, reviewQueue.importRowId))
      .where(and(...filteredConditions))
      .orderBy(desc(catalogVersions.createdAt), asc(reviewQueue.createdAt), asc(products.name))
      .limit(params.pageSize)
      .offset(offset)
  ]);

  const selectedGroup = params.group
    ? await getReviewGroupSummary(params.group, params, versionContext)
    : null;

  return {
    params,
    issueLabels: ISSUE_LABELS,
    versionContext,
    summary,
    reasonOptions,
    categories: categoryOptions,
    groups,
    selectedGroup,
    queueCount: summary.total,
    filteredCount,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total: filteredCount,
      from: filteredCount === 0 ? 0 : offset + 1,
      to: Math.min(offset + params.pageSize, filteredCount),
      pageCount: Math.max(1, Math.ceil(filteredCount / params.pageSize))
    },
    items: reviewRows.map((row): AdminReviewItem => {
      const suggestedCategory = row.suggestedCategoryId
        ? categoryById.get(row.suggestedCategoryId)
        : null;
      const suggestedSubcategory = row.suggestedSubcategoryId
        ? subcategoryById.get(row.suggestedSubcategoryId)
        : null;
      const currentCategory = row.currentCategoryId ? categoryById.get(row.currentCategoryId) : null;
      const currentSubcategory = row.currentSubcategoryId
        ? subcategoryById.get(row.currentSubcategoryId)
        : null;

      return {
        reviewId: row.reviewId,
        productId: row.productId,
        reason: row.reason,
        createdAt: row.createdAt,
        catalogVersionId: row.catalogVersionId,
        catalogVersionStatus: row.catalogVersionStatus,
        catalogVersionCreatedAt: row.catalogVersionCreatedAt,
        importRowNumber: row.importRowNumber,
        shopCode: row.shopCode,
        name: row.name,
        rawName: row.rawName,
        price: Number(row.price),
        currentCategoryId: row.currentCategoryId,
        currentSubcategoryId: row.currentSubcategoryId,
        currentCategoryName: currentCategory?.name ?? null,
        currentSubcategoryName: currentSubcategory?.name ?? null,
        suggestedCategoryId: row.suggestedCategoryId,
        suggestedSubcategoryId: row.suggestedSubcategoryId,
        suggestedCategoryName: suggestedCategory?.name ?? null,
        suggestedSubcategoryName: suggestedSubcategory?.name ?? null,
        rulePattern: suggestRulePatternForProduct(row.name)
      };
    })
  };
}

export async function applyReviewGroupCorrection(input: {
  filters: AdminReviewActionFilters;
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  learnRule: boolean;
  rulePattern?: string;
  confirmationCount?: number | null;
}) {
  assertDraftBulkScope(input.filters);

  if (!input.filters.group) {
    throw new Error("Группа не выбрана.");
  }

  const versionContext = await getReviewVersionContext();
  const rows = await getReviewRowsForBulkAction(input.filters, versionContext);
  assertLargeActionConfirmed(rows.length, input.confirmationCount);

  return applyBulkCategorizationCorrection({
    rows,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    adminUserId: input.adminUserId,
    learnRule: input.learnRule,
    rulePattern: input.rulePattern,
    allowProductNounSingleWordRule: true,
    action: "categorization.group_correction"
  });
}

export async function applySelectedReviewCorrections(input: {
  filters: AdminReviewActionFilters;
  reviewQueueIds: string[];
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  learnRule: boolean;
  rulePattern?: string;
  confirmationCount?: number | null;
}) {
  assertDraftBulkScope(input.filters);

  const uniqueIds = [...new Set(input.reviewQueueIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Не выбраны товары для обработки.");
  }

  const versionContext = await getReviewVersionContext();
  const rows = await getReviewRowsByIds(uniqueIds, versionContext);
  assertLargeActionConfirmed(rows.length, input.confirmationCount);

  return applyBulkCategorizationCorrection({
    rows,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    adminUserId: input.adminUserId,
    learnRule: input.learnRule,
    rulePattern: input.rulePattern,
    allowProductNounSingleWordRule: false,
    action: "categorization.selected_correction"
  });
}

export async function reapplyCategorizationRulesToReviewQueue(input: {
  filters: AdminReviewActionFilters;
  adminUserId: string;
  confirmationCount?: number | null;
}) {
  assertDraftBulkScope(input.filters);

  const versionContext = await getReviewVersionContext();
  const before = await countReviewRows(buildReviewConditions(input.filters, versionContext));
  assertLargeActionConfirmed(before, input.confirmationCount);

  const rows = await getReviewRowsForBulkAction(input.filters, versionContext);
  const [categorizationContext, searchSynonyms] = await Promise.all([
    getCategorizationContext(),
    getSearchSynonyms()
  ]);

  const now = new Date();
  let resolved = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const categorization = categorizeProductName(`${row.shopCode} ${row.name || row.rawName}`, categorizationContext);
      if (
        categorization.needsReview ||
        !categorization.target?.categoryId ||
        !categorization.target.subcategoryId
      ) {
        continue;
      }

      await tx
        .update(products)
        .set({
          categoryId: categorization.target.categoryId,
          subcategoryId: categorization.target.subcategoryId,
          status: "active",
          reviewReason: null,
          searchText: buildProductSearchText({
            shopCode: row.shopCode,
            name: row.name,
            rawName: row.rawName,
            categoryName: categorization.target.categoryName,
            subcategoryName: categorization.target.subcategoryName,
            synonyms: searchSynonyms
          }),
          updatedAt: now
        })
        .where(eq(products.id, row.productId));

      await tx
        .update(reviewQueue)
        .set({
          status: "resolved",
          resolvedBy: input.adminUserId,
          resolvedAt: now,
          updatedAt: now
        })
        .where(eq(reviewQueue.id, row.reviewId));

      resolved += 1;
    }

    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "categorization.rules_reapplied",
      entityType: "review_queue",
      metadata: {
        scope: input.filters.scope,
        issue: input.filters.issue,
        query: input.filters.query,
        reason: input.filters.reason,
        group: input.filters.group,
        before,
        resolved
      }
    });
  });

  return {
    before,
    resolved,
    remaining: Math.max(0, before - resolved)
  };
}

function getActiveCategories() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      sortOrder: categories.sortOrder
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

function getActiveSubcategories() {
  return db
    .select({
      id: subcategories.id,
      categoryId: subcategories.categoryId,
      slug: subcategories.slug,
      name: subcategories.name,
      sortOrder: subcategories.sortOrder
    })
    .from(subcategories)
    .where(eq(subcategories.isActive, true))
    .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));
}

async function getReviewVersionContext() {
  const [latestDraft, latestActive] = await Promise.all([
    db
      .select({
        id: catalogVersions.id,
        sourceFileName: catalogVersions.sourceFileName,
        createdAt: catalogVersions.createdAt
      })
      .from(catalogVersions)
      .where(eq(catalogVersions.status, "draft"))
      .orderBy(desc(catalogVersions.createdAt))
      .limit(1),
    db
      .select({
        id: catalogVersions.id,
        sourceFileName: catalogVersions.sourceFileName,
        createdAt: catalogVersions.createdAt,
        publishedAt: catalogVersions.publishedAt
      })
      .from(catalogVersions)
      .where(eq(catalogVersions.status, "active"))
      .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
      .limit(1)
  ]);

  return {
    latestDraft: latestDraft[0] ?? null,
    latestActive: latestActive[0] ?? null
  };
}

async function getReviewSummary(params: AdminReviewParams, versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>) {
  const base = buildReviewConditions(params, versionContext, {
    includeIssue: false,
    includeGroup: false
  });
  const resolvedToday = buildReviewConditions(params, versionContext, {
    status: "resolved",
    includeIssue: false,
    includeGroup: false
  });

  const [
    total,
    missingCategory,
    missingSubcategory,
    missingName,
    noSuggestion,
    resolvedTodayCount,
    latestDraftOpen,
    activeOpen
  ] = await Promise.all([
    countReviewRows(base),
    countReviewRows([...base, missingCategoryCondition()]),
    countReviewRows([...base, missingSubcategoryCondition()]),
    countReviewRows([...base, missingNameCondition()]),
    countReviewRows([...base, noSuggestionCondition()]),
    countReviewRows([...resolvedToday, sql`${reviewQueue.resolvedAt} >= date_trunc('day', now())`]),
    versionContext.latestDraft
      ? countReviewRows([
          eq(reviewQueue.status, "open"),
          eq(reviewQueue.catalogVersionId, versionContext.latestDraft.id)
        ])
      : Promise.resolve(0),
    versionContext.latestActive
      ? countReviewRows([
          eq(reviewQueue.status, "open"),
          eq(reviewQueue.catalogVersionId, versionContext.latestActive.id)
        ])
      : Promise.resolve(0)
  ]);

  return {
    total,
    missingCategory,
    missingSubcategory,
    missingName,
    noSuggestion,
    resolvedToday: resolvedTodayCount,
    latestDraftOpen,
    activeOpen
  };
}

async function getReasonOptions(params: AdminReviewParams, versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>) {
  const conditions = buildReviewConditions(params, versionContext, {
    includeIssue: false,
    includeReason: false,
    includeGroup: false
  });

  const rows = await db
    .select({
      reason: reviewQueue.reason,
      count: sql<number>`count(*)::int`
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .where(and(...conditions))
    .groupBy(reviewQueue.reason)
    .orderBy(desc(sql`count(*)`), asc(reviewQueue.reason))
    .limit(30);

  return rows.map((row) => ({
    reason: row.reason,
    count: Number(row.count)
  }));
}

async function getReviewGroups(params: AdminReviewParams, versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>) {
  const groupKey = reviewGroupKeySql();
  const conditions = buildReviewConditions(params, versionContext, {
    includeGroup: false
  });

  const rows = await db
    .select({
      key: groupKey,
      count: sql<number>`count(*)::int`,
      examples: sql<string[]>`(array_agg(${products.shopCode} || ' · ' || ${products.name} order by ${products.name}))[1:6]`,
      reason: sql<string>`min(${reviewQueue.reason})`,
      suggestedCount: sql<number>`count(*) filter (where ${reviewQueue.suggestedCategoryId} is not null or ${reviewQueue.suggestedSubcategoryId} is not null)::int`,
      missingCategoryCount: sql<number>`count(*) filter (where ${products.categoryId} is null)::int`,
      missingSubcategoryCount: sql<number>`count(*) filter (where ${products.subcategoryId} is null)::int`
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .where(and(...conditions))
    .groupBy(groupKey)
    .orderBy(desc(sql`count(*)`), asc(groupKey))
    .limit(60);

  return rows.map(mapReviewGroupRow);
}

async function getReviewGroupSummary(
  group: string,
  params: AdminReviewParams,
  versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>
) {
  const groupKey = reviewGroupKeySql();
  const conditions = buildReviewConditions({ ...params, group }, versionContext);

  const rows = await db
    .select({
      key: groupKey,
      count: sql<number>`count(*)::int`,
      examples: sql<string[]>`(array_agg(${products.shopCode} || ' · ' || ${products.name} order by ${products.name}))[1:10]`,
      reason: sql<string>`min(${reviewQueue.reason})`,
      suggestedCount: sql<number>`count(*) filter (where ${reviewQueue.suggestedCategoryId} is not null or ${reviewQueue.suggestedSubcategoryId} is not null)::int`,
      missingCategoryCount: sql<number>`count(*) filter (where ${products.categoryId} is null)::int`,
      missingSubcategoryCount: sql<number>`count(*) filter (where ${products.subcategoryId} is null)::int`
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .where(and(...conditions))
    .groupBy(groupKey)
    .limit(1);

  return rows[0] ? mapReviewGroupRow(rows[0]) : null;
}

function mapReviewGroupRow(row: {
  key: string | null;
  count: number;
  examples: string[] | null;
  reason: string | null;
  suggestedCount: number;
  missingCategoryCount: number;
  missingSubcategoryCount: number;
}): AdminReviewGroup {
  const key = row.key || OTHER_GROUP_KEY;
  const rulePattern = key === OTHER_GROUP_KEY ? null : key;
  const validation = rulePattern
    ? validateRulePattern(rulePattern, { allowProductNounSingleWord: true })
    : { ok: false as const, reason: "too_generic" };

  return {
    key,
    label: groupLabel(key),
    count: Number(row.count),
    examples: row.examples ?? [],
    reason: row.reason ?? "Товар требует проверки.",
    suggestedCount: Number(row.suggestedCount),
    missingCategoryCount: Number(row.missingCategoryCount),
    missingSubcategoryCount: Number(row.missingSubcategoryCount),
    rulePattern,
    ruleWarning:
      rulePattern && !validation.ok
        ? "Это правило может затронуть слишком разные товары. Лучше уточнить условие."
        : null
  };
}

function buildReviewConditions(
  params: AdminReviewActionFilters,
  versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>,
  options: {
    status?: "open" | "resolved";
    includeIssue?: boolean;
    includeReason?: boolean;
    includeGroup?: boolean;
  } = {}
): SQL[] {
  const conditions: SQL[] = [eq(reviewQueue.status, options.status ?? "open")];

  if (params.scope === "draft") {
    conditions.push(
      versionContext.latestDraft
        ? eq(reviewQueue.catalogVersionId, versionContext.latestDraft.id)
        : sql`false`
    );
  } else if (params.scope === "active") {
    conditions.push(
      versionContext.latestActive
        ? eq(reviewQueue.catalogVersionId, versionContext.latestActive.id)
        : sql`false`
    );
  } else {
    conditions.push(inArray(catalogVersions.status, ["draft", "active"]));
  }

  if (params.query) {
    const like = `%${params.query}%`;
    conditions.push(sql`(
      ${products.shopCode} ILIKE ${like}
      OR ${products.name} ILIKE ${like}
      OR ${products.rawName} ILIKE ${like}
      OR ${products.searchText} ILIKE ${like}
    )`);
  }

  if (options.includeReason !== false && params.reason) {
    conditions.push(eq(reviewQueue.reason, params.reason));
  }

  if (options.includeIssue !== false) {
    const issueCondition = issueFilterCondition(params.issue);
    if (issueCondition) {
      conditions.push(issueCondition);
    }
  }

  if (options.includeGroup !== false && params.group) {
    conditions.push(sql`${reviewGroupKeySql()} = ${params.group}`);
  }

  return conditions;
}

function issueFilterCondition(issue: AdminReviewIssueFilter) {
  if (issue === "missing_category") return missingCategoryCondition();
  if (issue === "missing_subcategory") return missingSubcategoryCondition();
  if (issue === "missing_name") return missingNameCondition();
  if (issue === "no_suggestion") return noSuggestionCondition();
  return null;
}

function missingCategoryCondition() {
  return sql`${products.categoryId} is null`;
}

function missingSubcategoryCondition() {
  return sql`${products.subcategoryId} is null`;
}

function missingNameCondition() {
  return sql`(
    nullif(btrim(${products.name}), '') is null
    OR btrim(${products.name}) = btrim(${products.shopCode})
    OR btrim(coalesce(${products.rawName}, '')) = btrim(${products.shopCode})
  )`;
}

function noSuggestionCondition() {
  return sql`(${reviewQueue.suggestedCategoryId} is null or ${reviewQueue.suggestedSubcategoryId} is null)`;
}

function reviewGroupKeySql() {
  const stopWords = sql.join(GROUP_STOP_WORDS.map((word) => sql`${word}`), sql`, `);

  return sql<string>`coalesce((
    select token_value
    from unnest(regexp_split_to_array(replace(lower(${products.name}), 'ё', 'е'), '[^0-9a-zа-я]+')) with ordinality as tokens(token_value, token_order)
    where char_length(token_value) >= 3
      and token_value not in (${stopWords})
      and token_value !~ '^[0-9]+$'
    order by token_order
    limit 1
  ), ${OTHER_GROUP_KEY})`;
}

async function countReviewRows(conditions: SQL[]) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

async function getReviewRowsForBulkAction(
  filters: AdminReviewActionFilters,
  versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>
) {
  return getReviewRows(buildReviewConditions(filters, versionContext));
}

async function getReviewRowsByIds(
  reviewQueueIds: string[],
  versionContext: Awaited<ReturnType<typeof getReviewVersionContext>>
) {
  return getReviewRows([
    eq(reviewQueue.status, "open"),
    inArray(reviewQueue.id, reviewQueueIds),
    versionContext.latestDraft
      ? eq(reviewQueue.catalogVersionId, versionContext.latestDraft.id)
      : sql`false`
  ]);
}

function getReviewRows(conditions: SQL[]) {
  return db
    .select({
      reviewId: reviewQueue.id,
      productId: products.id,
      shopCode: products.shopCode,
      name: products.name,
      rawName: products.rawName,
      catalogVersionId: products.catalogVersionId
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .where(and(...conditions))
    .orderBy(asc(reviewQueue.createdAt));
}

async function applyBulkCategorizationCorrection(input: {
  rows: Awaited<ReturnType<typeof getReviewRows>>;
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  learnRule: boolean;
  rulePattern?: string;
  allowProductNounSingleWordRule: boolean;
  action: string;
}) {
  if (input.rows.length === 0) {
    throw new Error("В выбранной очереди нет открытых товаров.");
  }

  const [category] = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  const [subcategory] = await db
    .select({ id: subcategories.id, name: subcategories.name, slug: subcategories.slug })
    .from(subcategories)
    .where(and(eq(subcategories.id, input.subcategoryId), eq(subcategories.categoryId, input.categoryId)))
    .limit(1);

  if (!category || !subcategory) {
    throw new Error("Категория или подкатегория не найдена.");
  }

  const searchSynonyms = await getSearchSynonyms();
  const now = new Date();
  let learnedRuleId: string | null = null;
  let learnedRulePattern: string | null = null;
  let learnedRuleSkippedReason: string | null = input.learnRule ? "no_safe_pattern" : "disabled";

  await db.transaction(async (tx) => {
    if (input.learnRule) {
      const learnedRule = await learnSafeCategorizationRule({
        tx,
        productName: input.rows[0]?.name ?? "",
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        adminUserId: input.adminUserId,
        requestedPattern: input.rulePattern,
        allowProductNounSingleWord: input.allowProductNounSingleWordRule
      });

      learnedRuleId = learnedRule.id;
      learnedRulePattern = learnedRule.pattern;
      learnedRuleSkippedReason = learnedRule.skippedReason;

      if (learnedRuleSkippedReason) {
        throw new AdminReviewBulkSafetyError(
          "rule_blocked",
          REVIEW_BULK_RULE_BLOCKED_MESSAGE,
          learnedRuleSkippedReason
        );
      }
    }

    for (const row of input.rows) {
      await tx
        .update(products)
        .set({
          categoryId: input.categoryId,
          subcategoryId: input.subcategoryId,
          status: "active",
          reviewReason: null,
          searchText: buildProductSearchText({
            shopCode: row.shopCode,
            name: row.name,
            rawName: row.rawName,
            categoryName: category.name,
            subcategoryName: subcategory.name,
            synonyms: searchSynonyms
          }),
          updatedAt: now
        })
        .where(eq(products.id, row.productId));

      await tx
        .update(reviewQueue)
        .set({
          status: "resolved",
          resolvedBy: input.adminUserId,
          resolvedAt: now,
          updatedAt: now
        })
        .where(eq(reviewQueue.id, row.reviewId));
    }

    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: input.action,
      entityType: "review_queue",
      metadata: {
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        processed: input.rows.length,
        reviewQueueIdsSample: input.rows.slice(0, 100).map((row) => row.reviewId),
        learnedRuleId,
        learnedRulePattern,
        learnedRuleSkippedReason
      }
    });
  });

  const remaining = await countReviewRows([eq(reviewQueue.status, "open")]);

  return {
    processed: input.rows.length,
    remaining,
    learnedRuleId,
    learnedRulePattern,
    learnedRuleSkippedReason,
    categoryName: category.name,
    subcategoryName: subcategory.name
  };
}

function assertDraftBulkScope(filters: AdminReviewActionFilters) {
  if (filters.scope !== "draft") {
    throw new AdminReviewBulkSafetyError("scope_forbidden", REVIEW_BULK_DRAFT_ONLY_MESSAGE);
  }
}

function assertLargeActionConfirmed(actualCount: number, confirmationCount: number | null | undefined) {
  if (actualCount > LARGE_ACTION_CONFIRMATION_THRESHOLD && confirmationCount !== actualCount) {
    throw new AdminReviewBulkSafetyError(
      "count_confirmation_required",
      REVIEW_BULK_COUNT_CONFIRMATION_MESSAGE
    );
  }
}

function buildCategoryOptions(
  categoryRows: {
    id: string;
    name: string;
    slug: string;
  }[],
  subcategoryRows: {
    id: string;
    categoryId: string;
    name: string;
    slug: string;
  }[]
): AdminReviewCategoryOption[] {
  const subcategoriesByCategory = new Map<string, AdminReviewCategoryOption["subcategories"]>();
  for (const subcategory of subcategoryRows) {
    const items = subcategoriesByCategory.get(subcategory.categoryId) ?? [];
    items.push({
      id: subcategory.id,
      name: subcategory.name,
      slug: subcategory.slug
    });
    subcategoriesByCategory.set(subcategory.categoryId, items);
  }

  return categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    subcategories: subcategoriesByCategory.get(category.id) ?? []
  }));
}

function groupLabel(key: string) {
  if (key === OTHER_GROUP_KEY) {
    return "Остальные / Не сгруппировано";
  }

  return GROUP_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readEnum<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T
) {
  const single = readSingle(value);
  return allowed.includes(single as T) ? (single as T) : fallback;
}

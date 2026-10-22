import { createHmac, randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { isPublicTaxonomyTarget } from "@/config/public-taxonomy";
import { db } from "@/db/client";
import {
  adminUsers,
  auditLogs,
  catalogVersions,
  categories,
  categorizationRules,
  productIdentities,
  products,
  reviewQueue,
  reviewReapplyRuns,
  reviewWorkspaceActions,
  reviewWorkspaceItems,
  reviewWorkspaces,
  subcategories
} from "@/db/schema";
import {
  categorizeProductName,
  normalizeForCategorization
} from "@/features/categorization/engine";
import {
  learnSafeCategorizationRule,
  suggestRulePatternForProduct,
  validateRulePattern
} from "@/features/categorization/learning";
import { getCategorizationContext } from "@/features/categorization/repository";
import {
  reuseEnrichedPageRows,
  type PageRowsReuseMetrics
} from "@/features/admin/review-page-enrichment";
import type {
  CategorizationContext,
  CategorizationTarget
} from "@/features/categorization/types";
import { buildProductSearchText } from "@/features/search/documents";
import {
  activatePreparedCatalogSearchIndex,
  prepareSearchIndexForCatalogVersion
} from "@/features/search/indexing";
import { getSearchSynonyms } from "@/features/search/synonyms";
import { getAdminSessionSecret } from "@/features/admin/session-cookie";
import type { AdminReviewPerfLogger } from "@/lib/server/admin-review-perf";
import type { GroupApplyPerfCategory, GroupApplyPerfLogger } from "@/lib/server/group-apply-perf";

export const REVIEW_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const REVIEWABLE_PRODUCT_STATUSES = ["needs_review", "invalid"] as const;
export const REVIEW_PRIMARY_PREFETCH_SIZE = 5;
export const REVIEW_SIMILAR_GROUP_LIMIT = 50;

type ClassificationStats = {
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

export type AdminReviewVersionScope = "workspace" | "active" | "all";
export type AdminReviewIssueFilter =
  | "all"
  | "ready"
  | "quick"
  | "manual"
  | "prepared"
  | "excluded"
  | "missing_category"
  | "missing_subcategory"
  | "missing_name"
  | "conflicting";

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

export type AdminReviewActionFilters = Pick<
  AdminReviewParams,
  "scope" | "issue" | "query" | "reason" | "group"
>;

export type ReviewSuggestionLevel = "ready" | "quick" | "manual";
export type IdentityReviewDecision = "same" | "new";

export type ReviewWorkspaceSummary = {
  id: string | null;
  sourceCatalogVersionId: string | null;
  sourceCatalogVersionStatus: string | null;
  sourceCatalogVersionPublishedAt: Date | null;
  status: "logical" | "open" | "publishing" | "published" | "abandoned";
  preparedProductCount: number;
  excludedProductCount: number;
  actionCount: number;
  lastActionId: string | null;
};

export type AdminReviewSummary = {
  total: number;
  readyGroups: number;
  readyProducts: number;
  quickGroups: number;
  quickProducts: number;
  manualProducts: number;
  preparedProducts: number;
  excludedProducts: number;
  willPublishProducts: number;
  missingCategory: number;
  missingSubcategory: number;
  missingName: number;
  conflictingProducts: number;
  activeOpen: number;
  latestDraftOpen: number;
};

export type AdminReviewItem = {
  reviewId: string;
  productId: string;
  identityConflict: boolean;
  pendingIdentityDecision: IdentityReviewDecision | null;
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
  confidence: number;
  confidenceLabel: string;
  suggestionLevel: ReviewSuggestionLevel;
  explanation: string;
  matchedSignals: string[];
  conflictingSignals: string[];
  groupKey: string;
  groupLabel: string;
  workspaceStatus: "open" | "prepared" | "excluded";
  pendingCategoryName: string | null;
  pendingSubcategoryName: string | null;
  rulePattern: string | null;
};

export type AdminReviewGroup = {
  key: string;
  label: string;
  count: number;
  examples: string[];
  level: ReviewSuggestionLevel;
  confidence: number;
  confidenceLabel: string;
  suggestedCategoryId: string | null;
  suggestedSubcategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedSubcategoryName: string | null;
  explanation: string;
  matchedSignals: string[];
  conflictingSignals: string[];
  impactedProductCount: number;
  excludedCount: number;
  conflictingCount: number;
  preparedCount: number;
  manualOnlyCount: number;
  rulePattern: string | null;
  ruleWarning: string | null;
  previewToken: string;
  sampleProducts: Array<{
    reviewId: string;
    productId: string;
    shopCode: string;
    name: string;
    reason: string;
    safeToApply: boolean;
  }>;
};

export type AdminReviewSimilarGroup = {
  reviewQueueIds: string[];
  count: number;
};

export type AdminReviewPrimaryData = {
  categories: AdminReviewCategoryOption[];
  item: AdminReviewItem | null;
  prefetchedItems: AdminReviewItem[];
  similarGroup: AdminReviewSimilarGroup | null;
  summary: {
    remaining: number;
    reviewed: number;
    total: number;
  };
  canUndo: boolean;
  focusItemUnavailable: boolean;
};

export type AdminReviewListData = {
  categories: AdminReviewCategoryOption[];
  items: AdminReviewItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    from: number;
    to: number;
    pageCount: number;
  };
};

export type ReviewWorkspaceChange = {
  id: string;
  actionType: string;
  status: string;
  productCount: number;
  excludedCount: number;
  categoryName: string | null;
  subcategoryName: string | null;
  rulePattern: string | null;
  createdAt: Date;
  adminName: string | null;
  adminEmail: string | null;
};

export const REVIEW_BULK_DRAFT_ONLY_MESSAGE =
  "Массовые действия выполняются только внутри текущей рабочей сессии проверки.";
export const REVIEW_BULK_COUNT_CONFIRMATION_MESSAGE =
  "Для массового действия больше 100 товаров нужно ввести точное количество.";
export const REVIEW_BULK_RULE_BLOCKED_MESSAGE =
  "Правило слишком общее. Добавьте уточняющее слово, например узел или модель автомобиля.";
export const REVIEW_PREVIEW_STALE_MESSAGE =
  "Состав группы изменился. Обновите preview и повторите действие.";

export class AdminReviewBulkSafetyError extends Error {
  constructor(
    readonly code:
      | "scope_forbidden"
      | "count_confirmation_required"
      | "rule_blocked"
      | "preview_stale"
      | "empty_workspace"
      | "invalid_target"
      | "identity_conflict_requires_manual_resolution"
      | "post_condition_failed",
    message: string,
    readonly ruleSkippedReason?: string
  ) {
    super(message);
    this.name = "AdminReviewBulkSafetyError";
  }
}

type VersionContext = {
  activeVersion: {
    id: string;
    sourceFileName: string | null;
    createdAt: Date;
    publishedAt: Date | null;
  } | null;
  latestDraft: {
    id: string;
    sourceFileName: string | null;
    createdAt: Date;
  } | null;
};

type ReviewRow = {
  reviewId: string;
  reason: string;
  createdAt: Date;
  suggestedCategoryId: string | null;
  suggestedSubcategoryId: string | null;
  importRowNumber: number | null;
  productId: string;
  identityCandidateId: string | null;
  catalogVersionId: string | null;
  shopCode: string;
  name: string;
  rawName: string;
  price: string;
  productStatus: string;
  currentCategoryId: string | null;
  currentSubcategoryId: string | null;
  catalogVersionStatus: string;
  catalogVersionCreatedAt: Date;
  workspaceItemStatus: string | null;
  pendingCategoryId: string | null;
  pendingSubcategoryId: string | null;
  pendingIdentityDecision: IdentityReviewDecision | null;
};

type EnrichedReviewRow = ReviewRow & {
  suggestion: ReviewSuggestion;
  groupKey: string;
  groupLabel: string;
  safeToApply: boolean;
};

type ReviewSuggestion = {
  level: ReviewSuggestionLevel;
  confidence: number;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  explanation: string;
  matchedSignals: string[];
  conflictingSignals: string[];
  rulePattern: string | null;
};

type ReviewDbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReviewSnapshotIdentitySource = {
  id: string;
  status: string;
  productIdentityId: string | null;
};

export type PendingReviewIdentityDecision = {
  productId: string;
  identityDecision: string | null;
  productIdentityId: string | null;
};

export type ReviewSnapshotIdentityPlan = {
  productIdentityIdFor: (productId: string) => string | null;
  newProductIdentityIds: readonly string[];
};

type ReviewQueueStats = {
  total: number;
  missingCategory: number;
  missingSubcategory: number;
  missingName: number;
};

const DEFAULT_PAGE_SIZE = 20;
const LARGE_ACTION_CONFIRMATION_THRESHOLD = 100;
const READY_CONFIDENCE_THRESHOLD = 0.92;
const QUICK_CONFIDENCE_THRESHOLD = 0.85;
const REVIEW_PAGE_GROUPING_ROWS = 300;
const MAX_ACTION_REVIEW_ROWS = 5000;

function isReviewableProductStatus(status: string) {
  return REVIEWABLE_PRODUCT_STATUSES.includes(status as "needs_review" | "invalid");
}

const ISSUE_LABELS: Record<AdminReviewIssueFilter, string> = {
  all: "Все",
  ready: "Готовые предложения",
  quick: "Требуют быстрого просмотра",
  manual: "Только вручную",
  prepared: "Уже распределены",
  excluded: "Исключённые",
  missing_category: "Без категории",
  missing_subcategory: "Без подкатегории",
  missing_name: "Пустое название",
  conflicting: "Конфликтующие правила"
};

const COMMON_RISK_WORDS = new Set([
  "болт",
  "гайка",
  "шайба",
  "кольцо",
  "комплект",
  "кронштейн",
  "трубка",
  "втулка",
  "палец",
  "ремкомплект",
  "корпус",
  "крышка",
  "датчик",
  "клапан",
  "подшипник",
  "сальник"
]);

const STOP_WORDS = new Set([
  "для",
  "под",
  "без",
  "при",
  "над",
  "или",
  "на",
  "в",
  "во",
  "от",
  "до",
  "из",
  "со",
  "передний",
  "передняя",
  "задний",
  "задняя",
  "левый",
  "левая",
  "правый",
  "правая",
  "верхний",
  "нижний"
]);

const CONTEXT_RULES: Array<{
  label: string;
  includeAll: string[];
  categorySlug: string;
  subcategorySlug: string;
  explanation: string;
}> = [
  contextRule("Болты суппортов", ["болт", "суппорт"], "tormoznaya-sistema", "supporty"),
  contextRule("Болты кардана", ["болт", "кардан"], "dvigatel-i-transmissiya", "detali-transmissii"),
  contextRule("Болты ГБЦ", ["болт", "гбц"], "dvigatel-i-transmissiya", "detali-dvigatelya"),
  contextRule(
    "Ремкомплекты суппортов",
    ["ремкомплект", "суппорт"],
    "tormoznaya-sistema",
    "remkomplekty-tormoznoy-sistemy"
  ),
  contextRule("Сальники коленвала", ["сальник", "коленвал"], "dvigatel-i-transmissiya", "detali-dvigatelya"),
  contextRule("Сальники полуоси", ["сальник", "полуось"], "dvigatel-i-transmissiya", "detali-transmissii"),
  contextRule("Датчики давления масла", ["датчик", "давление", "масло"], "elektrika", "datchiki"),
  contextRule("Подшипники ступицы", ["подшипник", "ступица"], "podveska", "stupicy"),
  contextRule("Трос ручного тормоза", ["трос", "ручной", "тормоз"], "tormoznaya-sistema", "ruchnoy-tormoz")
];

export function normalizeAdminReviewParams(input: Partial<Record<string, string | string[] | undefined>> = {}): AdminReviewParams {
  const scope = readEnum(input.scope, ["workspace", "active", "all"], "workspace");
  const issue = readEnum(
    input.issue ?? input.filter,
    [
      "all",
      "ready",
      "quick",
      "manual",
      "prepared",
      "excluded",
      "missing_category",
      "missing_subcategory",
      "missing_name",
      "conflicting"
    ],
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
    group: readSingle(input.group).trim().slice(0, 120),
    page,
    pageSize
  };
}

export function getReviewPageWindow(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize };
}

export function buildReviewPagination(page: number, pageSize: number, total: number) {
  const { limit, offset } = getReviewPageWindow(page, pageSize);
  const safeTotal = Math.max(0, total);
  return {
    page: Math.max(1, page),
    pageSize: limit,
    total: safeTotal,
    from: safeTotal === 0 ? 0 : offset + 1,
    to: Math.min(offset + limit, safeTotal),
    pageCount: Math.max(1, Math.ceil(safeTotal / limit))
  };
}

export function buildPrimaryReviewSummary(
  remaining: number,
  workspace: Pick<ReviewWorkspaceSummary, "preparedProductCount" | "excludedProductCount">
) {
  const reviewed = workspace.preparedProductCount + workspace.excludedProductCount;
  return { remaining, reviewed, total: remaining + reviewed };
}

export async function getAdminReviewPageData(
  rawParams: Partial<Record<string, string | string[] | undefined>> = {},
  options: {
    adminUserId?: string;
    createWorkspaceIfNeeded?: boolean;
    perf?: AdminReviewPerfLogger;
  } = {}
) {
  const perf = options.perf;
  const timer = perf?.start();
  const classificationStats = perf
    ? { calls: 0, totalDurationMs: 0, maxDurationMs: 0 }
    : undefined;
  const params = normalizeAdminReviewParams(rawParams);
  const [versionContext, categoryRows, subcategoryRows, categorizationContext] = await Promise.all([
    getReviewVersionContext(perf),
    getActiveCategories(perf),
    getActiveSubcategories(perf),
    getCategorizationContext(perf)
  ]);
  const categoryOptions = buildCategoryOptions(categoryRows, subcategoryRows);
  const targetBySlug = buildTargetBySlug(categoryRows, subcategoryRows);
  let workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null, perf);
  let rows = await getWorkspaceReviewRows(versionContext, workspace.id, {
    limit: REVIEW_PAGE_GROUPING_ROWS,
    perf,
    stage: "review_rows_sql"
  });

  if (
    options.createWorkspaceIfNeeded &&
    options.adminUserId &&
    !workspace.id &&
    rows.length > 0
  ) {
    if (perf) {
      await perf.measure("workspace_create", () =>
        ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, options.adminUserId!)
      );
    } else {
      await ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, options.adminUserId);
    }
    workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null, perf);
    rows = await getWorkspaceReviewRows(versionContext, workspace.id, {
      limit: REVIEW_PAGE_GROUPING_ROWS,
      perf,
      stage: "review_rows_sql"
    });
  }

  const queueStats = await getReviewQueueStats(versionContext, workspace.id, perf);
  const enrichedRows = perf
    ? perf.measureSync(
        "review_rows_enrichment",
        () => rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug, classificationStats)),
        (result) => ({ rows: result.length })
      )
    : rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug));
  const groups = perf
    ? perf.measureSync(
        "review_groups",
        () =>
          buildReviewGroups(enrichedRows, categoryRows, subcategoryRows, workspace.id, {
            scope: "workspace",
            issue: "all",
            query: "",
            reason: "",
            group: ""
          }),
        (result) => ({ rows: result.length })
      )
    : buildReviewGroups(enrichedRows, categoryRows, subcategoryRows, workspace.id, {
        scope: "workspace",
        issue: "all",
        query: "",
        reason: "",
        group: ""
      });
  const selectedGroup = params.group
    ? (perf
        ? perf.measureSync(
            "selected_group",
            () =>
              buildReviewGroups(
                filterReviewRows(enrichedRows, params),
                categoryRows,
                subcategoryRows,
                workspace.id,
                {
                  scope: params.scope,
                  issue: params.issue,
                  query: params.query,
                  reason: params.reason,
                  group: params.group
                }
              ).find((group) => group.key === params.group) ?? null
          )
        : buildReviewGroups(
            filterReviewRows(enrichedRows, params),
            categoryRows,
            subcategoryRows,
            workspace.id,
            {
              scope: params.scope,
              issue: params.issue,
              query: params.query,
              reason: params.reason,
              group: params.group
            }
          ).find((group) => group.key === params.group) ?? null)
    : null;
  const filteredRows = perf
    ? perf.measureSync("filter_review_rows", () => filterReviewRows(enrichedRows, params), (result) => ({ rows: result.length }))
    : filterReviewRows(enrichedRows, params);
  const offset = (params.page - 1) * params.pageSize;
  const directPageRows = canUseDirectReviewPageRows(params)
    ? await getWorkspaceReviewRows(versionContext, workspace.id, {
        limit: params.pageSize,
        offset,
        perf,
        stage: "page_review_rows_sql"
      })
    : null;
  const pageRows = directPageRows
    ? (() => {
        const enrichedByReviewId = new Map(enrichedRows.map((row) => [row.reviewId, row]));
        const pageRowsReuseMetrics: PageRowsReuseMetrics | undefined = perf
          ? { pageRowsReused: 0, pageRowsClassified: 0, pageRowsCacheMiss: 0 }
          : undefined;
        const enrichPageRows = () =>
          reuseEnrichedPageRows(
            directPageRows,
            enrichedByReviewId,
            (row) => enrichReviewRow(row, categorizationContext, targetBySlug, classificationStats),
            pageRowsReuseMetrics
          );

        return perf
          ? perf.measureSync("page_rows_enrichment", enrichPageRows, (result) => ({
              rows: result.length,
              page_rows_reused: pageRowsReuseMetrics?.pageRowsReused ?? 0,
              page_rows_classified: pageRowsReuseMetrics?.pageRowsClassified ?? 0,
              page_rows_cache_miss: pageRowsReuseMetrics?.pageRowsCacheMiss ?? 0
            }))
          : enrichPageRows();
      })()
    : perf
      ? perf.measureSync(
          "pagination_slice",
          () => filteredRows.slice(offset, offset + params.pageSize),
          (result) => ({ rows: result.length, total: filteredRows.length })
        )
      : filteredRows.slice(offset, offset + params.pageSize);
  const changes = workspace.id ? await getReviewWorkspaceChanges(workspace.id, perf) : [];
  const summary = buildReviewQueueSummary(enrichedRows, groups, workspace, versionContext, queueStats);
  const reasonOptions = buildReasonOptions(enrichedRows);
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategoryRows.map((subcategory) => [subcategory.id, subcategory]));

  const result = {
    params,
    issueLabels: ISSUE_LABELS,
    versionContext,
    workspace,
    summary,
    reasonOptions,
    categories: categoryOptions,
    groups,
    groupsUnavailable: false,
    selectedGroup,
    queueCount: summary.total,
    filteredCount: directPageRows ? queueStats.total : filteredRows.length,
    changes,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total: directPageRows ? queueStats.total : filteredRows.length,
      from: (directPageRows ? queueStats.total : filteredRows.length) === 0 ? 0 : offset + 1,
      to: Math.min(offset + params.pageSize, directPageRows ? queueStats.total : filteredRows.length),
      pageCount: Math.max(1, Math.ceil((directPageRows ? queueStats.total : filteredRows.length) / params.pageSize))
    },
    items: pageRows.map((row) => mapReviewItem(row, categoryById, subcategoryById))
  };

  if (classificationStats) {
    perf?.log("classification_aggregate", {
      duration_ms: classificationStats.totalDurationMs,
      calls: classificationStats.calls,
      rows: classificationStats.calls,
      avg_ms: classificationStats.calls > 0 ? classificationStats.totalDurationMs / classificationStats.calls : 0,
      max_ms: classificationStats.maxDurationMs,
      total_rules: categorizationContext.rules.length
    });
  }
  perf?.log("get_admin_review_page_data", {
    duration_ms: perf.elapsed(timer),
    rows: rows.length,
    total: queueStats.total
  });

  return result;
}

export async function getAdminReviewPrimaryData(
  options: {
    adminUserId?: string;
    createWorkspaceIfNeeded?: boolean;
    focusReviewId?: string | null;
    skipReviewQueueIds?: string[];
    perf?: AdminReviewPerfLogger;
  } = {}
): Promise<AdminReviewPrimaryData> {
  const perf = options.perf;
  const timer = perf?.start();
  const classificationStats = perf
    ? { calls: 0, totalDurationMs: 0, maxDurationMs: 0 }
    : undefined;
  const [versionContext, categoryRows, subcategoryRows, categorizationContext] = await Promise.all([
    getReviewVersionContext(perf),
    getActiveCategories(perf),
    getActiveSubcategories(perf),
    getCategorizationContext(perf)
  ]);
  const categories = buildCategoryOptions(categoryRows, subcategoryRows);
  const targetBySlug = buildTargetBySlug(categoryRows, subcategoryRows);
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategoryRows.map((subcategory) => [subcategory.id, subcategory]));
  let workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null, perf);
  let rows = await getWorkspaceReviewRows(versionContext, workspace.id, {
    limit: REVIEW_PRIMARY_PREFETCH_SIZE,
    onlyUnresolved: true,
    excludeReviewQueueIds: options.skipReviewQueueIds,
    perf,
    stage: "primary_review_rows_sql"
  });

  if (options.createWorkspaceIfNeeded && options.adminUserId && !workspace.id && rows.length > 0) {
    if (perf) {
      await perf.measure("workspace_create", () =>
        ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, options.adminUserId!)
      );
    } else {
      await ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, options.adminUserId);
    }
    workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null, perf);
    rows = await getWorkspaceReviewRows(versionContext, workspace.id, {
      limit: REVIEW_PRIMARY_PREFETCH_SIZE,
      onlyUnresolved: true,
      excludeReviewQueueIds: options.skipReviewQueueIds,
      perf,
      stage: "primary_review_rows_sql"
    });
  }

  let focusItemUnavailable = false;
  if (options.focusReviewId) {
    const focusedRows = await getRowsByReviewIds(
      [options.focusReviewId],
      workspace.id,
      versionContext.activeVersion?.id ?? null
    );
    const focused = focusedRows.find((row) => row.workspaceItemStatus !== "pending" && row.workspaceItemStatus !== "excluded");
    if (focused) {
      rows = [focused, ...rows.filter((row) => row.reviewId !== focused.reviewId)].slice(0, REVIEW_PRIMARY_PREFETCH_SIZE);
    } else {
      focusItemUnavailable = true;
    }
  }

  const enrichedRows = perf
    ? perf.measureSync(
        "primary_review_rows_enrichment",
        () => rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug, classificationStats)),
        (result) => ({ rows: result.length })
      )
    : rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug));
  const items = enrichedRows.map((row) => mapReviewItem(row, categoryById, subcategoryById));
  const item = items[0] ?? null;
  const queueStats = await getReviewQueueStats(versionContext, workspace.id, perf);
  const similarGroup = item
    ? await getSimilarReviewGroupForPrimary({
        item: enrichedRows[0]!,
        versionContext,
        workspaceId: workspace.id,
        categorizationContext,
        targetBySlug,
        excludeReviewQueueIds: options.skipReviewQueueIds,
        perf,
        classificationStats
      })
    : null;

  if (classificationStats) {
    perf?.log("primary_classification_aggregate", {
      duration_ms: classificationStats.totalDurationMs,
      calls: classificationStats.calls,
      rows: classificationStats.calls,
      avg_ms: classificationStats.calls > 0 ? classificationStats.totalDurationMs / classificationStats.calls : 0,
      max_ms: classificationStats.maxDurationMs,
      total_rules: categorizationContext.rules.length
    });
  }
  perf?.log("get_admin_review_primary_data", {
    duration_ms: perf.elapsed(timer),
    prefetched_rows: rows.length,
    similar_group_rows: similarGroup?.count ?? 0,
    remaining: queueStats.total
  });

  return {
    categories,
    item,
    prefetchedItems: items.slice(1),
    similarGroup,
    summary: buildPrimaryReviewSummary(queueStats.total, workspace),
    canUndo: Boolean(workspace.lastActionId),
    focusItemUnavailable
  };
}

/**
 * Loads candidates only for an already prefetched, currently visible card.
 * It intentionally does not reload primary data or create a workspace.
 */
export async function getAdminReviewSimilarGroupData(input: {
  reviewQueueId: string;
  skippedReviewQueueIds?: string[];
}): Promise<{ reviewId: string; similarGroup: AdminReviewSimilarGroup | null }> {
  const [versionContext, categorizationContext, targetBySlug] = await Promise.all([
    getReviewVersionContext(),
    getCategorizationContext(),
    getTargetBySlugFromDb()
  ]);
  const workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null);
  const rows = await getRowsByReviewIds(
    [input.reviewQueueId],
    workspace.id,
    versionContext.activeVersion?.id ?? null
  );
  const row = rows.find((candidate) => candidate.workspaceItemStatus !== "pending" && candidate.workspaceItemStatus !== "excluded");
  if (!row) {
    return { reviewId: input.reviewQueueId, similarGroup: null };
  }

  const item = enrichReviewRow(row, categorizationContext, targetBySlug);
  return {
    reviewId: input.reviewQueueId,
    similarGroup: await getSimilarReviewGroupForPrimary({
      item,
      versionContext,
      workspaceId: workspace.id,
      categorizationContext,
      targetBySlug,
      excludeReviewQueueIds: input.skippedReviewQueueIds
    })
  };
}

export async function getAdminReviewListData(
  rawParams: Partial<Record<string, string | string[] | undefined>> = {},
  options: { adminUserId?: string; createWorkspaceIfNeeded?: boolean; perf?: AdminReviewPerfLogger } = {}
): Promise<AdminReviewListData> {
  const perf = options.perf;
  const params = normalizeAdminReviewParams(rawParams);
  const [versionContext, categoryRows, subcategoryRows, categorizationContext] = await Promise.all([
    getReviewVersionContext(perf),
    getActiveCategories(perf),
    getActiveSubcategories(perf),
    getCategorizationContext(perf)
  ]);
  const targetBySlug = buildTargetBySlug(categoryRows, subcategoryRows);
  const categories = buildCategoryOptions(categoryRows, subcategoryRows);
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategoryRows.map((subcategory) => [subcategory.id, subcategory]));
  let workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null, perf);
  const pageWindow = getReviewPageWindow(params.page, params.pageSize);
  let rows = await getWorkspaceReviewRows(versionContext, workspace.id, {
    limit: pageWindow.limit,
    offset: pageWindow.offset,
    query: params.query,
    perf,
    stage: "list_review_rows_sql"
  });

  if (options.createWorkspaceIfNeeded && options.adminUserId && !workspace.id && rows.length > 0) {
    await ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, options.adminUserId);
    workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null, perf);
    rows = await getWorkspaceReviewRows(versionContext, workspace.id, {
      limit: pageWindow.limit,
      offset: pageWindow.offset,
      query: params.query,
      perf,
      stage: "list_review_rows_sql"
    });
  }

  const enrichedRows = perf
    ? perf.measureSync(
        "list_review_rows_enrichment",
        () => rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug)),
        (result) => ({ rows: result.length })
      )
    : rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug));
  const total = await getReviewListCount(versionContext, params.query, perf);

  return {
    categories,
    items: enrichedRows.map((row) => mapReviewItem(row, categoryById, subcategoryById)),
    pagination: buildReviewPagination(params.page, params.pageSize, total)
  };
}

export async function getReviewWorkspace(
  sourceCatalogVersionId: string | null,
  perf?: AdminReviewPerfLogger
): Promise<ReviewWorkspaceSummary> {
  if (!sourceCatalogVersionId) {
    return emptyWorkspace(null);
  }

  const workspaceTimer = perf?.start();
  const workspaceQuery = db
    .select({
      id: reviewWorkspaces.id,
      sourceCatalogVersionId: reviewWorkspaces.sourceCatalogVersionId,
      status: reviewWorkspaces.status,
      publishedAt: reviewWorkspaces.publishedAt,
      sourceCatalogVersionStatus: catalogVersions.status,
      sourceCatalogVersionPublishedAt: catalogVersions.publishedAt
    })
    .from(reviewWorkspaces)
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewWorkspaces.sourceCatalogVersionId))
    .where(
      and(
        eq(reviewWorkspaces.sourceCatalogVersionId, sourceCatalogVersionId),
        inArray(reviewWorkspaces.status, ["open", "publishing"])
      )
    )
    .orderBy(desc(reviewWorkspaces.createdAt))
    .limit(1);
  const [workspace] = perf
    ? await perf.observe("workspace_lookup", workspaceTimer, workspaceQuery, (result) => ({ rows: result.length }))
    : await workspaceQuery;

  if (!workspace) {
    return emptyWorkspace(sourceCatalogVersionId);
  }

  const countersTimer = perf?.start();
  const [preparedProductCount, excludedProductCount, actionCount, latestAction] = await Promise.all([
    countWorkspaceItems(workspace.id, "pending"),
    countWorkspaceItems(workspace.id, "excluded"),
    countWorkspaceActions(workspace.id),
    getLatestWorkspaceAction(workspace.id)
  ]);
  perf?.log("workspace_counters", {
    duration_ms: perf.elapsed(countersTimer),
    rows: preparedProductCount + excludedProductCount,
    total: actionCount
  });

  return {
    id: workspace.id,
    sourceCatalogVersionId: workspace.sourceCatalogVersionId,
    sourceCatalogVersionStatus: workspace.sourceCatalogVersionStatus,
    sourceCatalogVersionPublishedAt: workspace.sourceCatalogVersionPublishedAt,
    status: workspace.status,
    preparedProductCount,
    excludedProductCount,
    actionCount,
    lastActionId: latestAction?.id ?? null
  };
}

export async function previewReviewRuleImpact(input: {
  filters: AdminReviewActionFilters;
  categoryId: string;
  subcategoryId: string;
  excludedProductIds?: string[];
}) {
  const versionContext = await getReviewVersionContext();
  const workspace = await getReviewWorkspace(versionContext.activeVersion?.id ?? null);
  const rows = await getActionRows(input.filters, undefined, workspace.id);
  const excluded = new Set(input.excludedProductIds ?? []);
  const impactedRows = rows.filter((row) => !excluded.has(row.productId));
  const target = await validateCategoryTarget(input.categoryId, input.subcategoryId);

  return {
    impactedProductCount: impactedRows.length,
    unchangedProductCount: rows.length - impactedRows.length,
    excludedProductCount: excluded.size,
    categoryName: target.category.name,
    subcategoryName: target.subcategory.name,
    previewToken: buildPreviewToken({
      workspaceId: workspace.id,
      filters: input.filters,
      productIds: impactedRows.map((row) => row.productId),
      excludedProductIds: [...excluded],
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId
    }),
    examples: impactedRows.slice(0, 10).map((row) => `${row.shopCode} · ${row.name}`)
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
  expectedCount?: number | null;
  previewToken?: string | null;
  excludedProductIds?: string[];
  groupApplyPerf?: GroupApplyPerfLogger;
}) {
  if (!input.filters.group) {
    throw new Error("Группа не выбрана.");
  }

  return applyReviewRuleToWorkspace({
    ...input,
    actionType: input.learnRule ? "group_permanent_rule" : "group_temporary",
    allowProductNounSingleWordRule: false
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
  expectedCount?: number | null;
  previewToken?: string | null;
}) {
  const uniqueIds = [...new Set(input.reviewQueueIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Не выбраны товары для обработки.");
  }

  return applyReviewRuleToWorkspace({
    ...input,
    filters: { ...input.filters, group: "" },
    actionType: input.learnRule ? "selected_permanent_rule" : "selected_temporary",
    reviewQueueIds: uniqueIds,
    allowProductNounSingleWordRule: false
  });
}

export async function applyManualReviewCorrection(input: {
  reviewQueueId: string;
  productId: string;
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  learnRule: boolean;
  rulePattern?: string;
  identityDecision?: IdentityReviewDecision | null;
}) {
  return applyReviewRuleToWorkspace({
    filters: {
      scope: "workspace",
      issue: "all",
      query: "",
      reason: "",
      group: ""
    },
    reviewQueueIds: [input.reviewQueueId],
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    adminUserId: input.adminUserId,
    learnRule: input.learnRule,
    rulePattern: input.rulePattern,
    identityDecision: input.identityDecision,
    actionType: input.identityDecision
      ? `manual_identity_${input.identityDecision}`
      : input.learnRule
        ? "manual_permanent_rule"
        : "manual_temporary",
    expectedCount: 1,
    allowProductNounSingleWordRule: false
  });
}

export async function reapplyCategorizationRulesToReviewQueue(input: {
  filters: AdminReviewActionFilters;
  adminUserId: string;
  confirmationCount?: number | null;
}) {
  const rows = await getActionRows(input.filters);
  assertLargeActionConfirmed(rows.length, input.confirmationCount);
  const context = await getCategorizationContext();
  const targetBySlug = await getTargetBySlugFromDb();
  const applicable = rows
    .map((row) => ({
      row,
      suggestion: buildCategorySuggestion(row, context, targetBySlug)
    }))
    .filter(
      ({ row, suggestion }) =>
        !row.identityCandidateId &&
        suggestion.level !== "manual" &&
        suggestion.categoryId &&
        suggestion.subcategoryId
    );

  if (applicable.length === 0) {
    return {
      before: rows.length,
      resolved: 0,
      remaining: rows.length
    };
  }

  const groupedByTarget = new Map<string, typeof applicable>();
  for (const item of applicable) {
    const key = `${item.suggestion.categoryId}:${item.suggestion.subcategoryId}`;
    const current = groupedByTarget.get(key) ?? [];
    current.push(item);
    groupedByTarget.set(key, current);
  }

  let resolved = 0;
  for (const [target, items] of groupedByTarget) {
    const [categoryId, subcategoryId] = target.split(":");
    const result = await applyReviewRuleToWorkspace({
      filters: input.filters,
      reviewQueueIds: items.map((item) => item.row.reviewId),
      categoryId,
      subcategoryId,
      adminUserId: input.adminUserId,
      learnRule: false,
      actionType: "rules_reapply_preview",
      expectedCount: items.length,
      allowProductNounSingleWordRule: false
    });
    resolved += result.processed;
  }

  return {
    before: rows.length,
    resolved,
    remaining: Math.max(0, rows.length - resolved)
  };
}

export async function rollbackReviewAction(input: {
  adminUserId: string;
}) {
  const versionContext = await getReviewVersionContext();
  const workspace = await ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, input.adminUserId);

  const latestAction = await getLatestWorkspaceAction(workspace.id);
  if (!latestAction) {
    throw new Error("В текущей сессии нет действий для отмены.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(reviewWorkspaceActions)
      .set({
        status: "undone",
        undoneAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(reviewWorkspaceActions.id, latestAction.id));

    await tx
      .update(reviewWorkspaceItems)
      .set({
        status: "undone",
        updatedAt: new Date()
      })
      .where(eq(reviewWorkspaceItems.actionId, latestAction.id));

    if (latestAction.ruleId && wasRuleCreatedByReviewAction(latestAction.metadata)) {
      await tx
        .update(categorizationRules)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(categorizationRules.id, latestAction.ruleId));
    }

    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "review.workspace.undo",
      entityType: "review_workspace",
      entityId: workspace.id,
      metadata: {
        actionId: latestAction.id,
        productCount: latestAction.productCount
      }
    });
  });

  return {
    undoneActionId: latestAction.id,
    productCount: latestAction.productCount
  };
}

export async function publishReviewWorkspace(input: { adminUserId: string }) {
  const versionContext = await getReviewVersionContext();
  const workspace = await getOpenWorkspaceRow(versionContext.activeVersion?.id ?? null);
  if (!workspace || !versionContext.activeVersion) {
    throw new AdminReviewBulkSafetyError(
      "empty_workspace",
      "Нет рабочей сессии с подготовленными изменениями."
      );
  }

  await assertNoUnfinishedReviewReapplyApplyRun(workspace.id);

  const pendingRows = await getPendingWorkspaceItems(workspace.id);
  if (pendingRows.length === 0) {
    throw new AdminReviewBulkSafetyError(
      "empty_workspace",
      "Нет подготовленных изменений для публикации."
    );
  }

  const searchSynonyms = await getSearchSynonyms();
  const sourceProducts = await getProductsForVersion(versionContext.activeVersion.id);
  const identityPlan = planReviewSnapshotIdentities(sourceProducts, pendingRows);
  const pendingByProductId = new Map(pendingRows.map((row) => [row.productId, row]));
  const oldToNewProductId = new Map<string, string>();
  const now = new Date();
  const newVersionId = randomUUID();
  const remainingReviewCount = sourceProducts.filter((product) => {
    const pending = pendingByProductId.get(product.id);
    return !pending && isReviewableProductStatus(product.status);
  }).length;

  await db.transaction(async (tx) => {
    const [claimedWorkspace] = await tx
      .update(reviewWorkspaces)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(and(eq(reviewWorkspaces.id, workspace.id), eq(reviewWorkspaces.status, "open")))
      .returning({ id: reviewWorkspaces.id });

    if (!claimedWorkspace) {
      throw new AdminReviewBulkSafetyError(
        "preview_stale",
        "Рабочая сессия уже публикуется или была опубликована."
      );
    }

    await tx.insert(catalogVersions).values({
      id: newVersionId,
      status: "draft",
      sourceFileName: "review-workspace",
      totalRows: sourceProducts.length,
      parsedRows: sourceProducts.length,
      addedCount: 0,
      updatedCount: pendingRows.length,
      archivedCount: 0,
      reviewCount: remainingReviewCount,
      errorCount: 0,
      notes: "Published from admin review workspace",
      createdBy: input.adminUserId
    });

    for (const chunk of chunked([...identityPlan.newProductIdentityIds], 1000)) {
      if (chunk.length > 0) {
        await tx.insert(productIdentities).values(chunk.map((id) => ({ id })));
      }
    }

    for (const chunk of chunked(sourceProducts, 1000)) {
      await tx.insert(products).values(
        chunk.map((product) => {
          const pending = pendingByProductId.get(product.id);
          const id = randomUUID();
          oldToNewProductId.set(product.id, id);
          const categoryName = pending?.categoryName ?? product.categoryName;
          const subcategoryName = pending?.subcategoryName ?? product.subcategoryName;

          return {
            id,
            catalogVersionId: newVersionId,
            productIdentityId: identityPlan.productIdentityIdFor(product.id),
            shopCode: product.shopCode,
            rawName: product.rawName,
            name: product.name,
            slug: product.slug,
            price: product.price,
            stockQuantity: product.stockQuantity,
            stockSum: product.stockSum,
            categoryId: pending?.categoryId ?? product.categoryId,
            subcategoryId: pending?.subcategoryId ?? product.subcategoryId,
            status: pending ? "active" as const : product.status,
            reviewReason: pending ? null : product.reviewReason,
            searchText: pending
              ? buildProductSearchText({
                  shopCode: product.shopCode,
                  name: product.name,
                  rawName: product.rawName,
                  categoryName,
                  subcategoryName,
                  synonyms: searchSynonyms
                })
              : product.searchText,
            createdAt: product.createdAt,
            updatedAt: now
          };
        })
      );
    }

    const unresolvedReviewRows = await tx
      .select({
        reviewId: reviewQueue.id,
        productId: products.id,
        identityCandidateId: reviewQueue.identityCandidateId,
        reason: reviewQueue.reason,
        suggestedCategoryId: reviewQueue.suggestedCategoryId,
        suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId
      })
      .from(reviewQueue)
      .innerJoin(products, eq(products.id, reviewQueue.productId))
      .where(
        and(
          eq(reviewQueue.catalogVersionId, versionContext.activeVersion!.id),
          eq(reviewQueue.status, "open"),
          inArray(products.status, REVIEWABLE_PRODUCT_STATUSES)
        )
      );

    const newReviewValues = unresolvedReviewRows
      .filter((row) => !pendingByProductId.has(row.productId))
      .map((row) => ({
        catalogVersionId: newVersionId,
        productId: oldToNewProductId.get(row.productId)!,
        identityCandidateId: row.identityCandidateId,
        reason: row.reason,
        status: "open" as const,
        suggestedCategoryId: row.suggestedCategoryId,
        suggestedSubcategoryId: row.suggestedSubcategoryId
      }));

    for (const chunk of chunked(newReviewValues, 1000)) {
      if (chunk.length > 0) {
        await tx.insert(reviewQueue).values(chunk);
      }
    }
  });

  let preparedSearchIndex: Awaited<ReturnType<typeof prepareSearchIndexForCatalogVersion>>;
  try {
    preparedSearchIndex = await prepareSearchIndexForCatalogVersion(newVersionId);
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(catalogVersions)
        .set({ status: "rolled_back", updatedAt: new Date() })
        .where(eq(catalogVersions.id, newVersionId));

      await tx
        .update(reviewWorkspaces)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(reviewWorkspaces.id, workspace.id));

      await tx.insert(auditLogs).values({
        adminUserId: input.adminUserId,
        action: "review.workspace.search_index.prepare_failed",
        entityType: "review_workspace",
        entityId: workspace.id,
        metadata: {
          catalogVersionId: newVersionId,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    });

    throw error;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(catalogVersions)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(catalogVersions.status, "active"), ne(catalogVersions.id, newVersionId)));

      await tx
        .update(catalogVersions)
        .set({ status: "active", publishedAt: now, updatedAt: new Date() })
        .where(eq(catalogVersions.id, newVersionId));

      const [publishedWorkspace] = await tx
        .update(reviewWorkspaces)
        .set({
          status: "published",
          publishedCatalogVersionId: newVersionId,
          publishedBy: input.adminUserId,
          publishedAt: now,
          updatedAt: new Date()
        })
        .where(and(eq(reviewWorkspaces.id, workspace.id), eq(reviewWorkspaces.status, "publishing")))
        .returning({ id: reviewWorkspaces.id });

      if (!publishedWorkspace) {
        throw new AdminReviewBulkSafetyError(
          "preview_stale",
          "Рабочая сессия уже была изменена во время публикации."
        );
      }

      await tx
        .update(reviewWorkspaceActions)
        .set({ status: "published", updatedAt: new Date() })
        .where(and(eq(reviewWorkspaceActions.workspaceId, workspace.id), eq(reviewWorkspaceActions.status, "applied")));

      await tx
        .update(reviewWorkspaceItems)
        .set({ status: "published", updatedAt: new Date() })
        .where(and(eq(reviewWorkspaceItems.workspaceId, workspace.id), eq(reviewWorkspaceItems.status, "pending")));

      await tx
        .update(reviewQueue)
        .set({ status: "resolved", resolvedBy: input.adminUserId, resolvedAt: now, updatedAt: now })
        .where(
          inArray(
            reviewQueue.productId,
            pendingRows.map((row) => row.productId)
          )
        );

      await tx.insert(auditLogs).values({
        adminUserId: input.adminUserId,
        action: "review.workspace.publish",
        entityType: "review_workspace",
        entityId: workspace.id,
        metadata: {
          previousActiveVersionId: versionContext.activeVersion!.id,
          newCatalogVersionId: newVersionId,
          productCount: pendingRows.length,
          remainingReviewCount,
          preparedSearchIndex
        }
      });
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(catalogVersions)
        .set({ status: "rolled_back", updatedAt: new Date() })
        .where(eq(catalogVersions.id, newVersionId));

      await tx
        .update(reviewWorkspaces)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(reviewWorkspaces.id, workspace.id));

      await tx.insert(auditLogs).values({
        adminUserId: input.adminUserId,
        action: "review.workspace.publish_db_failed",
        entityType: "review_workspace",
        entityId: workspace.id,
        metadata: {
          catalogVersionId: newVersionId,
          preparedSearchIndex,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    });

    throw error;
  }

  let searchResult: Awaited<ReturnType<typeof activatePreparedCatalogSearchIndex>>;
  try {
    searchResult = await activatePreparedCatalogSearchIndex(preparedSearchIndex);
  } catch (error) {
    await db.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "review.workspace.search_index.swap_failed",
      entityType: "catalog_version",
      entityId: newVersionId,
      metadata: {
        preparedSearchIndex,
        error: error instanceof Error ? error.message : String(error)
      }
    });

    throw error;
  }

  await db.insert(auditLogs).values({
    adminUserId: input.adminUserId,
    action: "review.workspace.search_index.swap",
    entityType: "catalog_version",
    entityId: newVersionId,
    metadata: searchResult
  });

  return {
    previousActiveVersionId: versionContext.activeVersion.id,
    catalogVersionId: newVersionId,
    publishedProductCount: pendingRows.length,
    remainingReviewCount,
    searchIndex: searchResult
  };
}

export async function getReviewWorkspaceChanges(
  workspaceId: string,
  perf?: AdminReviewPerfLogger
): Promise<ReviewWorkspaceChange[]> {
  const changesTimer = perf?.start();
  const changesQuery = db
    .select({
      id: reviewWorkspaceActions.id,
      actionType: reviewWorkspaceActions.actionType,
      status: reviewWorkspaceActions.status,
      productCount: reviewWorkspaceActions.productCount,
      excludedCount: reviewWorkspaceActions.excludedCount,
      categoryName: categories.name,
      subcategoryName: subcategories.name,
      rulePattern: reviewWorkspaceActions.rulePattern,
      createdAt: reviewWorkspaceActions.createdAt,
      adminName: adminUsers.fullName,
      adminEmail: adminUsers.email
    })
    .from(reviewWorkspaceActions)
    .leftJoin(categories, eq(categories.id, reviewWorkspaceActions.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, reviewWorkspaceActions.subcategoryId))
    .leftJoin(adminUsers, eq(adminUsers.id, reviewWorkspaceActions.createdBy))
    .where(eq(reviewWorkspaceActions.workspaceId, workspaceId))
    .orderBy(desc(reviewWorkspaceActions.createdAt))
    .limit(20);

  return perf
    ? perf.observe("workspace_actions", changesTimer, changesQuery, (result) => ({ rows: result.length }))
    : changesQuery;
}

async function applyReviewRuleToWorkspace(input: {
  filters: AdminReviewActionFilters;
  reviewQueueIds?: string[];
  categoryId: string;
  subcategoryId: string;
  adminUserId: string;
  learnRule: boolean;
  rulePattern?: string;
  identityDecision?: IdentityReviewDecision | null;
  confirmationCount?: number | null;
  expectedCount?: number | null;
  previewToken?: string | null;
  excludedProductIds?: string[];
  groupApplyPerf?: GroupApplyPerfLogger;
  actionType: string;
  allowProductNounSingleWordRule: boolean;
}) {
  const perf = input.groupApplyPerf;
  await measureGroupApplyStage(
    perf,
    "validate_category_target",
    { category: "database", sqlOperations: 1 },
    () => validateCategoryTarget(input.categoryId, input.subcategoryId)
  );
  const versionContext = await measureGroupApplyStage(
    perf,
    "load_active_version_context",
    { category: "database", sqlOperations: 2 },
    () => getReviewVersionContext()
  );
  const workspace = await measureGroupApplyStage(
    perf,
    "load_or_create_workspace",
    { category: "database", sqlOperations: 1 },
    () => ensureReviewWorkspace(versionContext.activeVersion?.id ?? null, input.adminUserId)
  );

  if (input.previewToken) {
    const existingAction = await measureGroupApplyStage(
      perf,
      "check_duplicate_submission",
      { category: "database", sqlOperations: 1 },
      () => getWorkspaceActionByPreviewToken(workspace.id, input.previewToken!)
    );
    if (existingAction?.status === "applied") {
      return {
        processed: existingAction.productCount,
        remaining: 0,
        learnedRuleId: existingAction.ruleId,
        learnedRulePattern: existingAction.rulePattern,
        learnedRuleSkippedReason: "duplicate_submit",
        workspaceId: workspace.id
      };
    }

    if (existingAction) {
      throw new AdminReviewBulkSafetyError("preview_stale", REVIEW_PREVIEW_STALE_MESSAGE);
    }
  }

  const rows = await getActionRows(input.filters, input.reviewQueueIds, workspace.id, perf);
  const excluded = new Set(input.excludedProductIds ?? []);
  const excludedRows = rows.filter((row) => excluded.has(row.productId));
  if (excluded.size !== excludedRows.length) {
    throw new AdminReviewBulkSafetyError("preview_stale", REVIEW_PREVIEW_STALE_MESSAGE);
  }
  const impactedRows = rows.filter((row) => !excluded.has(row.productId));
  const identityConflictRows = impactedRows.filter((row) => row.identityCandidateId);
  if (identityConflictRows.length > 0) {
    if (
      identityConflictRows.length !== 1 ||
      impactedRows.length !== 1 ||
      !input.identityDecision ||
      (input.identityDecision === "same" && !identityConflictRows[0].identityCandidateId)
    ) {
      throw new AdminReviewBulkSafetyError(
        "identity_conflict_requires_manual_resolution",
        "Для конфликта постоянной identity выберите: это тот же товар или новая товарная позиция."
      );
    }
  } else if (input.identityDecision) {
    throw new AdminReviewBulkSafetyError(
      "identity_conflict_requires_manual_resolution",
      "Решение по постоянной identity доступно только для identity conflict."
    );
  }
  const identityConflictRow = identityConflictRows[0] ?? null;

  assertLargeActionConfirmed(impactedRows.length, input.confirmationCount);

  if (input.expectedCount !== null && input.expectedCount !== undefined && input.expectedCount !== impactedRows.length) {
    throw new AdminReviewBulkSafetyError("preview_stale", REVIEW_PREVIEW_STALE_MESSAGE);
  }

  const previewToken = buildPreviewToken({
    workspaceId: workspace.id,
    filters: input.filters,
    productIds: impactedRows.map((row) => row.productId),
    excludedProductIds: [...excluded],
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId
  });

  if (input.previewToken) {
    if (previewToken !== input.previewToken) {
      throw new AdminReviewBulkSafetyError("preview_stale", REVIEW_PREVIEW_STALE_MESSAGE);
    }
  } else if (!input.reviewQueueIds) {
    throw new AdminReviewBulkSafetyError("preview_stale", REVIEW_PREVIEW_STALE_MESSAGE);
  }

  if (impactedRows.length === 0) {
    throw new Error("В выбранной очереди нет товаров для применения.");
  }

  let learnedRuleId: string | null = null;
  let learnedRulePattern: string | null = null;
  let learnedRuleCreated = false;
  let learnedRuleSkippedReason: string | null = input.learnRule ? "no_safe_pattern" : "disabled";
  const databaseOperationCount =
    2 +
    Math.ceil(impactedRows.length / 1000) +
    Math.ceil(excludedRows.length / 1000) +
    (input.learnRule ? 2 : input.rulePattern ? 1 : 0);
  const duplicateAction = await measureGroupApplyStage(
    perf,
    "apply_workspace_transaction",
    {
      category: "database",
      itemCount: impactedRows.length,
      sqlOperations: databaseOperationCount
    },
    () => db.transaction(async (tx) => {
    const [action] = await tx
      .insert(reviewWorkspaceActions)
      .values({
        workspaceId: workspace.id,
        actionType: input.actionType,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        productCount: impactedRows.length,
        excludedCount: excluded.size,
        previewToken,
        createdBy: input.adminUserId,
        metadata: {
          filters: input.filters,
          excludedProductIds: [...excluded],
          identityDecision: input.identityDecision ?? null
        }
      })
      .onConflictDoNothing()
      .returning({ id: reviewWorkspaceActions.id });

    if (!action) {
      const existingAction = await getWorkspaceActionByPreviewToken(workspace.id, previewToken, tx);
      if (existingAction?.status === "applied") {
        return {
          productCount: existingAction.productCount,
          ruleId: existingAction.ruleId,
          rulePattern: existingAction.rulePattern
        };
      }

      throw new AdminReviewBulkSafetyError("preview_stale", REVIEW_PREVIEW_STALE_MESSAGE);
    }

    if (input.learnRule) {
      const learnedRule = await learnSafeCategorizationRule({
        tx,
        productName: input.rulePattern || impactedRows[0]?.name || "",
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        adminUserId: input.adminUserId,
        requestedPattern: input.rulePattern,
        allowProductNounSingleWord: input.allowProductNounSingleWordRule
      });

      learnedRuleId = learnedRule.id;
      learnedRulePattern = learnedRule.pattern;
      learnedRuleCreated = learnedRule.created;
      learnedRuleSkippedReason = learnedRule.skippedReason;

      if (learnedRuleSkippedReason) {
        throw new AdminReviewBulkSafetyError(
          "rule_blocked",
          REVIEW_BULK_RULE_BLOCKED_MESSAGE,
          learnedRuleSkippedReason
        );
      }

      await tx
        .update(reviewWorkspaceActions)
        .set({
          ruleId: learnedRuleId,
          rulePattern: learnedRulePattern,
          metadata: {
            filters: input.filters,
            excludedProductIds: [...excluded],
            learnedRuleCreated
          },
          updatedAt: new Date()
        })
        .where(eq(reviewWorkspaceActions.id, action.id));
    } else if (input.rulePattern) {
      await tx
        .update(reviewWorkspaceActions)
        .set({
          rulePattern: input.rulePattern,
          metadata: {
            filters: input.filters,
            excludedProductIds: [...excluded],
            learnedRuleCreated: false
          },
          updatedAt: new Date()
        })
        .where(eq(reviewWorkspaceActions.id, action.id));
    }

    for (const chunk of chunked(impactedRows, 1000)) {
      await tx
        .insert(reviewWorkspaceItems)
        .values(
          chunk.map((row) => ({
            workspaceId: workspace.id,
            actionId: action.id,
            reviewQueueId: row.reviewId,
            productId: row.productId,
            status: "pending" as const,
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
            originalCategoryId: row.currentCategoryId,
            originalSubcategoryId: row.currentSubcategoryId,
            originalStatus: row.productStatus,
            identityDecision:
              row.productId === identityConflictRow?.productId ? input.identityDecision ?? null : null,
            productIdentityId:
              row.productId === identityConflictRow?.productId && input.identityDecision === "same"
                ? row.identityCandidateId
                : null,
            metadata: {
              source: input.actionType,
              group: input.filters.group || null
            }
          }))
        )
        .onConflictDoUpdate({
          target: [reviewWorkspaceItems.workspaceId, reviewWorkspaceItems.productId],
          set: {
            actionId: action.id,
            status: "pending",
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
            identityDecision:
              input.identityDecision && identityConflictRow
                ? input.identityDecision
                : null,
            productIdentityId:
              input.identityDecision === "same" && identityConflictRow
                ? identityConflictRow.identityCandidateId
                : null,
            updatedAt: new Date()
          }
        });
    }

    if (excluded.size > 0) {
      for (const chunk of chunked(excludedRows, 1000)) {
        await tx
          .insert(reviewWorkspaceItems)
          .values(
            chunk.map((row) => ({
              workspaceId: workspace.id,
              actionId: action.id,
              reviewQueueId: row.reviewId,
              productId: row.productId,
              status: "excluded" as const,
              originalCategoryId: row.currentCategoryId,
              originalSubcategoryId: row.currentSubcategoryId,
              originalStatus: row.productStatus,
              metadata: { source: "excluded_from_group" }
            }))
          )
          .onConflictDoUpdate({
            target: [reviewWorkspaceItems.workspaceId, reviewWorkspaceItems.productId],
            set: {
              actionId: action.id,
              status: "excluded",
              updatedAt: new Date()
            }
          });
      }
    }

    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "review.workspace.apply",
      entityType: "review_workspace",
      entityId: workspace.id,
      metadata: {
        actionId: action.id,
        actionType: input.actionType,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        productCount: impactedRows.length,
        excludedCount: excluded.size,
        learnedRuleId,
        learnedRulePattern,
        learnedRuleCreated,
        learnedRuleSkippedReason
      }
    });

      return null;
    })
  );

  if (duplicateAction) {
    return {
      processed: duplicateAction.productCount,
      remaining: 0,
      learnedRuleId: duplicateAction.ruleId,
      learnedRulePattern: duplicateAction.rulePattern,
      learnedRuleSkippedReason: "duplicate_submit",
      workspaceId: workspace.id
    };
  }

  const postCount = await measureGroupApplyStage(
    perf,
    "verify_workspace_post_condition",
    { category: "database", itemCount: impactedRows.length, sqlOperations: 1 },
    () => countWorkspaceItems(workspace.id, "pending")
  );
  if (postCount < impactedRows.length) {
    throw new AdminReviewBulkSafetyError(
      "post_condition_failed",
      "Не удалось подтвердить сохранение всех подготовленных изменений."
    );
  }

  return {
    processed: impactedRows.length,
    remaining: Math.max(0, rows.length - impactedRows.length),
    learnedRuleId,
    learnedRulePattern,
    learnedRuleSkippedReason,
    workspaceId: workspace.id
  };
}

async function getReviewVersionContext(perf?: AdminReviewPerfLogger): Promise<VersionContext> {
  const versionsTimer = perf?.start();
  const versionsQuery = Promise.all([
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
  const [latestDraft, latestActive] = perf
    ? await perf.observe("catalog_versions", versionsTimer, versionsQuery, ([draft, active]) => ({
        rows: draft.length + active.length
      }))
    : await versionsQuery;

  return {
    latestDraft: latestDraft[0] ?? null,
    activeVersion: latestActive[0] ?? null
  };
}

async function getWorkspaceReviewRows(
  versionContext: VersionContext,
  workspaceId: string | null,
  options: {
    limit?: number;
    offset?: number;
    query?: string;
    onlyUnresolved?: boolean;
    excludeReviewQueueIds?: string[];
    perf?: AdminReviewPerfLogger;
    stage?: string;
  } = {}
) {
  if (!versionContext.activeVersion) {
    return [];
  }

  const activeVersionId = versionContext.activeVersion.id;
  const limit = Math.max(1, Math.min(options.limit ?? MAX_ACTION_REVIEW_ROWS, MAX_ACTION_REVIEW_ROWS));
  const offset = Math.max(0, options.offset ?? 0);
  const query = options.query?.trim();
  const excludedReviewQueueIds = [...new Set((options.excludeReviewQueueIds ?? []).filter(Boolean))].slice(0, 100);
  const searchCondition = query
    ? or(
        ilike(products.name, `%${query}%`),
        ilike(products.rawName, `%${query}%`),
        ilike(products.shopCode, `%${query}%`)
      )
    : undefined;
  const rowsTimer = options.perf?.start();
  const rowsQuery = db
    .select({
      reviewId: reviewQueue.id,
      reason: reviewQueue.reason,
      createdAt: reviewQueue.createdAt,
      suggestedCategoryId: reviewQueue.suggestedCategoryId,
      suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId,
      importRowNumber: sql<number | null>`null`,
      productId: products.id,
      identityCandidateId: reviewQueue.identityCandidateId,
      catalogVersionId: reviewQueue.catalogVersionId,
      shopCode: products.shopCode,
      name: products.name,
      rawName: products.rawName,
      price: products.price,
      productStatus: products.status,
      currentCategoryId: products.categoryId,
      currentSubcategoryId: products.subcategoryId,
      catalogVersionStatus: catalogVersions.status,
      catalogVersionCreatedAt: catalogVersions.createdAt,
      workspaceItemStatus: reviewWorkspaceItems.status,
      pendingCategoryId: reviewWorkspaceItems.categoryId,
      pendingSubcategoryId: reviewWorkspaceItems.subcategoryId,
      pendingIdentityDecision: reviewWorkspaceItems.identityDecision
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .leftJoin(
      reviewWorkspaceItems,
      and(
        workspaceId ? eq(reviewWorkspaceItems.workspaceId, workspaceId) : sql`false`,
        eq(reviewWorkspaceItems.productId, products.id),
        inArray(reviewWorkspaceItems.status, ["pending", "excluded"])
      )
    )
    .where(
      and(
        eq(reviewQueue.status, "open"),
        eq(reviewQueue.catalogVersionId, activeVersionId),
        inArray(products.status, REVIEWABLE_PRODUCT_STATUSES),
        searchCondition,
        options.onlyUnresolved ? sql`${reviewWorkspaceItems.id} is null` : undefined,
        excludedReviewQueueIds.length > 0 ? notInArray(reviewQueue.id, excludedReviewQueueIds) : undefined
      )
    )
    .orderBy(asc(reviewQueue.createdAt))
    .limit(limit)
    .offset(offset) as Promise<ReviewRow[]>;

  return options.perf
    ? options.perf.observe(options.stage ?? "review_rows_sql", rowsTimer, rowsQuery, (result) => ({ rows: result.length }))
    : rowsQuery;
}

async function getSimilarReviewGroupForPrimary(input: {
  item: EnrichedReviewRow;
  versionContext: VersionContext;
  workspaceId: string | null;
  categorizationContext: CategorizationContext;
  targetBySlug: Map<string, CategorizationTarget>;
  excludeReviewQueueIds?: string[];
  perf?: AdminReviewPerfLogger;
  classificationStats?: ClassificationStats;
}): Promise<AdminReviewSimilarGroup | null> {
  const pattern = input.item.suggestion.rulePattern?.trim();
  if (!pattern || input.item.suggestion.level === "manual" || !input.item.safeToApply) {
    return null;
  }

  const candidateRows = await getWorkspaceReviewRows(input.versionContext, input.workspaceId, {
    limit: REVIEW_SIMILAR_GROUP_LIMIT,
    query: pattern,
    onlyUnresolved: true,
    excludeReviewQueueIds: input.excludeReviewQueueIds,
    perf: input.perf,
    stage: "primary_similar_group_rows_sql"
  });
  const enrichedRows = input.perf
    ? input.perf.measureSync(
        "primary_similar_group_enrichment",
        () => candidateRows.map((row) => enrichReviewRow(row, input.categorizationContext, input.targetBySlug, input.classificationStats)),
        (result) => ({ rows: result.length })
      )
    : candidateRows.map((row) => enrichReviewRow(row, input.categorizationContext, input.targetBySlug));
  const reviewQueueIds = enrichedRows
    .filter((row) => row.safeToApply && sameTarget(row.suggestion, input.item.suggestion))
    .map((row) => row.reviewId);

  return reviewQueueIds.length > 1
    ? { reviewQueueIds, count: reviewQueueIds.length }
    : null;
}

async function getReviewListCount(
  versionContext: VersionContext,
  query: string,
  perf?: AdminReviewPerfLogger
) {
  if (!versionContext.activeVersion) return 0;

  const normalizedQuery = query.trim();
  const searchCondition = normalizedQuery
    ? or(
        ilike(products.name, `%${normalizedQuery}%`),
        ilike(products.rawName, `%${normalizedQuery}%`),
        ilike(products.shopCode, `%${normalizedQuery}%`)
      )
    : undefined;
  const timer = perf?.start();
  const countQuery = db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .where(
      and(
        eq(reviewQueue.status, "open"),
        eq(reviewQueue.catalogVersionId, versionContext.activeVersion.id),
        inArray(products.status, REVIEWABLE_PRODUCT_STATUSES),
        searchCondition
      )
    );
  const [result] = perf
    ? await perf.observe("list_review_count", timer, countQuery, (rows) => ({ total: Number(rows[0]?.total ?? 0) }))
    : await countQuery;
  return Number(result?.total ?? 0);
}

async function getReviewQueueStats(
  versionContext: VersionContext,
  workspaceId: string | null,
  perf?: AdminReviewPerfLogger
): Promise<ReviewQueueStats> {
  if (!versionContext.activeVersion) {
    return {
      total: 0,
      missingCategory: 0,
      missingSubcategory: 0,
      missingName: 0
    };
  }

  const activeVersionId = versionContext.activeVersion.id;
  const statsTimer = perf?.start();
  const statsQuery = db
    .select({
      total: sql<number>`count(*)::int`,
      missingCategory: sql<number>`count(*) filter (where ${products.categoryId} is null)::int`,
      missingSubcategory: sql<number>`count(*) filter (where ${products.subcategoryId} is null)::int`,
      missingName: sql<number>`count(*) filter (
        where btrim(${products.name}) = ''
          or btrim(${products.name}) = btrim(${products.shopCode})
          or btrim(${products.rawName}) = btrim(${products.shopCode})
      )::int`
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .leftJoin(
      reviewWorkspaceItems,
      and(
        workspaceId ? eq(reviewWorkspaceItems.workspaceId, workspaceId) : sql`false`,
        eq(reviewWorkspaceItems.productId, products.id),
        inArray(reviewWorkspaceItems.status, ["pending", "excluded"])
      )
    )
    .where(
      and(
        eq(reviewQueue.status, "open"),
        eq(reviewQueue.catalogVersionId, activeVersionId),
        inArray(products.status, REVIEWABLE_PRODUCT_STATUSES),
        sql`${reviewWorkspaceItems.id} is null`
      )
    );
  const [row] = perf
    ? await perf.observe("review_queue_stats", statsTimer, statsQuery, (result) => ({
        rows: result.length,
        total: Number(result[0]?.total ?? 0)
      }))
    : await statsQuery;

  return {
    total: Number(row?.total ?? 0),
    missingCategory: Number(row?.missingCategory ?? 0),
    missingSubcategory: Number(row?.missingSubcategory ?? 0),
    missingName: Number(row?.missingName ?? 0)
  };
}

async function getActionRows(
  filters: AdminReviewActionFilters,
  reviewQueueIds?: string[],
  workspaceIdOverride?: string | null,
  groupApplyPerf?: GroupApplyPerfLogger
) {
  const [versionContext, categorizationContext, targetBySlug] = await Promise.all([
    measureGroupApplyStage(
      groupApplyPerf,
      "load_action_version_context",
      { category: "database", sqlOperations: 2 },
      () => getReviewVersionContext()
    ),
    measureGroupApplyStage(
      groupApplyPerf,
      "load_categorization_context",
      { category: "database", sqlOperations: 2 },
      () => getCategorizationContext()
    ),
    measureGroupApplyStage(
      groupApplyPerf,
      "load_taxonomy_targets",
      { category: "database", sqlOperations: 2 },
      () => getTargetBySlugFromDb()
    )
  ]);
  const workspace = workspaceIdOverride === undefined
    ? await measureGroupApplyStage(
        groupApplyPerf,
        "load_action_workspace",
        { category: "database", sqlOperations: 1 },
        () => getReviewWorkspace(versionContext.activeVersion?.id ?? null)
      )
    : { id: workspaceIdOverride };
  const rows = reviewQueueIds
    ? await measureGroupApplyStage(
        groupApplyPerf,
        "load_selected_review_items",
        { category: "database", sqlOperations: 1, itemCount: reviewQueueIds.length },
        () => getRowsByReviewIds(reviewQueueIds, workspace.id, versionContext.activeVersion?.id ?? null)
      )
    : await measureGroupApplyStage(
        groupApplyPerf,
        "load_group_review_items",
        { category: "database", sqlOperations: 1 },
        () => getWorkspaceReviewRows(versionContext, workspace.id)
      );
  const params: AdminReviewParams = {
    ...filters,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  };
  return measureGroupApplyStage(
    groupApplyPerf,
    "classify_and_filter_group_items",
    { category: "other", itemCount: rows.length },
    () => {
      let filteredRows = filterReviewRows(
        rows.map((row) => enrichReviewRow(row, categorizationContext, targetBySlug)),
        params
      ).filter((row) => row.workspaceItemStatus !== "pending" && row.workspaceItemStatus !== "excluded");

      if (!reviewQueueIds && filters.group) {
        const bestSuggestion = chooseGroupSuggestion(filteredRows);
        filteredRows = filteredRows.filter(
          (row) => row.safeToApply && sameTarget(row.suggestion, bestSuggestion)
        );
      }

      return filteredRows;
    }
  );
}

async function measureGroupApplyStage<T>(
  perf: GroupApplyPerfLogger | undefined,
  name: string,
  options: {
    category: GroupApplyPerfCategory;
    itemCount?: number;
    sqlOperations?: number;
  },
  operation: () => T | Promise<T>
) {
  return perf ? perf.measure(name, options, operation) : operation();
}

async function getRowsByReviewIds(
  reviewQueueIds: string[],
  workspaceId: string | null,
  activeVersionId: string | null
) {
  if (reviewQueueIds.length === 0 || !activeVersionId) return [];

  return db
    .select({
      reviewId: reviewQueue.id,
      reason: reviewQueue.reason,
      createdAt: reviewQueue.createdAt,
      suggestedCategoryId: reviewQueue.suggestedCategoryId,
      suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId,
      importRowNumber: sql<number | null>`null`,
      productId: products.id,
      identityCandidateId: reviewQueue.identityCandidateId,
      catalogVersionId: reviewQueue.catalogVersionId,
      shopCode: products.shopCode,
      name: products.name,
      rawName: products.rawName,
      price: products.price,
      productStatus: products.status,
      currentCategoryId: products.categoryId,
      currentSubcategoryId: products.subcategoryId,
      catalogVersionStatus: catalogVersions.status,
      catalogVersionCreatedAt: catalogVersions.createdAt,
      workspaceItemStatus: reviewWorkspaceItems.status,
      pendingCategoryId: reviewWorkspaceItems.categoryId,
      pendingSubcategoryId: reviewWorkspaceItems.subcategoryId,
      pendingIdentityDecision: reviewWorkspaceItems.identityDecision
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, reviewQueue.catalogVersionId))
    .leftJoin(
      reviewWorkspaceItems,
      and(
        workspaceId ? eq(reviewWorkspaceItems.workspaceId, workspaceId) : sql`false`,
        eq(reviewWorkspaceItems.productId, products.id),
        inArray(reviewWorkspaceItems.status, ["pending", "excluded"])
      )
    )
    .where(
      and(
        eq(reviewQueue.status, "open"),
        eq(reviewQueue.catalogVersionId, activeVersionId),
        inArray(products.status, REVIEWABLE_PRODUCT_STATUSES),
        inArray(reviewQueue.id, reviewQueueIds)
      )
    ) as Promise<ReviewRow[]>;
}

function enrichReviewRow(
  row: ReviewRow,
  context: CategorizationContext,
  targetBySlug: Map<string, CategorizationTarget>,
  classificationStats?: ClassificationStats
): EnrichedReviewRow {
  const classificationStartedAt = classificationStats ? performance.now() : 0;
  const suggestion = buildCategorySuggestion(row, context, targetBySlug);
  if (classificationStats) {
    const durationMs = Math.max(0, performance.now() - classificationStartedAt);
    classificationStats.calls += 1;
    classificationStats.totalDurationMs += durationMs;
    classificationStats.maxDurationMs = Math.max(classificationStats.maxDurationMs, durationMs);
  }
  const groupKey = buildGroupKey(row, suggestion);
  const groupLabel = buildGroupLabel(groupKey, row, suggestion);

  return {
    ...row,
    suggestion,
    groupKey,
    groupLabel,
    safeToApply:
      !row.identityCandidateId &&
      suggestion.level !== "manual" &&
      Boolean(suggestion.categoryId && suggestion.subcategoryId) &&
      suggestion.conflictingSignals.length === 0
  };
}

export function buildCategorySuggestion(
  row: Pick<ReviewRow, "shopCode" | "name" | "rawName" | "suggestedCategoryId" | "suggestedSubcategoryId">,
  context: CategorizationContext,
  targetBySlug: Map<string, CategorizationTarget>
): ReviewSuggestion {
  const normalized = normalizeReviewText(`${row.shopCode} ${row.name || row.rawName}`);
  const contextRule = CONTEXT_RULES.find((rule) =>
    rule.includeAll.every((token) => normalized.tokens.includes(token))
  );

  if (contextRule) {
    const target = targetBySlug.get(`${contextRule.categorySlug}/${contextRule.subcategorySlug}`);
    if (target?.categoryId && target.subcategoryId) {
      return {
        level: "ready",
        confidence: 0.96,
        categoryId: target.categoryId,
        subcategoryId: target.subcategoryId,
        categoryName: target.categoryName ?? null,
        subcategoryName: target.subcategoryName ?? null,
        explanation: contextRule.explanation,
        matchedSignals: contextRule.includeAll,
        conflictingSignals: [],
        rulePattern: contextRule.includeAll.join(" ")
      };
    }
  }

  const result = categorizeProductName(`${row.shopCode} ${row.name || row.rawName}`, context);
  const target = result.target;
  if (!target?.categoryId || !target.subcategoryId) {
    return manualSuggestion(result.reason, result.matchedSignals.map((signal) => signal.value));
  }

  const hasBroadSingleSignal =
    result.matchedSignals.filter((signal) => signal.kind === "token").length === 1 &&
    result.matchedSignals.some((signal) => COMMON_RISK_WORDS.has(signal.value));
  const conflictingSignals = findConflictingSignals(normalized.tokens, target.categorySlug, target.subcategorySlug);
  const confidence = Math.max(0, result.confidence - conflictingSignals.length * 0.08 - (hasBroadSingleSignal ? 0.12 : 0));
  const level = confidence >= READY_CONFIDENCE_THRESHOLD && conflictingSignals.length === 0
    ? "ready"
    : confidence >= QUICK_CONFIDENCE_THRESHOLD
      ? "quick"
      : "manual";

  if (level === "manual") {
    return {
      level,
      confidence,
      categoryId: target.categoryId,
      subcategoryId: target.subcategoryId,
      categoryName: target.categoryName ?? null,
      subcategoryName: target.subcategoryName ?? null,
      explanation: conflictingSignals.length > 0
        ? "Есть конфликтующие признаки, товар лучше проверить вручную."
        : result.reason,
      matchedSignals: result.matchedSignals.map((signal) => signal.value),
      conflictingSignals,
      rulePattern: null
    };
  }

  return {
    level,
    confidence,
    categoryId: target.categoryId,
    subcategoryId: target.subcategoryId,
    categoryName: target.categoryName ?? null,
    subcategoryName: target.subcategoryName ?? null,
    explanation: result.reason,
    matchedSignals: result.matchedSignals.map((signal) => signal.value),
    conflictingSignals,
    rulePattern: suggestRulePatternForProduct(row.name || row.rawName)
  };
}

function buildReviewGroups(
  rows: EnrichedReviewRow[],
  categoryRows: Awaited<ReturnType<typeof getActiveCategories>>,
  subcategoryRows: Awaited<ReturnType<typeof getActiveSubcategories>>,
  workspaceId: string | null,
  filters: AdminReviewActionFilters
): AdminReviewGroup[] {
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategoryRows.map((subcategory) => [subcategory.id, subcategory]));
  const groups = new Map<string, EnrichedReviewRow[]>();

  for (const row of rows.filter((item) => item.workspaceItemStatus !== "pending" && item.workspaceItemStatus !== "excluded")) {
    const current = groups.get(row.groupKey) ?? [];
    current.push(row);
    groups.set(row.groupKey, current);
  }

  return [...groups.entries()]
    .map(([key, groupRows]) => {
      const bestSuggestion = chooseGroupSuggestion(groupRows);
      const safeRows = groupRows.filter((row) => row.safeToApply && sameTarget(row.suggestion, bestSuggestion));
      const conflictingRows = groupRows.filter(
        (row) => row.suggestion.conflictingSignals.length > 0 || !sameTarget(row.suggestion, bestSuggestion)
      );
      const level: ReviewSuggestionLevel =
        bestSuggestion.level === "ready" && conflictingRows.length === 0
          ? "ready"
          : bestSuggestion.level === "manual"
            ? "manual"
            : "quick";
      const examples = groupRows.slice(0, 8).map((row) => `${row.shopCode} · ${row.name}`);
      const category = bestSuggestion.categoryId ? categoryById.get(bestSuggestion.categoryId) : null;
      const subcategory = bestSuggestion.subcategoryId ? subcategoryById.get(bestSuggestion.subcategoryId) : null;
      const rulePattern = bestSuggestion.rulePattern ?? safeRulePatternFromGroup(key);
      const ruleValidation = rulePattern ? validateRulePattern(rulePattern) : { ok: false as const };

      return {
        key,
        label: groupRows[0]?.groupLabel ?? key,
        count: groupRows.length,
        examples,
        level,
        confidence: bestSuggestion.confidence,
        confidenceLabel: confidenceLabel(bestSuggestion.confidence),
        suggestedCategoryId: bestSuggestion.categoryId,
        suggestedSubcategoryId: bestSuggestion.subcategoryId,
        suggestedCategoryName: category?.name ?? bestSuggestion.categoryName,
        suggestedSubcategoryName: subcategory?.name ?? bestSuggestion.subcategoryName,
        explanation: bestSuggestion.explanation,
        matchedSignals: bestSuggestion.matchedSignals,
        conflictingSignals: [...new Set(groupRows.flatMap((row) => row.suggestion.conflictingSignals))],
        impactedProductCount: safeRows.length,
        excludedCount: groupRows.filter((row) => row.workspaceItemStatus === "excluded").length,
        conflictingCount: conflictingRows.length,
        preparedCount: groupRows.filter((row) => row.workspaceItemStatus === "pending").length,
        manualOnlyCount: groupRows.filter((row) => row.suggestion.level === "manual").length,
        rulePattern,
        ruleWarning:
          rulePattern && !ruleValidation.ok
            ? "Правило слишком общее. Добавьте уточняющее слово, например узел или модель автомобиля."
            : null,
        previewToken: buildPreviewToken(
          {
            workspaceId,
            filters: { ...filters, group: key },
            productIds: safeRows.map((row) => row.productId),
            excludedProductIds: [],
            categoryId: bestSuggestion.categoryId,
            subcategoryId: bestSuggestion.subcategoryId
          }
        ),
        sampleProducts: groupRows.slice(0, 10).map((row) => ({
          reviewId: row.reviewId,
          productId: row.productId,
          shopCode: row.shopCode,
          name: row.name,
          reason: row.reason,
          safeToApply: row.safeToApply && sameTarget(row.suggestion, bestSuggestion)
        }))
      };
    })
    .sort((a, b) => levelWeight(a.level) - levelWeight(b.level) || b.impactedProductCount - a.impactedProductCount)
    .slice(0, 80);
}

function buildReviewQueueSummary(
  rows: EnrichedReviewRow[],
  groups: AdminReviewGroup[],
  workspace: ReviewWorkspaceSummary,
  versionContext: VersionContext,
  stats?: ReviewQueueStats
): AdminReviewSummary {
  return {
    total: stats?.total ?? rows.filter((row) => row.workspaceItemStatus !== "pending" && row.workspaceItemStatus !== "excluded").length,
    readyGroups: groups.filter((group) => group.level === "ready").length,
    readyProducts: groups.filter((group) => group.level === "ready").reduce((sum, group) => sum + group.impactedProductCount, 0),
    quickGroups: groups.filter((group) => group.level === "quick").length,
    quickProducts: groups.filter((group) => group.level === "quick").reduce((sum, group) => sum + group.impactedProductCount, 0),
    manualProducts: rows.filter((row) => row.suggestion.level === "manual").length,
    preparedProducts: workspace.preparedProductCount,
    excludedProducts: workspace.excludedProductCount,
    willPublishProducts: workspace.preparedProductCount,
    missingCategory: stats?.missingCategory ?? rows.filter((row) => !row.currentCategoryId).length,
    missingSubcategory: stats?.missingSubcategory ?? rows.filter((row) => !row.currentSubcategoryId).length,
    missingName: stats?.missingName ?? rows.filter((row) => isMissingName(row)).length,
    conflictingProducts: rows.filter((row) => row.suggestion.conflictingSignals.length > 0).length,
    activeOpen: versionContext.activeVersion ? stats?.total ?? rows.length : 0,
    latestDraftOpen: 0
  };
}

function filterReviewRows(rows: EnrichedReviewRow[], params: AdminReviewParams) {
  const query = normalizeReviewText(params.query).normalized;
  return rows.filter((row) => {
    if (params.issue !== "prepared" && params.issue !== "excluded") {
      if (row.workspaceItemStatus === "pending" || row.workspaceItemStatus === "excluded") return false;
    }
    if (params.issue === "ready" && row.suggestion.level !== "ready") return false;
    if (params.issue === "quick" && row.suggestion.level !== "quick") return false;
    if (params.issue === "manual" && row.suggestion.level !== "manual") return false;
    if (params.issue === "prepared" && row.workspaceItemStatus !== "pending") return false;
    if (params.issue === "excluded" && row.workspaceItemStatus !== "excluded") return false;
    if (params.issue === "missing_category" && row.currentCategoryId) return false;
    if (params.issue === "missing_subcategory" && row.currentSubcategoryId) return false;
    if (params.issue === "missing_name" && !isMissingName(row)) return false;
    if (params.issue === "conflicting" && row.suggestion.conflictingSignals.length === 0) return false;
    if (params.reason && row.reason !== params.reason) return false;
    if (params.group && row.groupKey !== params.group) return false;
    if (query) {
      const haystack = normalizeReviewText(`${row.shopCode} ${row.name} ${row.rawName} ${row.groupLabel} ${row.suggestion.categoryName ?? ""} ${row.suggestion.subcategoryName ?? ""}`).normalized;
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function canUseDirectReviewPageRows(params: AdminReviewParams) {
  return (
    params.issue === "all" &&
    !params.query &&
    !params.reason &&
    !params.group
  );
}

function mapReviewItem(
  row: EnrichedReviewRow,
  categoryById: Map<string, { name: string }>,
  subcategoryById: Map<string, { name: string }>
): AdminReviewItem {
  return {
    reviewId: row.reviewId,
    productId: row.productId,
    identityConflict: Boolean(row.identityCandidateId),
    pendingIdentityDecision: row.pendingIdentityDecision,
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
    currentCategoryName: row.currentCategoryId ? categoryById.get(row.currentCategoryId)?.name ?? null : null,
    currentSubcategoryName: row.currentSubcategoryId ? subcategoryById.get(row.currentSubcategoryId)?.name ?? null : null,
    suggestedCategoryId: row.suggestion.categoryId,
    suggestedSubcategoryId: row.suggestion.subcategoryId,
    suggestedCategoryName: row.suggestion.categoryName,
    suggestedSubcategoryName: row.suggestion.subcategoryName,
    confidence: row.suggestion.confidence,
    confidenceLabel: confidenceLabel(row.suggestion.confidence),
    suggestionLevel: row.suggestion.level,
    explanation: row.suggestion.explanation,
    matchedSignals: row.suggestion.matchedSignals,
    conflictingSignals: row.suggestion.conflictingSignals,
    groupKey: row.groupKey,
    groupLabel: row.groupLabel,
    workspaceStatus:
      row.workspaceItemStatus === "pending"
        ? "prepared"
        : row.workspaceItemStatus === "excluded"
          ? "excluded"
          : "open",
    pendingCategoryName: row.pendingCategoryId ? categoryById.get(row.pendingCategoryId)?.name ?? null : null,
    pendingSubcategoryName: row.pendingSubcategoryId
      ? subcategoryById.get(row.pendingSubcategoryId)?.name ?? null
      : null,
    rulePattern: row.suggestion.rulePattern
  };
}

function buildCategoryOptions(
  categoryRows: Awaited<ReturnType<typeof getActiveCategories>>,
  subcategoryRows: Awaited<ReturnType<typeof getActiveSubcategories>>
): AdminReviewCategoryOption[] {
  return categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    subcategories: subcategoryRows
      .filter((subcategory) => subcategory.categoryId === category.id)
      .map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        slug: subcategory.slug
      }))
  }));
}

function getActiveCategories(perf?: AdminReviewPerfLogger) {
  const categoriesTimer = perf?.start();
  const categoriesQuery = db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      sortOrder: categories.sortOrder
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return perf
    ? perf.observe("categories", categoriesTimer, categoriesQuery, (result) => ({ rows: result.length }))
    : categoriesQuery;
}

function getActiveSubcategories(perf?: AdminReviewPerfLogger) {
  const subcategoriesTimer = perf?.start();
  const subcategoriesQuery = db
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

  return perf
    ? perf.observe("subcategories", subcategoriesTimer, subcategoriesQuery, (result) => ({ rows: result.length }))
    : subcategoriesQuery;
}

function buildTargetBySlug(
  categoryRows: Awaited<ReturnType<typeof getActiveCategories>>,
  subcategoryRows: Awaited<ReturnType<typeof getActiveSubcategories>>
) {
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const targets = new Map<string, CategorizationTarget>();
  for (const subcategory of subcategoryRows) {
    const category = categoryById.get(subcategory.categoryId);
    if (!category || !isPublicTaxonomyTarget(category.slug, subcategory.slug)) {
      continue;
    }
    targets.set(`${category.slug}/${subcategory.slug}`, {
      categoryId: category.id,
      categorySlug: category.slug,
      categoryName: category.name,
      subcategoryId: subcategory.id,
      subcategorySlug: subcategory.slug,
      subcategoryName: subcategory.name
    });
  }
  return targets;
}

async function getTargetBySlugFromDb() {
  const [categoryRows, subcategoryRows] = await Promise.all([getActiveCategories(), getActiveSubcategories()]);
  return buildTargetBySlug(categoryRows, subcategoryRows);
}

async function validateCategoryTarget(categoryId: string, subcategoryId: string) {
  const [row] = await db
    .select({
      category: categories,
      subcategory: subcategories
    })
    .from(subcategories)
    .innerJoin(categories, eq(categories.id, subcategories.categoryId))
    .where(
      and(
        eq(categories.id, categoryId),
        eq(subcategories.id, subcategoryId),
        eq(categories.isActive, true),
        eq(subcategories.isActive, true)
      )
    )
    .limit(1);

  if (
    !row ||
    !isPublicTaxonomyTarget(row.category.slug, row.subcategory.slug)
  ) {
    throw new AdminReviewBulkSafetyError(
      "invalid_target",
      "Категория или подкатегория не найдена в согласованной структуре каталога."
    );
  }

  return row;
}

async function ensureReviewWorkspace(sourceCatalogVersionId: string | null, adminUserId: string) {
  if (!sourceCatalogVersionId) {
    throw new Error("Нет активной версии каталога для рабочей сессии.");
  }

  const existing = await getOpenWorkspaceRow(sourceCatalogVersionId);
  if (existing) {
    return existing;
  }

  const [workspace] = await db
    .insert(reviewWorkspaces)
    .values({
      sourceCatalogVersionId,
      createdBy: adminUserId,
      metadata: {
        createdFrom: "active_needs_review"
      }
    })
    .onConflictDoNothing()
    .returning({ id: reviewWorkspaces.id });

  if (!workspace) {
    const existingAfterConflict = await getOpenWorkspaceRow(sourceCatalogVersionId);
    if (existingAfterConflict) {
      return existingAfterConflict;
    }

    throw new Error("Не удалось создать рабочую сессию проверки.");
  }

  await db.insert(auditLogs).values({
    adminUserId,
    action: "review.workspace.create",
    entityType: "review_workspace",
    entityId: workspace.id,
    metadata: { sourceCatalogVersionId }
  });

  return workspace;
}

async function getOpenWorkspaceRow(sourceCatalogVersionId: string | null) {
  if (!sourceCatalogVersionId) {
    return null;
  }

  const [workspace] = await db
    .select({ id: reviewWorkspaces.id })
    .from(reviewWorkspaces)
    .where(
      and(
        eq(reviewWorkspaces.sourceCatalogVersionId, sourceCatalogVersionId),
        inArray(reviewWorkspaces.status, ["open", "publishing"])
      )
    )
    .orderBy(desc(reviewWorkspaces.createdAt))
    .limit(1);

  return workspace ?? null;
}

async function countWorkspaceItems(workspaceId: string, status: "pending" | "excluded") {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewWorkspaceItems)
    .where(and(eq(reviewWorkspaceItems.workspaceId, workspaceId), eq(reviewWorkspaceItems.status, status)));
  return Number(row?.count ?? 0);
}

async function countWorkspaceActions(workspaceId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewWorkspaceActions)
    .where(and(eq(reviewWorkspaceActions.workspaceId, workspaceId), eq(reviewWorkspaceActions.status, "applied")));
  return Number(row?.count ?? 0);
}

async function getLatestWorkspaceAction(workspaceId: string) {
  const [action] = await db
    .select({
      id: reviewWorkspaceActions.id,
      productCount: reviewWorkspaceActions.productCount,
      ruleId: reviewWorkspaceActions.ruleId,
      metadata: reviewWorkspaceActions.metadata
    })
    .from(reviewWorkspaceActions)
    .where(and(eq(reviewWorkspaceActions.workspaceId, workspaceId), eq(reviewWorkspaceActions.status, "applied")))
    .orderBy(desc(reviewWorkspaceActions.createdAt))
    .limit(1);
  return action ?? null;
}

async function getWorkspaceActionByPreviewToken(
  workspaceId: string,
  previewToken: string,
  client: ReviewDbClient = db
) {
  const [action] = await client
    .select({
      id: reviewWorkspaceActions.id,
      status: reviewWorkspaceActions.status,
      productCount: reviewWorkspaceActions.productCount,
      ruleId: reviewWorkspaceActions.ruleId,
      rulePattern: reviewWorkspaceActions.rulePattern
    })
    .from(reviewWorkspaceActions)
    .where(
      and(
        eq(reviewWorkspaceActions.workspaceId, workspaceId),
        eq(reviewWorkspaceActions.previewToken, previewToken)
      )
    )
    .limit(1);

  return action ?? null;
}

async function getPendingWorkspaceItems(workspaceId: string) {
  return db
    .select({
      productId: reviewWorkspaceItems.productId,
      identityDecision: reviewWorkspaceItems.identityDecision,
      productIdentityId: reviewWorkspaceItems.productIdentityId,
      categoryId: reviewWorkspaceItems.categoryId,
      subcategoryId: reviewWorkspaceItems.subcategoryId,
      categoryName: categories.name,
      subcategoryName: subcategories.name
    })
    .from(reviewWorkspaceItems)
    .innerJoin(categories, eq(categories.id, reviewWorkspaceItems.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, reviewWorkspaceItems.subcategoryId))
    .where(and(eq(reviewWorkspaceItems.workspaceId, workspaceId), eq(reviewWorkspaceItems.status, "pending")));
}

export function planReviewSnapshotIdentities(
  sourceProducts: ReviewSnapshotIdentitySource[],
  pendingRows: PendingReviewIdentityDecision[],
  createIdentityId: () => string = randomUUID
): ReviewSnapshotIdentityPlan {
  const pendingByProductId = new Map(pendingRows.map((row) => [row.productId, row]));
  const identitiesByProductId = new Map<string, string>();
  const newProductIdentityIds: string[] = [];

  for (const product of sourceProducts) {
    if (product.productIdentityId) {
      identitiesByProductId.set(product.id, product.productIdentityId);
      continue;
    }

    const pending = pendingByProductId.get(product.id);
    if (!pending) {
      if (product.status === "active") {
        throw new Error("Нельзя опубликовать active товар без постоянной identity.");
      }
      continue;
    }

    if (pending.identityDecision === "same" && pending.productIdentityId) {
      identitiesByProductId.set(product.id, pending.productIdentityId);
      continue;
    }

    if (pending.identityDecision === "new") {
      const productIdentityId = createIdentityId();
      identitiesByProductId.set(product.id, productIdentityId);
      newProductIdentityIds.push(productIdentityId);
      continue;
    }

    throw new Error("Identity conflict не разрешён в рабочей сессии.");
  }

  return {
    productIdentityIdFor(productId) {
      return identitiesByProductId.get(productId) ?? null;
    },
    newProductIdentityIds
  };
}

async function getProductsForVersion(catalogVersionId: string) {
  return db
    .select({
      id: products.id,
      productIdentityId: products.productIdentityId,
      shopCode: products.shopCode,
      rawName: products.rawName,
      name: products.name,
      slug: products.slug,
      price: products.price,
      stockQuantity: products.stockQuantity,
      stockSum: products.stockSum,
      categoryId: products.categoryId,
      subcategoryId: products.subcategoryId,
      categoryName: categories.name,
      subcategoryName: subcategories.name,
      status: products.status,
      reviewReason: products.reviewReason,
      searchText: products.searchText,
      createdAt: products.createdAt
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(eq(products.catalogVersionId, catalogVersionId))
    .orderBy(asc(products.shopCode));
}

function emptyWorkspace(sourceCatalogVersionId: string | null): ReviewWorkspaceSummary {
  return {
    id: null,
    sourceCatalogVersionId,
    sourceCatalogVersionStatus: sourceCatalogVersionId ? "active" : null,
    sourceCatalogVersionPublishedAt: null,
    status: "logical",
    preparedProductCount: 0,
    excludedProductCount: 0,
    actionCount: 0,
    lastActionId: null
  };
}

async function assertNoUnfinishedReviewReapplyApplyRun(workspaceId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewReapplyRuns)
    .where(
      and(
        eq(reviewReapplyRuns.workspaceId, workspaceId),
        eq(reviewReapplyRuns.mode, "apply"),
        inArray(reviewReapplyRuns.status, ["pending", "running", "paused"])
      )
    );

  if (Number(row?.count ?? 0) > 0) {
    throw new AdminReviewBulkSafetyError(
      "preview_stale",
      "Нельзя публиковать workspace, пока apply run повторной обработки не завершён или не отменён."
    );
  }
}

function chooseGroupSuggestion(rows: EnrichedReviewRow[]) {
  const grouped = new Map<string, { suggestion: ReviewSuggestion; count: number }>();
  for (const row of rows) {
    if (!row.suggestion.categoryId || !row.suggestion.subcategoryId) continue;
    const key = `${row.suggestion.categoryId}:${row.suggestion.subcategoryId}`;
    const current = grouped.get(key) ?? { suggestion: row.suggestion, count: 0 };
    current.count += 1;
    if (row.suggestion.confidence > current.suggestion.confidence) {
      current.suggestion = row.suggestion;
    }
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.count - a.count || b.suggestion.confidence - a.suggestion.confidence)[0]?.suggestion ??
    manualSuggestion("Недостаточно данных для безопасной категории.", []);
}

function buildGroupKey(row: ReviewRow, suggestion: ReviewSuggestion) {
  if (suggestion.rulePattern) return normalizeReviewText(suggestion.rulePattern).normalized;
  const normalized = normalizeReviewText(`${row.name} ${row.rawName}`);
  const context = CONTEXT_RULES.find((rule) => rule.includeAll.every((token) => normalized.tokens.includes(token)));
  if (context) return context.includeAll.join(" ");

  const ngrams = buildNgrams(normalized.tokens.filter((token) => !STOP_WORDS.has(token)), 3)
    .concat(buildNgrams(normalized.tokens.filter((token) => !STOP_WORDS.has(token)), 2));
  return ngrams.find((ngram) => !isUnsafeBroadPattern(ngram)) ?? normalized.tokens.find((token) => !STOP_WORDS.has(token)) ?? "manual";
}

function buildGroupLabel(key: string, row: ReviewRow, suggestion: ReviewSuggestion) {
  if (suggestion.rulePattern && suggestion.categoryName) {
    return capitalizeWords(suggestion.rulePattern);
  }

  const context = CONTEXT_RULES.find((rule) => rule.includeAll.join(" ") === key);
  if (context) return context.label;

  return capitalizeWords(key || row.name);
}

function normalizeReviewText(value: string) {
  const normalized = normalizeForCategorization(value)
    .replace(/\bрем\s*\.?\s*к\s*[- ]?\s*т\b/g, "ремкомплект")
    .replace(/\bрем\s+комплект\b/g, "ремкомплект")
    .replace(/\bсуппорта\b/g, "суппорт")
    .replace(/\bсуппортов\b/g, "суппорт")
    .replace(/\bколенвала\b/g, "коленвал")
    .replace(/\bполуоси\b/g, "полуось")
    .replace(/\bступицы\b/g, "ступица")
    .replace(/\bтормоза\b/g, "тормоз")
    .replace(/\s+/g, " ")
    .trim();

  return {
    normalized,
    tokens: normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !/^\d+$/.test(token))
  };
}

function findConflictingSignals(tokens: string[], categorySlug?: string, subcategorySlug?: string) {
  const conflicts: string[] = [];
  const has = (token: string) => tokens.includes(token);
  if (categorySlug === "tormoznaya-sistema" && (has("кардан") || has("гбц") || has("коленвал") || has("полуось"))) {
    conflicts.push("Есть признаки двигателя или трансмиссии.");
  }
  if (categorySlug === "dvigatel-i-transmissiya" && (has("суппорт") || has("тормоз"))) {
    conflicts.push("Есть признаки тормозной системы.");
  }
  if (subcategorySlug === "datchiki" && !has("датчик")) {
    conflicts.push("Нет явного слова «датчик».");
  }
  return conflicts;
}

function manualSuggestion(reason: string, signals: string[]): ReviewSuggestion {
  return {
    level: "manual",
    confidence: 0,
    categoryId: null,
    subcategoryId: null,
    categoryName: null,
    subcategoryName: null,
    explanation: reason,
    matchedSignals: signals,
    conflictingSignals: [],
    rulePattern: null
  };
}

function contextRule(
  label: string,
  includeAll: string[],
  categorySlug: string,
  subcategorySlug: string,
  explanation = "Найдена точная контекстная фраза: общее слово дополнено узлом автомобиля."
) {
  return { label, includeAll, categorySlug, subcategorySlug, explanation };
}

function confidenceLabel(confidence: number) {
  if (confidence >= READY_CONFIDENCE_THRESHOLD) return "Высокая";
  if (confidence >= QUICK_CONFIDENCE_THRESHOLD) return "Средняя";
  return "Низкая";
}

function levelWeight(level: ReviewSuggestionLevel) {
  if (level === "ready") return 0;
  if (level === "quick") return 1;
  return 2;
}

function sameTarget(a: ReviewSuggestion, b: ReviewSuggestion) {
  return Boolean(
    a.categoryId &&
      a.subcategoryId &&
      a.categoryId === b.categoryId &&
      a.subcategoryId === b.subcategoryId
  );
}

function wasRuleCreatedByReviewAction(metadata: unknown) {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "learnedRuleCreated" in metadata &&
    (metadata as { learnedRuleCreated?: unknown }).learnedRuleCreated === true
  );
}

function safeRulePatternFromGroup(key: string) {
  if (!key || isUnsafeBroadPattern(key)) return null;
  return key;
}

function isUnsafeBroadPattern(pattern: string) {
  const tokens = normalizeReviewText(pattern).tokens;
  return tokens.length < 2 && tokens.some((token) => COMMON_RISK_WORDS.has(token));
}

function buildNgrams(tokens: string[], size: number) {
  const values: string[] = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    values.push(tokens.slice(index, index + size).join(" "));
  }
  return values;
}

function buildPreviewToken(input: {
  workspaceId: string | null;
  filters: AdminReviewActionFilters;
  productIds: string[];
  excludedProductIds: string[];
  categoryId: string | null;
  subcategoryId: string | null;
}) {
  const payload = {
    version: 2,
    workspaceId: input.workspaceId ?? "no-workspace",
    filters: {
      scope: input.filters.scope,
      issue: input.filters.issue,
      query: input.filters.query,
      reason: input.filters.reason,
      group: input.filters.group
    },
    productIds: [...input.productIds].sort(),
    excludedProductIds: [...input.excludedProductIds].sort(),
    count: input.productIds.length,
    categoryId: input.categoryId ?? "",
    subcategoryId: input.subcategoryId ?? ""
  };

  return createHmac("sha256", getAdminSessionSecret())
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 48);
}

function buildReasonOptions(rows: EnrichedReviewRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([reason, count]) => ({ reason, count }));
}

function isMissingName(row: Pick<ReviewRow, "name" | "rawName" | "shopCode">) {
  return (
    !row.name.trim() ||
    row.name.trim() === row.shopCode.trim() ||
    row.rawName.trim() === row.shopCode.trim()
  );
}

function capitalizeWords(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function assertLargeActionConfirmed(count: number, confirmationCount?: number | null) {
  if (count > LARGE_ACTION_CONFIRMATION_THRESHOLD && confirmationCount !== count) {
    throw new AdminReviewBulkSafetyError(
      "count_confirmation_required",
      REVIEW_BULK_COUNT_CONFIRMATION_MESSAGE
    );
  }
}

function readEnum<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const raw = readSingle(value);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function getReviewDiagnosticFromRows(rows: Array<Pick<EnrichedReviewRow, "suggestion" | "workspaceItemStatus" | "currentCategoryId" | "currentSubcategoryId" | "name" | "rawName" | "shopCode">>) {
  return {
    reviewProductCount: rows.length,
    preparedProductCount: rows.filter((row) => row.workspaceItemStatus === "pending").length,
    excludedProductCount: rows.filter((row) => row.workspaceItemStatus === "excluded").length,
    missingCategoryCount: rows.filter((row) => !row.currentCategoryId).length,
    missingSubcategoryCount: rows.filter((row) => !row.currentSubcategoryId).length,
    emptyNameCount: rows.filter((row) => isMissingName(row)).length,
    conflictingSignalCount: rows.filter((row) => row.suggestion.conflictingSignals.length > 0).length,
    highConfidenceCount: rows.filter((row) => row.suggestion.level === "ready").length,
    mediumConfidenceCount: rows.filter((row) => row.suggestion.level === "quick").length,
    manualOnlyProductCount: rows.filter((row) => row.suggestion.level === "manual").length
  };
}

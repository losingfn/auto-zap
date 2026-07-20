import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  catalogVersions,
  categories,
  products,
  reviewQueue,
  reviewReapplyGroups,
  reviewReapplyRunItems,
  reviewReapplyRuns,
  reviewWorkspaceActions,
  reviewWorkspaceItems,
  reviewWorkspaces,
  subcategories
} from "@/db/schema";
import {
  buildCategorySuggestion,
  type AdminReviewActionFilters
} from "@/features/admin/review";
import { categorizeProductName } from "@/features/categorization/engine";
import { CATEGORIZATION_PIPELINE_VERSION } from "@/features/categorization/pipeline";
import { getCategorizationContext } from "@/features/categorization/repository";
import type {
  CategorizationContext,
  CategorizationDecisionStatus,
  CategorizationResult,
  CategorizationTarget
} from "@/features/categorization/types";

const REVIEWABLE_PRODUCT_STATUSES = ["needs_review", "invalid"] as const;
const DEFAULT_REAPPLY_BATCH_SIZE = 100;
const MAX_REAPPLY_BATCH_SIZE = 500;
const RUN_LOCK_TTL_MS = 2 * 60 * 1000;
const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

export const REVIEW_REAPPLY_DEFAULT_FILTERS: AdminReviewActionFilters = {
  scope: "workspace",
  issue: "all",
  query: "",
  reason: "",
  group: ""
};

type ReviewReapplyRunMode = "dry_run" | "apply";
type ReviewReapplyRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";
type ReviewReapplyRunItemStatus =
  | "pending"
  | "processed"
  | "prepared"
  | "already_pending"
  | "skipped"
  | "error";

type ActiveCatalogVersion = {
  id: string;
  publishedAt: Date | null;
};

type ReviewReapplyRunRow = {
  id: string;
  mode: ReviewReapplyRunMode;
  status: ReviewReapplyRunStatus;
  workspaceId: string;
  sourceCatalogVersionId: string | null;
  dryRunId: string | null;
  pipelineVersion: string;
  scopeFingerprint: string;
  filters: unknown;
  totalRows: number;
  processedRows: number;
  preparedRows: number;
  skippedRows: number;
  manualRows: number;
  blockedRows: number;
  doNotPublishRows: number;
  groupReviewRows: number;
  autoReadyRows: number;
  errorRows: number;
  alreadyPendingRows: number;
  currentCursorCreatedAt: Date | null;
  currentCursorReviewId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastHeartbeatAt: Date | null;
  lockedBy: string | null;
  lockExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  errorSummary: unknown;
  metadata: unknown;
};

type ReviewReapplyPanelRun = Pick<
  ReviewReapplyRunRow,
  | "id"
  | "mode"
  | "status"
  | "pipelineVersion"
  | "totalRows"
  | "processedRows"
  | "preparedRows"
  | "skippedRows"
  | "manualRows"
  | "blockedRows"
  | "doNotPublishRows"
  | "groupReviewRows"
  | "autoReadyRows"
  | "errorRows"
  | "alreadyPendingRows"
  | "startedAt"
  | "finishedAt"
  | "lastHeartbeatAt"
  | "createdAt"
  | "dryRunId"
> & {
  isStale: boolean;
};

export type ReviewReapplyPanelData = {
  pipelineVersion: string;
  openReviewRows: number;
  latestDryRun: ReviewReapplyPanelRun | null;
  latestApplyRun: ReviewReapplyPanelRun | null;
  activeRun: ReviewReapplyPanelRun | null;
  groups: Array<{
    id: string;
    runId: string;
    decisionStatus: string;
    groupKey: string;
    productCount: number;
    categoryName: string | null;
    subcategoryName: string | null;
    reasonSummary: string | null;
  }>;
};

type ReviewBatchRow = {
  reviewId: string;
  reviewCreatedAt: Date;
  reason: string;
  suggestedCategoryId: string | null;
  suggestedSubcategoryId: string | null;
  productId: string;
  shopCode: string;
  name: string;
  rawName: string;
  productStatus: string;
  currentCategoryId: string | null;
  currentSubcategoryId: string | null;
  workspaceItemId: string | null;
  workspaceItemStatus: string | null;
};

type DryRunItemRow = {
  id: string;
  reviewQueueId: string;
  reviewQueueCreatedAt: Date;
  productId: string;
  status: string;
  decisionStatus: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  confidence: string | null;
  reason: string | null;
  reviewReasonCode: string | null;
  groupKey: string | null;
  pipelineVersion: string;
  resultFingerprint: string | null;
  metadata: unknown;
  reviewStatus: string;
  productStatus: string;
  currentCategoryId: string | null;
  currentSubcategoryId: string | null;
  workspaceItemId: string | null;
  workspaceItemStatus: string | null;
};

type BatchCounters = {
  processedRows: number;
  preparedRows: number;
  skippedRows: number;
  manualRows: number;
  blockedRows: number;
  doNotPublishRows: number;
  groupReviewRows: number;
  autoReadyRows: number;
  errorRows: number;
  alreadyPendingRows: number;
};

type EvaluatedReviewRow = {
  reviewQueueId: string;
  reviewQueueCreatedAt: Date;
  productId: string;
  status: ReviewReapplyRunItemStatus;
  decisionStatus: CategorizationDecisionStatus | "INVALID_INPUT";
  categoryId: string | null;
  subcategoryId: string | null;
  confidence: number | null;
  reason: string;
  reviewReasonCode: string | null;
  groupKey: string | null;
  resultFingerprint: string;
  metadata: Record<string, unknown>;
};

type ApplyBatchDecision = {
  sourceItem: DryRunItemRow;
  status: ReviewReapplyRunItemStatus;
  categoryId: string | null;
  subcategoryId: string | null;
  workspaceActionId?: string | null;
  workspaceItemId?: string | null;
};

export async function createReviewReapplyDryRun(input: {
  adminUserId: string;
  filters?: AdminReviewActionFilters;
}) {
  const filters = normalizeReviewReapplyFilters(input.filters);
  const activeVersion = await getActiveCatalogVersion();
  if (!activeVersion) {
    throw new Error("Нет активной версии каталога для повторной обработки.");
  }

  const workspace = await ensureReviewReapplyWorkspace(activeVersion.id, input.adminUserId);
  const totalRows = await countOpenReviewRows(activeVersion.id);
  const scopeFingerprint = buildScopeFingerprint({
    sourceCatalogVersionId: activeVersion.id,
    filters
  });

  const [run] = await db
    .insert(reviewReapplyRuns)
    .values({
      mode: "dry_run",
      status: "pending",
      workspaceId: workspace.id,
      sourceCatalogVersionId: activeVersion.id,
      pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
      scopeFingerprint,
      filters,
      totalRows,
      createdBy: input.adminUserId,
      metadata: {
        createdFrom: "admin_review_reapply",
        processor: "cli_required"
      }
    })
    .returning({ id: reviewReapplyRuns.id });

  await db.insert(auditLogs).values({
    adminUserId: input.adminUserId,
    action: "review.reapply.dry_run.create",
    entityType: "review_reapply_run",
    entityId: run.id,
    metadata: {
      workspaceId: workspace.id,
      sourceCatalogVersionId: activeVersion.id,
      pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
      totalRows,
      filters
    }
  });

  return getReviewReapplyRun(run.id);
}

export async function createReviewReapplyApplyRun(input: {
  dryRunId: string;
  adminUserId: string;
}) {
  const dryRun = await getReviewReapplyRun(input.dryRunId);
  if (!dryRun || dryRun.mode !== "dry_run") {
    throw new Error("Dry-run не найден.");
  }
  if (dryRun.status !== "completed") {
    throw new Error("Apply разрешён только после успешного dry-run без ошибок.");
  }
  if (dryRun.pipelineVersion !== CATEGORIZATION_PIPELINE_VERSION) {
    throw new Error("Pipeline version изменилась. Запустите новый dry-run.");
  }

  const activeVersion = await getActiveCatalogVersion();
  if (!activeVersion || activeVersion.id !== dryRun.sourceCatalogVersionId) {
    throw new Error("Активная версия каталога изменилась. Запустите новый dry-run.");
  }

  const scopeFingerprint = buildScopeFingerprint({
    sourceCatalogVersionId: activeVersion.id,
    filters: parseRunFilters(dryRun.filters)
  });
  if (scopeFingerprint !== dryRun.scopeFingerprint) {
    throw new Error("Scope dry-run изменился. Запустите новый dry-run.");
  }

  const [run] = await db
    .insert(reviewReapplyRuns)
    .values({
      mode: "apply",
      status: "pending",
      workspaceId: dryRun.workspaceId,
      sourceCatalogVersionId: dryRun.sourceCatalogVersionId,
      dryRunId: dryRun.id,
      pipelineVersion: dryRun.pipelineVersion,
      scopeFingerprint: dryRun.scopeFingerprint,
      filters: dryRun.filters,
      totalRows: dryRun.totalRows,
      createdBy: input.adminUserId,
      metadata: {
        createdFromDryRunId: dryRun.id,
        processor: "cli_required"
      }
    })
    .returning({ id: reviewReapplyRuns.id });

  await db.insert(auditLogs).values({
    adminUserId: input.adminUserId,
    action: "review.reapply.apply.create",
    entityType: "review_reapply_run",
    entityId: run.id,
    metadata: {
      dryRunId: dryRun.id,
      workspaceId: dryRun.workspaceId,
      sourceCatalogVersionId: dryRun.sourceCatalogVersionId,
      pipelineVersion: dryRun.pipelineVersion
    }
  });

  return getReviewReapplyRun(run.id);
}

export async function processReviewReapplyRun(input: {
  runId: string;
  batchSize?: number;
  maxBatches?: number;
}) {
  const batchSize = normalizeBatchSize(input.batchSize);
  const processorId = `cli:${process.pid}:${randomUUID()}`;
  await claimRunLock(input.runId, processorId);

  const batchDurationsMs: number[] = [];
  let processedBatches = 0;

  try {
    while (input.maxBatches === undefined || processedBatches < input.maxBatches) {
      const run = await getReviewReapplyRun(input.runId);
      if (!run) {
        throw new Error("Run не найден.");
      }
      if (run.status === "cancelled" || run.status === "paused") {
        return buildProcessResult(run, processedBatches, batchDurationsMs);
      }
      if (run.status === "completed" || run.status === "completed_with_errors" || run.status === "failed") {
        return buildProcessResult(run, processedBatches, batchDurationsMs);
      }

      await markRunRunning(run.id, processorId);
      const startedAt = Date.now();
      const result = run.mode === "dry_run"
        ? await processDryRunBatch(run, batchSize)
        : await processApplyBatch(run, batchSize);
      batchDurationsMs.push(Date.now() - startedAt);

      if (result.processedRows === 0) {
        const finished = await finishReviewReapplyRun(run.id);
        return buildProcessResult(finished, processedBatches, batchDurationsMs);
      }

      processedBatches += 1;
    }

    const current = await getReviewReapplyRun(input.runId);
    return buildProcessResult(current, processedBatches, batchDurationsMs);
  } catch (error) {
    await markRunFailed(input.runId, error);
    throw error;
  } finally {
    await releaseRunLock(input.runId, processorId);
  }
}

export async function pauseReviewReapplyRun(runId: string) {
  await db
    .update(reviewReapplyRuns)
    .set({
      status: "paused",
      lockExpiresAt: null,
      lockedBy: null,
      updatedAt: new Date()
    })
    .where(and(eq(reviewReapplyRuns.id, runId), inArray(reviewReapplyRuns.status, ["pending", "running"])));
  return getReviewReapplyRun(runId);
}

export async function resumeReviewReapplyRun(runId: string) {
  await db
    .update(reviewReapplyRuns)
    .set({
      status: "pending",
      lockExpiresAt: null,
      lockedBy: null,
      updatedAt: new Date()
    })
    .where(eq(reviewReapplyRuns.id, runId));
  return getReviewReapplyRun(runId);
}

export async function cancelReviewReapplyRun(runId: string) {
  await db
    .update(reviewReapplyRuns)
    .set({
      status: "cancelled",
      finishedAt: new Date(),
      lockExpiresAt: null,
      lockedBy: null,
      updatedAt: new Date()
    })
    .where(and(eq(reviewReapplyRuns.id, runId), inArray(reviewReapplyRuns.status, ["pending", "running", "paused"])));
  return getReviewReapplyRun(runId);
}

export async function rollbackReviewReapplyApplyRun(input: {
  runId: string;
  adminUserId: string;
}) {
  const run = await getReviewReapplyRun(input.runId);
  if (!run || run.mode !== "apply") {
    throw new Error("Apply run не найден.");
  }

  const result = await db.transaction(async (tx) => {
    const undoneItems = await tx
      .update(reviewWorkspaceItems)
      .set({ status: "undone", updatedAt: new Date() })
      .where(
        and(
          eq(reviewWorkspaceItems.workspaceId, run.workspaceId),
          eq(reviewWorkspaceItems.status, "pending"),
          sql`${reviewWorkspaceItems.metadata}->>'reviewReapplyRunId' = ${run.id}`
        )
      )
      .returning({ id: reviewWorkspaceItems.id });

    const undoneActions = await tx
      .update(reviewWorkspaceActions)
      .set({ status: "undone", undoneAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(reviewWorkspaceActions.workspaceId, run.workspaceId),
          eq(reviewWorkspaceActions.status, "applied"),
          sql`${reviewWorkspaceActions.metadata}->>'reviewReapplyRunId' = ${run.id}`
        )
      )
      .returning({ id: reviewWorkspaceActions.id });

    await tx
      .update(reviewReapplyRuns)
      .set({
        metadata: sql`${reviewReapplyRuns.metadata} || ${JSON.stringify({
          rolledBackAt: new Date().toISOString(),
          rolledBackBy: input.adminUserId,
          undoneItemCount: undoneItems.length,
          undoneActionCount: undoneActions.length
        })}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(reviewReapplyRuns.id, run.id));

    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "review.reapply.apply.rollback",
      entityType: "review_reapply_run",
      entityId: run.id,
      metadata: {
        workspaceId: run.workspaceId,
        undoneItemCount: undoneItems.length,
        undoneActionCount: undoneActions.length
      }
    });

    return {
      undoneItemCount: undoneItems.length,
      undoneActionCount: undoneActions.length
    };
  });

  return result;
}

export async function getReviewReapplyRun(runId: string | null | undefined) {
  if (!runId) return null;
  const [run] = await db
    .select({
      id: reviewReapplyRuns.id,
      mode: reviewReapplyRuns.mode,
      status: reviewReapplyRuns.status,
      workspaceId: reviewReapplyRuns.workspaceId,
      sourceCatalogVersionId: reviewReapplyRuns.sourceCatalogVersionId,
      dryRunId: reviewReapplyRuns.dryRunId,
      pipelineVersion: reviewReapplyRuns.pipelineVersion,
      scopeFingerprint: reviewReapplyRuns.scopeFingerprint,
      filters: reviewReapplyRuns.filters,
      totalRows: reviewReapplyRuns.totalRows,
      processedRows: reviewReapplyRuns.processedRows,
      preparedRows: reviewReapplyRuns.preparedRows,
      skippedRows: reviewReapplyRuns.skippedRows,
      manualRows: reviewReapplyRuns.manualRows,
      blockedRows: reviewReapplyRuns.blockedRows,
      doNotPublishRows: reviewReapplyRuns.doNotPublishRows,
      groupReviewRows: reviewReapplyRuns.groupReviewRows,
      autoReadyRows: reviewReapplyRuns.autoReadyRows,
      errorRows: reviewReapplyRuns.errorRows,
      alreadyPendingRows: reviewReapplyRuns.alreadyPendingRows,
      currentCursorCreatedAt: reviewReapplyRuns.currentCursorCreatedAt,
      currentCursorReviewId: reviewReapplyRuns.currentCursorReviewId,
      startedAt: reviewReapplyRuns.startedAt,
      finishedAt: reviewReapplyRuns.finishedAt,
      lastHeartbeatAt: reviewReapplyRuns.lastHeartbeatAt,
      lockedBy: reviewReapplyRuns.lockedBy,
      lockExpiresAt: reviewReapplyRuns.lockExpiresAt,
      createdAt: reviewReapplyRuns.createdAt,
      updatedAt: reviewReapplyRuns.updatedAt,
      createdBy: reviewReapplyRuns.createdBy,
      errorSummary: reviewReapplyRuns.errorSummary,
      metadata: reviewReapplyRuns.metadata
    })
    .from(reviewReapplyRuns)
    .where(eq(reviewReapplyRuns.id, runId))
    .limit(1);

  return (run ?? null) as ReviewReapplyRunRow | null;
}

export async function getReviewReapplyPanelData(input: {
  workspaceId: string | null;
  sourceCatalogVersionId: string | null;
}): Promise<ReviewReapplyPanelData> {
  const openReviewRows = input.sourceCatalogVersionId
    ? await countOpenReviewRows(input.sourceCatalogVersionId)
    : 0;

  if (!input.workspaceId) {
    return {
      pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
      openReviewRows,
      latestDryRun: null,
      latestApplyRun: null,
      activeRun: null,
      groups: []
    };
  }

  const runs = await db
    .select({
      id: reviewReapplyRuns.id,
      mode: reviewReapplyRuns.mode,
      status: reviewReapplyRuns.status,
      workspaceId: reviewReapplyRuns.workspaceId,
      sourceCatalogVersionId: reviewReapplyRuns.sourceCatalogVersionId,
      dryRunId: reviewReapplyRuns.dryRunId,
      pipelineVersion: reviewReapplyRuns.pipelineVersion,
      scopeFingerprint: reviewReapplyRuns.scopeFingerprint,
      filters: reviewReapplyRuns.filters,
      totalRows: reviewReapplyRuns.totalRows,
      processedRows: reviewReapplyRuns.processedRows,
      preparedRows: reviewReapplyRuns.preparedRows,
      skippedRows: reviewReapplyRuns.skippedRows,
      manualRows: reviewReapplyRuns.manualRows,
      blockedRows: reviewReapplyRuns.blockedRows,
      doNotPublishRows: reviewReapplyRuns.doNotPublishRows,
      groupReviewRows: reviewReapplyRuns.groupReviewRows,
      autoReadyRows: reviewReapplyRuns.autoReadyRows,
      errorRows: reviewReapplyRuns.errorRows,
      alreadyPendingRows: reviewReapplyRuns.alreadyPendingRows,
      currentCursorCreatedAt: reviewReapplyRuns.currentCursorCreatedAt,
      currentCursorReviewId: reviewReapplyRuns.currentCursorReviewId,
      startedAt: reviewReapplyRuns.startedAt,
      finishedAt: reviewReapplyRuns.finishedAt,
      lastHeartbeatAt: reviewReapplyRuns.lastHeartbeatAt,
      lockedBy: reviewReapplyRuns.lockedBy,
      lockExpiresAt: reviewReapplyRuns.lockExpiresAt,
      createdAt: reviewReapplyRuns.createdAt,
      updatedAt: reviewReapplyRuns.updatedAt,
      createdBy: reviewReapplyRuns.createdBy,
      errorSummary: reviewReapplyRuns.errorSummary,
      metadata: reviewReapplyRuns.metadata
    })
    .from(reviewReapplyRuns)
    .where(eq(reviewReapplyRuns.workspaceId, input.workspaceId))
    .orderBy(desc(reviewReapplyRuns.createdAt))
    .limit(10);

  const latestDryRun = runs.find((run) => run.mode === "dry_run") ?? null;
  const latestApplyRun = runs.find((run) => run.mode === "apply") ?? null;
  const activeRun = runs.find((run) => isActiveRunStatus(run.status)) ?? null;
  const groupSourceRun = latestDryRun ?? latestApplyRun;
  const groups = groupSourceRun
    ? await getReviewReapplyGroups(groupSourceRun.id)
    : [];

  return {
    pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
    openReviewRows,
    latestDryRun: toPanelRun(latestDryRun),
    latestApplyRun: toPanelRun(latestApplyRun),
    activeRun: toPanelRun(activeRun),
    groups
  };
}

export function isReviewReapplyRunStale(run: Pick<ReviewReapplyRunRow, "status" | "lastHeartbeatAt">) {
  return Boolean(
    run.status === "running" &&
      run.lastHeartbeatAt &&
      Date.now() - run.lastHeartbeatAt.getTime() > STALE_HEARTBEAT_MS
  );
}

export function classifyReviewReapplyDecision(input: {
  decisionStatus: CategorizationDecisionStatus | "INVALID_INPUT";
  categoryId: string | null;
  subcategoryId: string | null;
  workspaceItemStatus?: string | null;
}) {
  if (input.workspaceItemStatus === "pending" || input.workspaceItemStatus === "excluded") {
    return "already_pending" as const;
  }

  if (
    input.decisionStatus === "AUTO_READY" &&
    input.categoryId &&
    input.subcategoryId
  ) {
    return "prepared" as const;
  }

  if (input.decisionStatus === "INVALID_INPUT") {
    return "error" as const;
  }

  return "skipped" as const;
}

async function processDryRunBatch(run: ReviewReapplyRunRow, batchSize: number) {
  const [context, rows] = await Promise.all([
    getCategorizationContext(),
    getReviewRowsAfterCursor(run, batchSize)
  ]);

  if (rows.length === 0) {
    return emptyBatchCounters();
  }

  const items: EvaluatedReviewRow[] = [];
  const groups = new Map<string, {
    decisionStatus: string;
    groupKey: string;
    categoryId: string | null;
    subcategoryId: string | null;
    productCount: number;
    confidenceMin: number | null;
    confidenceMax: number | null;
    sample: Array<{ reviewQueueId: string; productId: string; name: string; shopCode: string }>;
    reasonSummary: string | null;
  }>();
  const counters = emptyBatchCounters();

  for (const row of rows) {
    try {
      const evaluated = evaluateReviewReapplyRow(row, context);
      items.push(evaluated);
      accumulateCounters(counters, evaluated.status, evaluated.decisionStatus);
      if (evaluated.groupKey) {
        const key = `${evaluated.decisionStatus}:${evaluated.groupKey}`;
        const current = groups.get(key) ?? {
          decisionStatus: evaluated.decisionStatus,
          groupKey: evaluated.groupKey,
          categoryId: evaluated.categoryId,
          subcategoryId: evaluated.subcategoryId,
          productCount: 0,
          confidenceMin: evaluated.confidence,
          confidenceMax: evaluated.confidence,
          sample: [],
          reasonSummary: evaluated.reason
        };
        current.productCount += 1;
        current.confidenceMin = minNullable(current.confidenceMin, evaluated.confidence);
        current.confidenceMax = maxNullable(current.confidenceMax, evaluated.confidence);
        if (current.sample.length < 5) {
          current.sample.push({
            reviewQueueId: row.reviewId,
            productId: row.productId,
            shopCode: row.shopCode,
            name: row.name || row.rawName
          });
        }
        groups.set(key, current);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: EvaluatedReviewRow = {
        reviewQueueId: row.reviewId,
        reviewQueueCreatedAt: row.reviewCreatedAt,
        productId: row.productId,
        status: "error",
        decisionStatus: "INVALID_INPUT",
        categoryId: null,
        subcategoryId: null,
        confidence: null,
        reason: message,
        reviewReasonCode: "row_processing_error",
        groupKey: null,
        resultFingerprint: fingerprint({ error: message, reviewQueueId: row.reviewId }),
        metadata: {
          error: message
        }
      };
      items.push(failed);
      accumulateCounters(counters, failed.status, failed.decisionStatus);
    }
  }

  const cursor = rows[rows.length - 1]!;

  await db.transaction(async (tx) => {
    await tx
      .insert(reviewReapplyRunItems)
      .values(items.map((item) => ({
        runId: run.id,
        workspaceId: run.workspaceId,
        reviewQueueId: item.reviewQueueId,
        reviewQueueCreatedAt: item.reviewQueueCreatedAt,
        productId: item.productId,
        status: item.status,
        decisionStatus: item.decisionStatus,
        categoryId: item.categoryId,
        subcategoryId: item.subcategoryId,
        confidence: item.confidence === null ? null : item.confidence.toFixed(4),
        reason: item.reason,
        reviewReasonCode: item.reviewReasonCode,
        groupKey: item.groupKey,
        pipelineVersion: CATEGORIZATION_PIPELINE_VERSION,
        resultFingerprint: item.resultFingerprint,
        errorCode: item.status === "error" ? item.reviewReasonCode : null,
        errorMessage: item.status === "error" ? item.reason : null,
        metadata: item.metadata,
        processedAt: new Date()
      })))
      .onConflictDoUpdate({
        target: [reviewReapplyRunItems.runId, reviewReapplyRunItems.reviewQueueId],
        set: {
          status: sql`excluded.status`,
          decisionStatus: sql`excluded.decision_status`,
          categoryId: sql`excluded.category_id`,
          subcategoryId: sql`excluded.subcategory_id`,
          confidence: sql`excluded.confidence`,
          reason: sql`excluded.reason`,
          reviewReasonCode: sql`excluded.review_reason_code`,
          groupKey: sql`excluded.group_key`,
          resultFingerprint: sql`excluded.result_fingerprint`,
          errorCode: sql`excluded.error_code`,
          errorMessage: sql`excluded.error_message`,
          metadata: sql`excluded.metadata`,
          processedAt: sql`excluded.processed_at`,
          updatedAt: new Date()
        }
      });

    if (groups.size > 0) {
      await tx
        .insert(reviewReapplyGroups)
        .values([...groups.values()].map((group) => ({
          runId: run.id,
          workspaceId: run.workspaceId,
          decisionStatus: group.decisionStatus,
          groupKey: group.groupKey,
          categoryId: group.categoryId,
          subcategoryId: group.subcategoryId,
          productCount: group.productCount,
          confidenceMin: group.confidenceMin === null ? null : group.confidenceMin.toFixed(4),
          confidenceMax: group.confidenceMax === null ? null : group.confidenceMax.toFixed(4),
          sample: group.sample,
          reasonSummary: group.reasonSummary
        })))
        .onConflictDoUpdate({
          target: [
            reviewReapplyGroups.runId,
            reviewReapplyGroups.decisionStatus,
            reviewReapplyGroups.groupKey
          ],
          set: {
            productCount: sql`${reviewReapplyGroups.productCount} + excluded.product_count`,
            confidenceMin: sql`least(coalesce(${reviewReapplyGroups.confidenceMin}, excluded.confidence_min), coalesce(excluded.confidence_min, ${reviewReapplyGroups.confidenceMin}))`,
            confidenceMax: sql`greatest(coalesce(${reviewReapplyGroups.confidenceMax}, excluded.confidence_max), coalesce(excluded.confidence_max, ${reviewReapplyGroups.confidenceMax}))`,
            updatedAt: new Date()
          }
        });
    }

    await incrementRunCounters(tx, run.id, counters, cursor.reviewCreatedAt, cursor.reviewId);
  });

  return counters;
}

async function processApplyBatch(run: ReviewReapplyRunRow, batchSize: number) {
  if (!run.dryRunId) {
    throw new Error("Apply run не связан с dry-run.");
  }

  const dryRun = await getReviewReapplyRun(run.dryRunId);
  if (!dryRun || dryRun.pipelineVersion !== CATEGORIZATION_PIPELINE_VERSION) {
    throw new Error("Dry-run устарел относительно текущего pipeline.");
  }
  if (run.pipelineVersion !== dryRun.pipelineVersion || run.scopeFingerprint !== dryRun.scopeFingerprint) {
    throw new Error("Apply run не совпадает со snapshot dry-run.");
  }

  const sourceItems = await getDryRunItemsAfterCursor(run, batchSize);
  if (sourceItems.length === 0) {
    return emptyBatchCounters();
  }

  const decisions = sourceItems.map((item): ApplyBatchDecision => {
    const status = classifyApplyItemStatus(item);
    return {
      sourceItem: item,
      status,
      categoryId: status === "prepared" ? item.categoryId : null,
      subcategoryId: status === "prepared" ? item.subcategoryId : null
    };
  });
  const counters = emptyBatchCounters();
  for (const decision of decisions) {
    accumulateCounters(
      counters,
      decision.status,
      normalizeDecisionStatus(decision.sourceItem.decisionStatus)
    );
  }

  const cursor = sourceItems[sourceItems.length - 1]!;

  await db.transaction(async (tx) => {
    const prepared = decisions.filter(
      (decision) => decision.status === "prepared" && decision.categoryId && decision.subcategoryId
    );
    const preparedByTarget = new Map<string, ApplyBatchDecision[]>();
    for (const decision of prepared) {
      const key = `${decision.categoryId}:${decision.subcategoryId}`;
      const current = preparedByTarget.get(key) ?? [];
      current.push(decision);
      preparedByTarget.set(key, current);
    }

    for (const [target, targetDecisions] of preparedByTarget) {
      const [categoryId, subcategoryId] = target.split(":");
      const previewToken = fingerprint({
        type: "review_reapply_apply",
        runId: run.id,
        categoryId,
        subcategoryId,
        reviewQueueIds: targetDecisions.map((decision) => decision.sourceItem.reviewQueueId).sort()
      });

      const [createdAction] = await tx
        .insert(reviewWorkspaceActions)
        .values({
          workspaceId: run.workspaceId,
          actionType: "review_reapply_auto_ready",
          categoryId,
          subcategoryId,
          productCount: targetDecisions.length,
          previewToken,
          createdBy: run.createdBy,
          metadata: {
            reviewReapplyRunId: run.id,
            dryRunId: run.dryRunId,
            pipelineVersion: run.pipelineVersion,
            decisionStatus: "AUTO_READY"
          }
        })
        .onConflictDoNothing()
        .returning({ id: reviewWorkspaceActions.id });

      const actionId = createdAction?.id ?? await getActionIdByPreviewToken(run.workspaceId, previewToken);
      if (!actionId) {
        throw new Error("Не удалось создать workspace action для apply batch.");
      }

      const insertedItems = await tx
        .insert(reviewWorkspaceItems)
        .values(targetDecisions.map((decision) => ({
          workspaceId: run.workspaceId,
          actionId,
          reviewQueueId: decision.sourceItem.reviewQueueId,
          productId: decision.sourceItem.productId,
          status: "pending" as const,
          categoryId,
          subcategoryId,
          originalCategoryId: decision.sourceItem.currentCategoryId,
          originalSubcategoryId: decision.sourceItem.currentSubcategoryId,
          originalStatus: decision.sourceItem.productStatus,
          metadata: {
            source: "review_reapply_apply",
            reviewReapplyRunId: run.id,
            dryRunId: run.dryRunId,
            runItemId: decision.sourceItem.id,
            decisionStatus: decision.sourceItem.decisionStatus,
            confidence: decision.sourceItem.confidence,
            reason: decision.sourceItem.reason,
            pipelineVersion: run.pipelineVersion,
            resultFingerprint: decision.sourceItem.resultFingerprint
          }
        })))
        .onConflictDoNothing()
        .returning({
          id: reviewWorkspaceItems.id,
          reviewQueueId: reviewWorkspaceItems.reviewQueueId
        });

      const insertedByReviewId = new Map(insertedItems.map((item) => [item.reviewQueueId, item.id]));
      for (const decision of targetDecisions) {
        const insertedItemId = insertedByReviewId.get(decision.sourceItem.reviewQueueId);
        if (insertedItemId) {
          decision.workspaceActionId = actionId;
          decision.workspaceItemId = insertedItemId;
        } else {
          decision.status = "already_pending";
          counters.preparedRows -= 1;
          counters.alreadyPendingRows += 1;
        }
      }

      await tx.insert(auditLogs).values({
        adminUserId: run.createdBy,
        action: "review.reapply.apply.batch",
        entityType: "review_reapply_run",
        entityId: run.id,
        metadata: {
          actionId,
          workspaceId: run.workspaceId,
          dryRunId: run.dryRunId,
          categoryId,
          subcategoryId,
          pipelineVersion: run.pipelineVersion,
          reviewQueueIds: targetDecisions.map((decision) => decision.sourceItem.reviewQueueId)
        }
      });
    }

    await tx
      .insert(reviewReapplyRunItems)
      .values(decisions.map((decision) => ({
        runId: run.id,
        workspaceId: run.workspaceId,
        reviewQueueId: decision.sourceItem.reviewQueueId,
        reviewQueueCreatedAt: decision.sourceItem.reviewQueueCreatedAt,
        productId: decision.sourceItem.productId,
        status: decision.status,
        decisionStatus: decision.sourceItem.decisionStatus,
        categoryId: decision.sourceItem.categoryId,
        subcategoryId: decision.sourceItem.subcategoryId,
        confidence: decision.sourceItem.confidence,
        reason: decision.sourceItem.reason,
        reviewReasonCode: decision.sourceItem.reviewReasonCode,
        groupKey: decision.sourceItem.groupKey,
        pipelineVersion: run.pipelineVersion,
        resultFingerprint: decision.sourceItem.resultFingerprint,
        workspaceActionId: decision.workspaceActionId ?? null,
        workspaceItemId: decision.workspaceItemId ?? null,
        metadata: {
          sourceDryRunItemId: decision.sourceItem.id,
          sourceDryRunId: run.dryRunId
        },
        processedAt: new Date()
      })))
      .onConflictDoUpdate({
        target: [reviewReapplyRunItems.runId, reviewReapplyRunItems.reviewQueueId],
        set: {
          status: sql`excluded.status`,
          workspaceActionId: sql`excluded.workspace_action_id`,
          workspaceItemId: sql`excluded.workspace_item_id`,
          metadata: sql`excluded.metadata`,
          processedAt: sql`excluded.processed_at`,
          updatedAt: new Date()
        }
      });

    await incrementRunCounters(tx, run.id, counters, cursor.reviewQueueCreatedAt, cursor.reviewQueueId);
  });

  return counters;
}

function evaluateReviewReapplyRow(
  row: ReviewBatchRow,
  context: CategorizationContext
): EvaluatedReviewRow {
  if (row.workspaceItemStatus === "pending" || row.workspaceItemStatus === "excluded") {
    return {
      reviewQueueId: row.reviewId,
      reviewQueueCreatedAt: row.reviewCreatedAt,
      productId: row.productId,
      status: "already_pending",
      decisionStatus: "MANUAL_REVIEW",
      categoryId: null,
      subcategoryId: null,
      confidence: null,
      reason: `Строка уже имеет workspace item со статусом ${row.workspaceItemStatus}.`,
      reviewReasonCode: "already_pending_workspace_item",
      groupKey: "already-pending",
      resultFingerprint: fingerprint({
        reviewQueueId: row.reviewId,
        workspaceItemStatus: row.workspaceItemStatus
      }),
      metadata: {
        workspaceItemId: row.workspaceItemId,
        workspaceItemStatus: row.workspaceItemStatus
      }
    };
  }

  const title = `${row.shopCode} ${row.name || row.rawName}`.trim();
  const result = categorizeProductName(title, context);
  const suggestion = buildCategorySuggestion(row, context, context.targetBySlug ?? new Map<string, CategorizationTarget>());
  const decisionStatus = normalizeDecisionStatus(result.decisionStatus);
  const categoryId = result.target?.categoryId ?? suggestion.categoryId ?? null;
  const subcategoryId = result.target?.subcategoryId ?? suggestion.subcategoryId ?? null;
  const status = classifyReviewReapplyDecision({
    decisionStatus,
    categoryId,
    subcategoryId
  });
  const groupKey = buildDecisionGroupKey(row, result, suggestion.rulePattern);
  const resultFingerprint = fingerprint({
    decisionStatus,
    categoryId,
    subcategoryId,
    confidence: result.confidence,
    reason: result.reason,
    reviewReasonCode: result.reviewReasonCode,
    matchedSignals: result.matchedSignals,
    negativeSignals: result.negativeSignals
  });

  return {
    reviewQueueId: row.reviewId,
    reviewQueueCreatedAt: row.reviewCreatedAt,
    productId: row.productId,
    status,
    decisionStatus,
    categoryId,
    subcategoryId,
    confidence: result.confidence,
    reason: result.reason,
    reviewReasonCode: result.reviewReasonCode ?? null,
    groupKey,
    resultFingerprint,
    metadata: {
      source: result.source,
      needsReview: result.needsReview,
      reviewReason: result.reviewReason,
      matchedSignals: result.matchedSignals.map((signal) => signal.value),
      negativeSignals: result.negativeSignals?.map((signal) => signal.value) ?? [],
      candidates: result.candidates?.slice(0, 5) ?? [],
      familyId: result.familyId ?? null,
      familyLabel: result.familyLabel ?? null,
      suggestionLevel: suggestion.level,
      suggestionReason: suggestion.explanation,
      suggestionConflictingSignals: suggestion.conflictingSignals,
      rulePattern: suggestion.rulePattern
    }
  };
}

function classifyApplyItemStatus(item: DryRunItemRow): ReviewReapplyRunItemStatus {
  if (item.reviewStatus !== "open" || !REVIEWABLE_PRODUCT_STATUSES.includes(item.productStatus as "needs_review" | "invalid")) {
    return "skipped";
  }
  if (item.workspaceItemStatus === "pending" || item.workspaceItemStatus === "excluded") {
    return "already_pending";
  }
  if (item.decisionStatus === "AUTO_READY" && item.categoryId && item.subcategoryId) {
    return "prepared";
  }
  if (item.status === "error") {
    return "error";
  }
  return "skipped";
}

async function getReviewRowsAfterCursor(run: ReviewReapplyRunRow, batchSize: number) {
  if (!run.sourceCatalogVersionId) return [];
  const conditions = [
    eq(reviewQueue.status, "open"),
    eq(reviewQueue.catalogVersionId, run.sourceCatalogVersionId),
    inArray(products.status, REVIEWABLE_PRODUCT_STATUSES),
    sql`not exists (
      select 1
      from review_reapply_run_items existing
      where existing.run_id = ${run.id}
        and existing.review_queue_id = ${reviewQueue.id}
    )`
  ];

  if (run.currentCursorCreatedAt && run.currentCursorReviewId) {
    conditions.push(
      or(
        gt(reviewQueue.createdAt, run.currentCursorCreatedAt),
        and(eq(reviewQueue.createdAt, run.currentCursorCreatedAt), gt(reviewQueue.id, run.currentCursorReviewId))
      )!
    );
  }

  return db
    .select({
      reviewId: reviewQueue.id,
      reviewCreatedAt: reviewQueue.createdAt,
      reason: reviewQueue.reason,
      suggestedCategoryId: reviewQueue.suggestedCategoryId,
      suggestedSubcategoryId: reviewQueue.suggestedSubcategoryId,
      productId: products.id,
      shopCode: products.shopCode,
      name: products.name,
      rawName: products.rawName,
      productStatus: products.status,
      currentCategoryId: products.categoryId,
      currentSubcategoryId: products.subcategoryId,
      workspaceItemId: reviewWorkspaceItems.id,
      workspaceItemStatus: reviewWorkspaceItems.status
    })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .leftJoin(
      reviewWorkspaceItems,
      and(
        eq(reviewWorkspaceItems.workspaceId, run.workspaceId),
        eq(reviewWorkspaceItems.productId, products.id),
        inArray(reviewWorkspaceItems.status, ["pending", "excluded"])
      )
    )
    .where(and(...conditions))
    .orderBy(asc(reviewQueue.createdAt), asc(reviewQueue.id))
    .limit(batchSize) as Promise<ReviewBatchRow[]>;
}

async function getDryRunItemsAfterCursor(run: ReviewReapplyRunRow, batchSize: number) {
  if (!run.dryRunId) return [];
  const conditions = [
    eq(reviewReapplyRunItems.runId, run.dryRunId),
    sql`not exists (
      select 1
      from review_reapply_run_items existing
      where existing.run_id = ${run.id}
        and existing.review_queue_id = ${reviewReapplyRunItems.reviewQueueId}
    )`
  ];
  if (run.currentCursorCreatedAt && run.currentCursorReviewId) {
    conditions.push(
      or(
        gt(reviewReapplyRunItems.reviewQueueCreatedAt, run.currentCursorCreatedAt),
        and(
          eq(reviewReapplyRunItems.reviewQueueCreatedAt, run.currentCursorCreatedAt),
          gt(reviewReapplyRunItems.reviewQueueId, run.currentCursorReviewId)
        )
      )!
    );
  }

  return db
    .select({
      id: reviewReapplyRunItems.id,
      reviewQueueId: reviewReapplyRunItems.reviewQueueId,
      reviewQueueCreatedAt: reviewReapplyRunItems.reviewQueueCreatedAt,
      productId: reviewReapplyRunItems.productId,
      status: reviewReapplyRunItems.status,
      decisionStatus: reviewReapplyRunItems.decisionStatus,
      categoryId: reviewReapplyRunItems.categoryId,
      subcategoryId: reviewReapplyRunItems.subcategoryId,
      confidence: reviewReapplyRunItems.confidence,
      reason: reviewReapplyRunItems.reason,
      reviewReasonCode: reviewReapplyRunItems.reviewReasonCode,
      groupKey: reviewReapplyRunItems.groupKey,
      pipelineVersion: reviewReapplyRunItems.pipelineVersion,
      resultFingerprint: reviewReapplyRunItems.resultFingerprint,
      metadata: reviewReapplyRunItems.metadata,
      reviewStatus: reviewQueue.status,
      productStatus: products.status,
      currentCategoryId: products.categoryId,
      currentSubcategoryId: products.subcategoryId,
      workspaceItemId: reviewWorkspaceItems.id,
      workspaceItemStatus: reviewWorkspaceItems.status
    })
    .from(reviewReapplyRunItems)
    .innerJoin(reviewQueue, eq(reviewQueue.id, reviewReapplyRunItems.reviewQueueId))
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .leftJoin(
      reviewWorkspaceItems,
      and(
        eq(reviewWorkspaceItems.workspaceId, run.workspaceId),
        eq(reviewWorkspaceItems.productId, products.id),
        inArray(reviewWorkspaceItems.status, ["pending", "excluded"])
      )
    )
    .where(and(...conditions))
    .orderBy(asc(reviewReapplyRunItems.reviewQueueCreatedAt), asc(reviewReapplyRunItems.reviewQueueId))
    .limit(batchSize) as Promise<DryRunItemRow[]>;
}

async function countOpenReviewRows(sourceCatalogVersionId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewQueue)
    .innerJoin(products, eq(products.id, reviewQueue.productId))
    .where(
      and(
        eq(reviewQueue.status, "open"),
        eq(reviewQueue.catalogVersionId, sourceCatalogVersionId),
        inArray(products.status, REVIEWABLE_PRODUCT_STATUSES)
      )
    );

  return Number(row?.count ?? 0);
}

async function ensureReviewReapplyWorkspace(sourceCatalogVersionId: string, adminUserId: string) {
  const existing = await getOpenReviewWorkspace(sourceCatalogVersionId);
  if (existing) return existing;

  const [workspace] = await db
    .insert(reviewWorkspaces)
    .values({
      sourceCatalogVersionId,
      createdBy: adminUserId,
      metadata: { createdFrom: "review_reapply" }
    })
    .onConflictDoNothing()
    .returning({ id: reviewWorkspaces.id });

  const current = workspace ?? await getOpenReviewWorkspace(sourceCatalogVersionId);
  if (!current) {
    throw new Error("Не удалось создать рабочую сессию проверки.");
  }

  await db.insert(auditLogs).values({
    adminUserId,
    action: "review.workspace.create",
    entityType: "review_workspace",
    entityId: current.id,
    metadata: { sourceCatalogVersionId, createdFrom: "review_reapply" }
  });

  return current;
}

async function getOpenReviewWorkspace(sourceCatalogVersionId: string) {
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

async function getActiveCatalogVersion(): Promise<ActiveCatalogVersion | null> {
  const [version] = await db
    .select({
      id: catalogVersions.id,
      publishedAt: catalogVersions.publishedAt
    })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  return version ?? null;
}

async function getActionIdByPreviewToken(workspaceId: string, previewToken: string) {
  const [action] = await db
    .select({ id: reviewWorkspaceActions.id })
    .from(reviewWorkspaceActions)
    .where(
      and(
        eq(reviewWorkspaceActions.workspaceId, workspaceId),
        eq(reviewWorkspaceActions.previewToken, previewToken)
      )
    )
    .limit(1);
  return action?.id ?? null;
}

async function getReviewReapplyGroups(runId: string) {
  return db
    .select({
      id: reviewReapplyGroups.id,
      runId: reviewReapplyGroups.runId,
      decisionStatus: reviewReapplyGroups.decisionStatus,
      groupKey: reviewReapplyGroups.groupKey,
      productCount: reviewReapplyGroups.productCount,
      categoryName: categories.name,
      subcategoryName: subcategories.name,
      reasonSummary: reviewReapplyGroups.reasonSummary
    })
    .from(reviewReapplyGroups)
    .leftJoin(categories, eq(categories.id, reviewReapplyGroups.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, reviewReapplyGroups.subcategoryId))
    .where(eq(reviewReapplyGroups.runId, runId))
    .orderBy(desc(reviewReapplyGroups.productCount), asc(reviewReapplyGroups.groupKey))
    .limit(20);
}

async function claimRunLock(runId: string, processorId: string) {
  const expiresAt = new Date(Date.now() + RUN_LOCK_TTL_MS);
  const [run] = await db
    .update(reviewReapplyRuns)
    .set({
      lockedBy: processorId,
      lockExpiresAt: expiresAt,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(reviewReapplyRuns.id, runId),
        inArray(reviewReapplyRuns.status, ["pending", "running"]),
        or(
          isNull(reviewReapplyRuns.lockedBy),
          eq(reviewReapplyRuns.lockedBy, processorId),
          lt(reviewReapplyRuns.lockExpiresAt, new Date())
        )
      )
    )
    .returning({ id: reviewReapplyRuns.id });

  if (!run) {
    throw new Error("Run уже обрабатывается, поставлен на паузу, отменён или завершён.");
  }
}

async function markRunRunning(runId: string, processorId: string) {
  const now = new Date();
  await db
    .update(reviewReapplyRuns)
    .set({
      status: "running",
      startedAt: sql`coalesce(${reviewReapplyRuns.startedAt}, now())`,
      lastHeartbeatAt: now,
      lockedBy: processorId,
      lockExpiresAt: new Date(Date.now() + RUN_LOCK_TTL_MS),
      updatedAt: now
    })
    .where(eq(reviewReapplyRuns.id, runId));
}

async function releaseRunLock(runId: string, processorId: string) {
  await db
    .update(reviewReapplyRuns)
    .set({
      lockedBy: null,
      lockExpiresAt: null,
      updatedAt: new Date()
    })
    .where(and(eq(reviewReapplyRuns.id, runId), eq(reviewReapplyRuns.lockedBy, processorId)));
}

async function markRunFailed(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(reviewReapplyRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorSummary: {
        message
      },
      lockedBy: null,
      lockExpiresAt: null,
      updatedAt: new Date()
    })
    .where(eq(reviewReapplyRuns.id, runId));
}

async function finishReviewReapplyRun(runId: string) {
  const run = await getReviewReapplyRun(runId);
  if (!run) throw new Error("Run не найден.");
  const status: ReviewReapplyRunStatus = run.errorRows > 0 ? "completed_with_errors" : "completed";
  await db
    .update(reviewReapplyRuns)
    .set({
      status,
      finishedAt: new Date(),
      lastHeartbeatAt: new Date(),
      lockedBy: null,
      lockExpiresAt: null,
      updatedAt: new Date()
    })
    .where(eq(reviewReapplyRuns.id, runId));

  const finished = await getReviewReapplyRun(runId);
  return finished;
}

async function incrementRunCounters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  runId: string,
  counters: BatchCounters,
  cursorCreatedAt: Date,
  cursorReviewId: string
) {
  await tx
    .update(reviewReapplyRuns)
    .set({
      processedRows: sql`${reviewReapplyRuns.processedRows} + ${counters.processedRows}`,
      preparedRows: sql`${reviewReapplyRuns.preparedRows} + ${counters.preparedRows}`,
      skippedRows: sql`${reviewReapplyRuns.skippedRows} + ${counters.skippedRows}`,
      manualRows: sql`${reviewReapplyRuns.manualRows} + ${counters.manualRows}`,
      blockedRows: sql`${reviewReapplyRuns.blockedRows} + ${counters.blockedRows}`,
      doNotPublishRows: sql`${reviewReapplyRuns.doNotPublishRows} + ${counters.doNotPublishRows}`,
      groupReviewRows: sql`${reviewReapplyRuns.groupReviewRows} + ${counters.groupReviewRows}`,
      autoReadyRows: sql`${reviewReapplyRuns.autoReadyRows} + ${counters.autoReadyRows}`,
      errorRows: sql`${reviewReapplyRuns.errorRows} + ${counters.errorRows}`,
      alreadyPendingRows: sql`${reviewReapplyRuns.alreadyPendingRows} + ${counters.alreadyPendingRows}`,
      currentCursorCreatedAt: cursorCreatedAt,
      currentCursorReviewId: cursorReviewId,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(reviewReapplyRuns.id, runId));
}

function accumulateCounters(
  counters: BatchCounters,
  status: ReviewReapplyRunItemStatus,
  decisionStatus: CategorizationDecisionStatus | "INVALID_INPUT"
) {
  counters.processedRows += 1;
  if (status === "prepared") counters.preparedRows += 1;
  if (status === "skipped") counters.skippedRows += 1;
  if (status === "already_pending") counters.alreadyPendingRows += 1;
  if (status === "error") counters.errorRows += 1;
  if (decisionStatus === "AUTO_READY") counters.autoReadyRows += 1;
  if (decisionStatus === "GROUP_REVIEW") counters.groupReviewRows += 1;
  if (decisionStatus === "MANUAL_REVIEW") counters.manualRows += 1;
  if (decisionStatus === "BLOCKED_CONFLICT") counters.blockedRows += 1;
  if (decisionStatus === "DO_NOT_PUBLISH") counters.doNotPublishRows += 1;
}

function emptyBatchCounters(): BatchCounters {
  return {
    processedRows: 0,
    preparedRows: 0,
    skippedRows: 0,
    manualRows: 0,
    blockedRows: 0,
    doNotPublishRows: 0,
    groupReviewRows: 0,
    autoReadyRows: 0,
    errorRows: 0,
    alreadyPendingRows: 0
  };
}

function buildProcessResult(
  run: ReviewReapplyRunRow | null,
  processedBatches: number,
  batchDurationsMs: number[]
) {
  return {
    run,
    processedBatches,
    batchDurationsMs,
    maxBatchMs: batchDurationsMs.length ? Math.max(...batchDurationsMs) : 0,
    averageBatchMs: batchDurationsMs.length
      ? Math.round(batchDurationsMs.reduce((sum, value) => sum + value, 0) / batchDurationsMs.length)
      : 0
  };
}

function buildDecisionGroupKey(
  row: ReviewBatchRow,
  result: CategorizationResult,
  rulePattern: string | null
) {
  if (result.decisionStatus === "AUTO_READY") {
    return result.target
      ? `${result.target.categorySlug}/${result.target.subcategorySlug}`
      : null;
  }
  if (result.decisionStatus === "GROUP_REVIEW") {
    return [
      result.familyId,
      result.target ? `${result.target.categorySlug}/${result.target.subcategorySlug}` : null,
      rulePattern
    ].filter(Boolean).join(":") || firstSignal(result) || row.shopCode;
  }
  if (result.decisionStatus === "DO_NOT_PUBLISH") {
    return result.reviewReasonCode ?? firstSignal(result) ?? "do-not-publish";
  }
  if (result.decisionStatus === "BLOCKED_CONFLICT") {
    return result.reviewReasonCode ?? result.familyId ?? "blocked-conflict";
  }
  return result.familyId ?? firstSignal(result) ?? "manual-review";
}

function firstSignal(result: CategorizationResult) {
  return result.matchedSignals[0]?.value ?? null;
}

function normalizeDecisionStatus(value: string | null | undefined): CategorizationDecisionStatus | "INVALID_INPUT" {
  if (
    value === "AUTO_READY" ||
    value === "GROUP_REVIEW" ||
    value === "MANUAL_REVIEW" ||
    value === "BLOCKED_CONFLICT" ||
    value === "DO_NOT_PUBLISH"
  ) {
    return value;
  }
  return "INVALID_INPUT";
}

function normalizeBatchSize(batchSize: number | undefined) {
  if (!batchSize || !Number.isFinite(batchSize)) return DEFAULT_REAPPLY_BATCH_SIZE;
  return Math.max(1, Math.min(Math.floor(batchSize), MAX_REAPPLY_BATCH_SIZE));
}

function normalizeReviewReapplyFilters(filters?: AdminReviewActionFilters): AdminReviewActionFilters {
  const normalized = filters ?? REVIEW_REAPPLY_DEFAULT_FILTERS;
  if (
    normalized.scope !== "workspace" ||
    normalized.issue !== "all" ||
    normalized.query ||
    normalized.reason ||
    normalized.group
  ) {
    throw new Error("Первый этап повторной обработки поддерживает только весь scope рабочей сессии.");
  }
  return REVIEW_REAPPLY_DEFAULT_FILTERS;
}

function parseRunFilters(value: unknown): AdminReviewActionFilters {
  if (!value || typeof value !== "object") {
    return REVIEW_REAPPLY_DEFAULT_FILTERS;
  }
  const input = value as Partial<AdminReviewActionFilters>;
  return normalizeReviewReapplyFilters({
    scope: input.scope ?? "workspace",
    issue: input.issue ?? "all",
    query: input.query ?? "",
    reason: input.reason ?? "",
    group: input.group ?? ""
  });
}

function buildScopeFingerprint(input: {
  sourceCatalogVersionId: string;
  filters: AdminReviewActionFilters;
}) {
  return fingerprint({
    version: 1,
    sourceCatalogVersionId: input.sourceCatalogVersionId,
    filters: input.filters
  });
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isActiveRunStatus(status: ReviewReapplyRunStatus) {
  return status === "pending" || status === "running" || status === "paused";
}

function toPanelRun(run: ReviewReapplyRunRow | null | undefined): ReviewReapplyPanelRun | null {
  if (!run) return null;
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    pipelineVersion: run.pipelineVersion,
    totalRows: run.totalRows,
    processedRows: run.processedRows,
    preparedRows: run.preparedRows,
    skippedRows: run.skippedRows,
    manualRows: run.manualRows,
    blockedRows: run.blockedRows,
    doNotPublishRows: run.doNotPublishRows,
    groupReviewRows: run.groupReviewRows,
    autoReadyRows: run.autoReadyRows,
    errorRows: run.errorRows,
    alreadyPendingRows: run.alreadyPendingRows,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    lastHeartbeatAt: run.lastHeartbeatAt,
    createdAt: run.createdAt,
    dryRunId: run.dryRunId,
    isStale: isReviewReapplyRunStale(run)
  };
}

function minNullable(a: number | null, b: number | null) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function maxNullable(a: number | null, b: number | null) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

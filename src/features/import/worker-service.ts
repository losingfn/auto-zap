import { access } from "node:fs/promises";
import path from "node:path";
import { and, eq, exists, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { backgroundJobs, importBatches } from "@/db/schema";
import type { BackgroundJobError, BackgroundJobHandlerContext } from "@/features/background-jobs/types";
import { createDraftImport } from "./draft-service";
import {
  activateCatalogVersionInDatabase,
  CatalogActivationGuardError,
  getPublishSafetyReport,
  publishCatalogVersion
} from "./publish-service";
import { ImportSafetyError } from "./safety";
import { getLiveSearchCatalogVersionId } from "@/features/search/meilisearch";
import { BackgroundJobExecutionError } from "@/features/background-jobs/types";
import { getActiveCatalogVersionId } from "@/features/search/documents";
import { syncSearchIndexForCatalogVersion } from "@/features/search/indexing";
import { writeImportAuditSafely } from "./audit";

type ImportJobBatch = {
  id: string;
  status: string;
  catalogVersionId: string | null;
  sourceFileName: string;
  storagePath: string | null;
  uploadedBy: string | null;
  report: unknown;
  publishCheckpoint: string | null;
};

export type PublishReconciliationAction =
  | "already_converged"
  | "sync_search_to_database"
  | "activate_database"
  | "continue_publish"
  | "invalid_published_state";

export function getPublishReconciliationAction(input: {
  activeCatalogVersionId: string | null;
  liveCatalogVersionId: string | null;
  targetCatalogVersionId: string;
  batchStatus: string;
}): PublishReconciliationAction {
  if (input.activeCatalogVersionId === input.targetCatalogVersionId) {
    return input.liveCatalogVersionId === input.activeCatalogVersionId
      ? "already_converged"
      : "sync_search_to_database";
  }
  if (input.batchStatus === "published") return "invalid_published_state";
  return input.liveCatalogVersionId === input.targetCatalogVersionId
    ? "activate_database"
    : "continue_publish";
}

export async function executeAnalyzeImportJob(
  context: BackgroundJobHandlerContext,
  batchId: string
) {
  const batch = await getImportJobBatch(batchId);
  if (!batch) throw new BackgroundJobExecutionError("IMPORT_NOT_FOUND", "Импорт не найден.", false);
  if (["analyzed", "published", "cancelled"].includes(batch.status)) {
    return { batchId, catalogVersionId: batch.catalogVersionId, alreadyCompleted: true };
  }
  if (!batch.storagePath) {
    throw new BackgroundJobExecutionError("FILE_NOT_FOUND", "Сохранённый Excel-файл не найден.", false);
  }

  const filePath = resolveStoredImportPath(batch.storagePath);
  try {
    await access(filePath);
  } catch {
    throw new BackgroundJobExecutionError("FILE_NOT_FOUND", "Сохранённый Excel-файл не найден.", false);
  }

  try {
    await setImportProgress(context, batchId, "analyzing", "Читаем Excel", 8);
    await context.reportProgress(8);
    await context.assertLease();
    const result = await createDraftImport({
      filePath,
      sourceFileName: batch.sourceFileName,
      uploadedBy: batch.uploadedBy ?? undefined,
      storagePath: batch.storagePath,
      importBatchId: batch.id,
      onProgress: async (stage, progress) => {
        await setImportProgress(context, batchId, "analyzing", stage, progress);
        await context.reportProgress(progress);
      },
      assertCanContinue: context.assertLease
    });
    await context.assertLease();
    await setImportProgress(context, batchId, "analyzed", "Готово", 100);
    await writeImportAuditSafely({
      adminUserId: batch.uploadedBy,
      action: "import.analyze",
      entityType: "import_batch",
      entityId: batch.id,
      metadata: { catalogVersionId: result.catalogVersionId, sourceFileName: batch.sourceFileName }
    });
    return { batchId, catalogVersionId: result.catalogVersionId, reviewCount: result.report.reviewRows };
  } catch (error) {
    throw toImportJobError(error, "ANALYSIS_FAILED", "Не удалось обработать Excel-файл.");
  }
}

export async function executePublishImportJob(
  context: BackgroundJobHandlerContext,
  batchId: string
) {
  const batch = await getImportJobBatch(batchId);
  if (!batch) throw new BackgroundJobExecutionError("IMPORT_NOT_FOUND", "Импорт не найден.", false);
  if (batch.status === "cancelled" || !batch.catalogVersionId || !isRecord(batch.report)) {
    throw new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Этот импорт нельзя опубликовать.", false);
  }

  try {
    const recovered = await reconcilePublishState(batch, context);
    if (recovered) {
      await writeImportAuditSafely({
        adminUserId: batch.uploadedBy,
        action: "import.publish",
        entityType: "import_batch",
        entityId: batch.id,
        metadata: { catalogVersionId: batch.catalogVersionId, sourceFileName: batch.sourceFileName, recovered: true }
      });
      return { batchId, catalogVersionId: batch.catalogVersionId, recovered: true };
    }

    if (batch.status === "published") {
      throw new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Этот импорт нельзя опубликовать.", false);
    }

    await setImportProgress(context, batchId, "publishing", "Обновляем каталог", 8, "prepared");
    await context.reportProgress(8);
    await context.assertLease();

    await publishCatalogVersion({
      catalogVersionId: batch.catalogVersionId,
      report: batch.report as never,
      activation: {
        importBatchId: batch.id,
        publishJob: { id: context.job.id, workerId: context.workerId, leaseToken: context.leaseToken }
      },
      onCheckpoint: async (checkpoint) => {
        if (checkpoint === "catalog_activated") {
          await runPostCommitSafely(context, async () => {
            await context.reportProgress(100);
            await context.assertLease();
          });
          return;
        }
        const checkpointProgress: Record<string, number> = {
          prepared: 15,
          search_index_built: 55,
          search_swap_started: 70,
          search_swapped: 82
        };
        const stage: Record<string, string> = {
          prepared: "Проверяем изменения",
          search_index_built: "Обновляем поиск",
          search_swap_started: "Обновляем поиск",
          search_swapped: "Переключаем каталог"
        };
        await setImportProgress(context, batchId, "publishing", stage[checkpoint], checkpointProgress[checkpoint], checkpoint);
        await context.reportProgress(checkpointProgress[checkpoint]);
        await context.assertLease();
      }
    });

    await writeImportAuditSafely({
      adminUserId: batch.uploadedBy,
      action: "import.publish",
      entityType: "import_batch",
      entityId: batch.id,
      metadata: { catalogVersionId: batch.catalogVersionId, sourceFileName: batch.sourceFileName }
    });
    return { batchId, catalogVersionId: batch.catalogVersionId, recovered: false };
  } catch (error) {
    const code = error instanceof ImportSafetyError || error instanceof CatalogActivationGuardError
      ? "PUBLISH_BLOCKED"
      : "PUBLISH_FAILED";
    const message = error instanceof ImportSafetyError
      ? "Проверка перед публикацией не пройдена."
      : "Не удалось завершить публикацию.";
    throw toImportJobError(error, code, message);
  }
}

/** Persists a user-safe state after worker retry/final failure without exposing internals. */
export async function markImportJobFailure(input: {
  job: { type: string; payload: Record<string, unknown> };
  error: BackgroundJobError;
  willRetry: boolean;
}) {
  const batchId = typeof input.job.payload.batchId === "string" ? input.job.payload.batchId : null;
  if (!batchId) return;
  const isPublish = input.job.type === "publish_import";
  const values = {
    phase: input.willRetry ? (isPublish ? "publish_retrying" : "retrying") : "failed",
    stage: input.willRetry ? (isPublish ? "Повторяем публикацию" : "Повторяем операцию") : "Ошибка",
    lastErrorCode: input.error.code,
    lastErrorMessage: safeImportErrorMessage(input.error.code),
    processingUpdatedAt: new Date()
  };
  if (!input.willRetry && !isPublish) {
    Object.assign(values, { status: "failed" });
  }
  await db
    .update(importBatches)
    .set(values)
    .where(and(eq(importBatches.id, batchId), ne(importBatches.status, "cancelled")));
}

async function reconcilePublishState(batch: ImportJobBatch, context: BackgroundJobHandlerContext) {
  if (!batch.catalogVersionId) return false;
  const activeCatalogVersionId = await getActiveCatalogVersionId();
  const liveCatalogVersionId = await getLiveSearchCatalogVersionId();
  const action = getPublishReconciliationAction({
    activeCatalogVersionId,
    liveCatalogVersionId,
    targetCatalogVersionId: batch.catalogVersionId,
    batchStatus: batch.status
  });

  if (action === "already_converged") return true;

  if (action === "sync_search_to_database") {
    if (activeCatalogVersionId) {
      await syncSearchIndexForCatalogVersion(activeCatalogVersionId);
      const reconciledLiveCatalogVersionId = await getLiveSearchCatalogVersionId();
      if (reconciledLiveCatalogVersionId !== activeCatalogVersionId) {
        throw new BackgroundJobExecutionError("SEARCH_TEMPORARY_ERROR", "Поисковый индекс временно недоступен.", true);
      }
    }
    return true;
  }

  if (action === "invalid_published_state") {
    throw new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Этот импорт нельзя опубликовать.", false);
  }

  if (action === "continue_publish") return false;

  const safety = await getPublishSafetyReport({ catalogVersionId: batch.catalogVersionId, report: batch.report as never });
  if (!safety.canPublish) throw new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Проверка перед публикацией не пройдена.", false);
  await setImportProgress(context, batch.id, "publishing", "Переключаем каталог", 88, "search_swapped");
  await context.reportProgress(88);
  await context.assertLease();
  await activateCatalogVersionInDatabase(batch.catalogVersionId, {
    importBatchId: batch.id,
    publishJob: { id: context.job.id, workerId: context.workerId, leaseToken: context.leaseToken }
  });
  await runPostCommitSafely(context, async () => {
    await context.reportProgress(100);
    await context.assertLease();
  });
  return true;
}

async function getImportJobBatch(batchId: string): Promise<ImportJobBatch | null> {
  const [batch] = await db
    .select({
      id: importBatches.id,
      status: importBatches.status,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      storagePath: importBatches.storagePath,
      uploadedBy: importBatches.uploadedBy,
      report: importBatches.report,
      publishCheckpoint: importBatches.publishCheckpoint
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  return batch ?? null;
}

async function setImportProgress(
  context: BackgroundJobHandlerContext,
  batchId: string,
  phase: string,
  stage: string,
  progress: number,
  publishCheckpoint?: string
) {
  const jobReference = context.job.type === "publish_import"
    ? importBatches.publishJobId
    : importBatches.analyzeJobId;
  const [updated] = await db
    .update(importBatches)
    .set({
      phase,
      stage,
      progress,
      ...(publishCheckpoint ? { publishCheckpoint } : {}),
      processingUpdatedAt: new Date()
    })
    .where(
      and(
        eq(importBatches.id, batchId),
        eq(jobReference, context.job.id),
        inArray(importBatches.status, ["uploaded", "analyzed", "published"]),
        exists(
          db
            .select({ id: backgroundJobs.id })
            .from(backgroundJobs)
            .where(
              and(
                eq(backgroundJobs.id, context.job.id),
                eq(backgroundJobs.status, "running"),
                eq(backgroundJobs.lockedBy, context.workerId),
                eq(backgroundJobs.leaseToken, context.leaseToken)
              )
            )
        )
      )
    )
    .returning({ id: importBatches.id });

  if (updated) return;
  const [batch] = await db
    .select({ status: importBatches.status })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (batch?.status === "cancelled") {
    throw new BackgroundJobExecutionError("IMPORT_CANCELLED", "Импорт отменён.", false);
  }
  await context.assertLease();
  throw new BackgroundJobExecutionError("DATABASE_TEMPORARY_ERROR", "Не удалось обновить состояние импорта.", true);
}

function resolveStoredImportPath(storagePath: string) {
  const root = path.resolve(process.cwd(), "data", "imports", "uploads");
  const candidate = path.resolve(process.cwd(), storagePath);
  if (!candidate.startsWith(`${root}${path.sep}`)) {
    throw new BackgroundJobExecutionError("FILE_NOT_FOUND", "Сохранённый Excel-файл не найден.", false);
  }
  return candidate;
}

function toImportJobError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof BackgroundJobExecutionError) return error;
  if (error instanceof ImportSafetyError) return new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Проверка перед публикацией не пройдена.", false);
  const retryable = isRetryableInfrastructureError(error);
  const code = retryable ? infrastructureErrorCode(error) : fallbackCode;
  return new BackgroundJobExecutionError(code, retryable ? "Временная ошибка сервиса. Система попробует ещё раз." : fallbackMessage, retryable);
}

function isRetryableInfrastructureError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  return code.startsWith("08") || ["40001", "40P01", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(code) || /meili|network|timeout/i.test(error instanceof Error ? error.message : "");
}

function infrastructureErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  return /meili/i.test(error instanceof Error ? error.message : "") ? "SEARCH_TEMPORARY_ERROR" : code || "DATABASE_TEMPORARY_ERROR";
}

function safeImportErrorMessage(code: string) {
  const messages: Record<string, string> = {
    FILE_NOT_FOUND: "Сохранённый Excel-файл не найден.",
    EXCEL_PARSE_FAILED: "Не удалось прочитать Excel-файл. Проверьте, что он не повреждён.",
    ANALYSIS_FAILED: "Не удалось обработать Excel-файл.",
    PUBLISH_BLOCKED: "Проверка перед публикацией не пройдена.",
    IMPORT_CANCELLED: "Импорт отменён.",
    SEARCH_TEMPORARY_ERROR: "Поисковый индекс временно недоступен. Система попробует ещё раз.",
    PUBLISH_FAILED: "Не удалось завершить публикацию."
  };
  return messages[code] ?? "Не удалось завершить операцию.";
}

async function runPostCommitSafely(
  _context: BackgroundJobHandlerContext,
  operation: () => Promise<void>
) {
  try {
    await operation();
  } catch {
    console.error("[import/worker] post_commit_metadata_failed");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

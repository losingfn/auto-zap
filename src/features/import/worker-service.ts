import { access } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, importBatches } from "@/db/schema";
import type { BackgroundJobError, BackgroundJobHandlerContext } from "@/features/background-jobs/types";
import { createDraftImport } from "./draft-service";
import {
  activateCatalogVersionInDatabase,
  getPublishSafetyReport,
  publishCatalogVersion
} from "./publish-service";
import { ImportSafetyError } from "./safety";
import { getLiveSearchCatalogVersionId } from "@/features/search/meilisearch";
import { BackgroundJobExecutionError } from "@/features/background-jobs/types";

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
    await setImportProgress(batchId, "analyzing", "Читаем Excel", 8);
    await context.reportProgress(8);
    await context.assertLease();
    const result = await createDraftImport({
      filePath,
      sourceFileName: batch.sourceFileName,
      uploadedBy: batch.uploadedBy ?? undefined,
      storagePath: batch.storagePath,
      importBatchId: batch.id,
      onProgress: async (stage, progress) => {
        await setImportProgress(batchId, "analyzing", stage, progress);
        await context.reportProgress(progress);
      },
      assertCanContinue: context.assertLease
    });
    await context.assertLease();
    await setImportProgress(batchId, "analyzed", "Готово", 100);
    await writeAuditSafely({
      adminUserId: batch.uploadedBy,
      action: "import.analyze",
      importBatchId: batch.id,
      catalogVersionId: result.catalogVersionId,
      sourceFileName: batch.sourceFileName
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
  if (batch.status === "published") return { batchId, catalogVersionId: batch.catalogVersionId, alreadyCompleted: true };
  if (batch.status === "cancelled" || !batch.catalogVersionId || !isRecord(batch.report)) {
    throw new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Этот импорт нельзя опубликовать.", false);
  }

  try {
    await setImportProgress(batchId, "publishing", "Проверяем изменения", 8, "prepared");
    await context.reportProgress(8);
    await context.assertLease();

    const recovered = await reconcileSearchSwapIfNeeded(batch, context);
    if (!recovered) {
      await publishCatalogVersion({
        catalogVersionId: batch.catalogVersionId,
        report: batch.report as never,
        onCheckpoint: async (checkpoint) => {
          const checkpointProgress: Record<string, number> = {
            prepared: 15,
            search_index_built: 55,
            search_swap_started: 70,
            search_swapped: 82,
            catalog_activated: 94
          };
          const stage: Record<string, string> = {
            prepared: "Проверяем изменения",
            search_index_built: "Обновляем поиск",
            search_swap_started: "Обновляем поиск",
            search_swapped: "Переключаем каталог",
            catalog_activated: "Завершаем публикацию"
          };
          await setImportProgress(batchId, "publishing", stage[checkpoint], checkpointProgress[checkpoint], checkpoint);
          await context.reportProgress(checkpointProgress[checkpoint]);
          await context.assertLease();
        }
      });
    }

    await setImportProgress(batchId, "published", "Опубликовано", 100, "completed");
    await writeAuditSafely({
      adminUserId: batch.uploadedBy,
      action: "import.publish",
      importBatchId: batch.id,
      catalogVersionId: batch.catalogVersionId,
      sourceFileName: batch.sourceFileName
    });
    return { batchId, catalogVersionId: batch.catalogVersionId, recovered };
  } catch (error) {
    const code = error instanceof ImportSafetyError ? "PUBLISH_BLOCKED" : "PUBLISH_FAILED";
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
    phase: input.willRetry ? "retrying" : "failed",
    stage: input.willRetry ? "Повторяем операцию" : "Ошибка",
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
    .where(eq(importBatches.id, batchId));
}

async function reconcileSearchSwapIfNeeded(batch: ImportJobBatch, context: BackgroundJobHandlerContext) {
  if (!batch.catalogVersionId || !["search_swap_started", "search_swapped"].includes(batch.publishCheckpoint ?? "")) {
    return false;
  }
  const liveCatalogVersionId = await getLiveSearchCatalogVersionId();
  if (liveCatalogVersionId !== batch.catalogVersionId) return false;

  const safety = await getPublishSafetyReport({ catalogVersionId: batch.catalogVersionId, report: batch.report as never });
  if (!safety.canPublish) throw new BackgroundJobExecutionError("PUBLISH_BLOCKED", "Проверка перед публикацией не пройдена.", false);
  await setImportProgress(batch.id, "publishing", "Переключаем каталог", 88, "search_swapped");
  await context.reportProgress(88);
  await context.assertLease();
  await activateCatalogVersionInDatabase(batch.catalogVersionId);
  await setImportProgress(batch.id, "publishing", "Завершаем публикацию", 96, "catalog_activated");
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
  batchId: string,
  phase: string,
  stage: string,
  progress: number,
  publishCheckpoint?: string
) {
  await db
    .update(importBatches)
    .set({
      phase,
      stage,
      progress,
      ...(publishCheckpoint ? { publishCheckpoint } : {}),
      processingUpdatedAt: new Date()
    })
    .where(and(eq(importBatches.id, batchId), inArray(importBatches.status, ["uploaded", "analyzed", "published"])));
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
    SEARCH_TEMPORARY_ERROR: "Поисковый индекс временно недоступен. Система попробует ещё раз.",
    PUBLISH_FAILED: "Не удалось завершить публикацию."
  };
  return messages[code] ?? "Не удалось завершить операцию.";
}

async function writeAuditSafely(input: {
  adminUserId: string | null;
  action: string;
  importBatchId: string;
  catalogVersionId: string | null;
  sourceFileName: string;
}) {
  try {
    await db.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: input.action,
      entityType: "import_batch",
      entityId: input.importBatchId,
      metadata: { catalogVersionId: input.catalogVersionId, sourceFileName: input.sourceFileName }
    });
  } catch (_error) {
    console.error("[import/worker] audit_write_failed", { action: input.action, importBatchId: input.importBatchId });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

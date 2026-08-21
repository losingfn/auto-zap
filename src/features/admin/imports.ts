import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adminUsers,
  backgroundJobs,
  catalogVersions,
  importBatches,
  importErrors
} from "@/db/schema";
import { hashBackgroundJobPayload } from "@/features/background-jobs/payload";
import { validateBackgroundJobPayload } from "@/features/background-jobs/handlers";
import { createDraftImport } from "@/features/import/draft-service";
import {
  canCancelImportForUi,
  canCancelImportStrict,
  canPublishImport,
  isBlockingDuplicateFileImport,
  isBlockingImportDraft,
  isDuplicateFileBlockerForHash,
  isFinalImportStatus,
  isFinalizedImport,
  selectImportBatchForAdminPage,
  type ImportStartBlocker,
  type ImportStateBatch
} from "@/features/import/import-state";
import { publishCatalogVersion } from "@/features/import/publish-service";
import { writeImportAuditSafely } from "@/features/import/audit";
import { ImportSafetyError } from "@/features/import/safety";
import { getImportStoragePath, getImportUploadDir, getImportUploadFilePath } from "@/features/import/storage";
import type { ImportPerfLogger } from "@/lib/server/import-perf";
import type { ImportPreviewReport, ImportSafetyCheckStatus } from "@/features/import/types";
import { isImportWorkerModeAvailable } from "@/lib/feature-flags";

export {
  canCancelImportForUi,
  canCancelImportStrict,
  canPublishImport,
  isBlockingDuplicateFileImport,
  isBlockingImportDraft,
  isDuplicateFileBlockerForHash,
  isFinalImportStatus,
  isFinalizedImport
};

const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".xls", ".xlsx"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);

export type AdminImportErrorCode =
  | "missing_file"
  | "empty_file"
  | "file_too_large"
  | "invalid_extension"
  | "invalid_type"
  | "analysis_failed"
  | "publish_failed"
  | "safety_blocked"
  | "duplicate_file"
  | "import_in_progress"
  | "cancel_failed"
  | "not_found"
  | "not_ready"
  | "already_finalized"
  | "worker_unavailable";

export class AdminImportError extends Error {
  constructor(
    public readonly code: AdminImportErrorCode,
    message: string,
    public readonly details: AdminImportErrorDetails = {}
  ) {
    super(message);
    this.name = "AdminImportError";
  }
}

export type AdminImportErrorDetails = {
  blockingBatchId?: string;
  duplicateBatchId?: string;
};

export type StoredImportReport = ImportPreviewReport & {
  categorization?: {
    matchedRows: number;
    unmatchedRows: number;
    activeRules: number;
  };
};

export type AdminImportBatchSummary = {
  id: string;
  catalogVersionId: string | null;
  sourceFileName: string;
  status: string;
  versionStatus: string | null;
  createdAt: Date;
  analyzedAt: Date | null;
  publishedAt: Date | null;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  report: StoredImportReport | null;
  canPublish: boolean;
  canCancel: boolean;
  canCancelStrict: boolean;
  canCancelForUi: boolean;
  isBlockingDraft: boolean;
  isFinalized: boolean;
  fileHash: string | null;
  publishJobId: string | null;
  phase: string | null;
};

export type AdminImportRowError = {
  id: string;
  rowNumber: number | null;
  fieldName: string | null;
  code: string;
  message: string;
};

type ImportBatchRecord = {
  id: string;
  catalogVersionId: string | null;
  sourceFileName: string;
  status: string;
  createdAt: Date;
  analyzedAt: Date | null;
  publishedAt: Date | null;
  report: unknown;
  versionStatus: string | null;
  fileHash: string | null;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  publishJobId?: string | null;
  phase?: string | null;
};

export async function createAdminDraftImportFromUpload({
  file,
  adminUserId,
  perf
}: {
  file: File | null;
  adminUserId: string;
  perf?: ImportPerfLogger;
}) {
  const storedFile = perf
    ? await perf.measure("save_uploaded_file", () => saveUploadedImportFile(file))
    : await saveUploadedImportFile(file);

  try {
    await assertImportCanStart(storedFile.fileHash);
    const result = await createDraftImport({
      filePath: storedFile.filePath,
      sourceFileName: storedFile.originalName,
      fileHash: storedFile.fileHash,
      uploadedBy: adminUserId,
      storagePath: storedFile.storagePath,
      perf
    });

    await writeImportAuditSafely({
      adminUserId,
      action: "import.analyze",
      entityType: "import_batch",
      entityId: result.importBatchId,
      metadata: {
        catalogVersionId: result.catalogVersionId,
        sourceFileName: storedFile.originalName,
        fileSizeBytes: storedFile.size,
        report: toAuditReportSummary(result.report)
      }
    });

    return result;
  } catch (error) {
    await removeRejectedUploadFileSafely(storedFile.filePath);
    if (error instanceof AdminImportError) {
      throw error;
    }
    console.error("[admin/import] analysis_failed", {
      sourceFileName: storedFile.originalName,
      fileSizeBytes: storedFile.size,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    await writeImportAuditSafely({
      adminUserId,
      action: "import.analysis_failed",
      entityType: "import_batch",
      metadata: {
        sourceFileName: storedFile.originalName,
        fileSizeBytes: storedFile.size,
        error: error instanceof Error ? error.message : String(error)
      }
    });

    throw new AdminImportError(
      "analysis_failed",
      error instanceof Error ? error.message : "Не удалось проанализировать Excel-файл."
    );
  }
}

/**
 * Accepts the HTTP upload and reserves durable work only. Analysis deliberately
 * happens in the independent background worker, never inside this request.
 */
export async function enqueueAdminImportFromUpload({
  file,
  adminUserId
}: {
  file: File | null;
  adminUserId: string;
}) {
  assertWorkerImportAvailable();
  const storedFile = await saveUploadedImportFile(file);

  try {
    await assertImportCanStart(storedFile.fileHash);
    const accepted = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatches)
        .values({
          status: "uploaded",
          sourceFileName: storedFile.originalName,
          storagePath: storedFile.storagePath,
          fileHash: storedFile.fileHash,
          uploadedBy: adminUserId,
          phase: "queued",
          stage: "Файл принят",
          progress: 0,
          processingUpdatedAt: new Date()
        })
        .returning({ id: importBatches.id });

      const payload = { batchId: batch.id };
      const payloadVersion = validateBackgroundJobPayload("analyze_import", payload);
      const [job] = await tx
        .insert(backgroundJobs)
        .values({
          type: "analyze_import",
          payload,
          payloadHash: hashBackgroundJobPayload({ payload, payloadVersion }),
          idempotencyKey: `analyze-import:${batch.id}`,
          requestedBy: adminUserId,
          correlationId: batch.id,
          maxAttempts: 3
        })
        .returning({ id: backgroundJobs.id });

      await tx
        .update(importBatches)
        .set({ analyzeJobId: job.id })
        .where(eq(importBatches.id, batch.id));

      return { importBatchId: batch.id, backgroundJobId: job.id };
    });

    await writeImportAuditSafely({
      adminUserId,
      action: "import.accepted",
      entityType: "import_batch",
      entityId: accepted.importBatchId,
      metadata: {
        sourceFileName: storedFile.originalName,
        fileSizeBytes: storedFile.size,
        backgroundJobId: accepted.backgroundJobId
      }
    });

    return accepted;
  } catch (error) {
    await removeRejectedUploadFileSafely(storedFile.filePath);
    if (isActiveWorkerImportConstraint(error)) {
      throw new AdminImportError(
        "import_in_progress",
        "Сейчас уже обрабатывается другой прайс. Дождитесь его завершения."
      );
    }
    throw error;
  }
}

export async function enqueueAdminImportPublish({
  importBatchId,
  adminUserId
}: {
  importBatchId: string;
  adminUserId: string;
}) {
  assertWorkerImportAvailable();
  const queued = await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({
        id: importBatches.id,
        status: importBatches.status,
        catalogVersionId: importBatches.catalogVersionId,
        report: importBatches.report,
        publishJobId: importBatches.publishJobId,
        phase: importBatches.phase
      })
      .from(importBatches)
      .where(eq(importBatches.id, importBatchId))
      .for("update")
      .limit(1);

    if (!batch) throw new AdminImportError("not_found", "Импорт не найден.");
    const report = toStoredReport(batch.report);
    const [catalogVersion] = batch.catalogVersionId
      ? await tx
          .select({ status: catalogVersions.status })
          .from(catalogVersions)
          .where(eq(catalogVersions.id, batch.catalogVersionId))
          .for("update")
          .limit(1)
      : [null];

    if (batch.publishJobId) {
      const [existingJob] = await tx
        .select({ status: backgroundJobs.status })
        .from(backgroundJobs)
        .where(and(eq(backgroundJobs.id, batch.publishJobId), eq(backgroundJobs.type, "publish_import")))
        .limit(1);

      const canRetryPublish =
        existingJob?.status === "failed" &&
        ((batch.status === "analyzed" && catalogVersion?.status === "draft" && report?.safety?.canPublish === true) ||
          (batch.status === "published" && catalogVersion?.status === "active"));
      if (canRetryPublish) {
        await tx
          .update(backgroundJobs)
          .set({
            status: "pending",
            progress: 0,
            result: null,
            error: null,
            attemptCount: 0,
            startedAt: null,
            finishedAt: null,
            lockedAt: null,
            lockedBy: null,
            leaseToken: null,
            heartbeatAt: null,
            availableAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(backgroundJobs.id, batch.publishJobId));

        await tx
          .update(importBatches)
          .set({
            phase: "publish_queued",
            stage: "Повторяем публикацию",
            progress: 0,
            lastErrorCode: null,
            lastErrorMessage: null,
            processingUpdatedAt: new Date()
          })
          .where(eq(importBatches.id, batch.id));

        return {
          importBatchId: batch.id,
          backgroundJobId: batch.publishJobId,
          created: true,
          auditAction: "import.publish_retried"
        };
      }
      if (existingJob?.status === "failed") {
        throw new AdminImportError("not_ready", "Этот импорт пока нельзя опубликовать.");
      }
      return { importBatchId: batch.id, backgroundJobId: batch.publishJobId, created: false, auditAction: null };
    }

    if (
      !batch.catalogVersionId ||
      batch.status !== "analyzed" ||
      catalogVersion?.status !== "draft" ||
      report?.safety?.canPublish !== true
    ) {
      throw new AdminImportError("not_ready", "Этот импорт пока нельзя опубликовать.");
    }

    const payload = { batchId: batch.id };
    const payloadVersion = validateBackgroundJobPayload("publish_import", payload);
    const [job] = await tx
      .insert(backgroundJobs)
      .values({
        type: "publish_import",
        payload,
        payloadHash: hashBackgroundJobPayload({ payload, payloadVersion }),
        idempotencyKey: `publish-import:${batch.id}`,
        requestedBy: adminUserId,
        correlationId: batch.id,
        maxAttempts: 3
      })
      .returning({ id: backgroundJobs.id });

    await tx
      .update(importBatches)
      .set({
        publishJobId: job.id,
        phase: "publish_queued",
        stage: "Публикация поставлена в очередь",
        progress: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        processingUpdatedAt: new Date()
      })
      .where(eq(importBatches.id, batch.id));

    return {
      importBatchId: batch.id,
      backgroundJobId: job.id,
      created: true,
      auditAction: "import.publish_requested"
    };
  });

  if (queued.auditAction) {
    await writeImportAuditSafely({
      adminUserId,
      action: queued.auditAction,
      entityType: "import_batch",
      entityId: queued.importBatchId,
      metadata: { backgroundJobId: queued.backgroundJobId }
    });
  }

  return {
    importBatchId: queued.importBatchId,
    backgroundJobId: queued.backgroundJobId,
    created: queued.created
  };
}

export async function getAdminImportPageData(selectedBatchId?: string) {
  const batches = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      analyzedAt: importBatches.analyzedAt,
      publishedAt: importBatches.publishedAt,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      fileHash: importBatches.fileHash,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase,
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .orderBy(desc(importBatches.createdAt))
    .limit(10);

  const blockingDraft = await getBlockingImportDraft();
  const requestedBatch =
    (selectedBatchId ? batches.find((batch) => batch.id === selectedBatchId) : null) ??
    (selectedBatchId ? await getImportBatchById(selectedBatchId) : null);
  const selectedRaw = selectImportBatchForAdminPage({
    blockingDraft,
    recentBatches: batches,
    requestedBatch
  });

  const selected = selectedRaw ? toAdminImportBatchSummary(selectedRaw) : null;
  const blockingDraftSummary = blockingDraft ? toAdminImportBatchSummary(blockingDraft) : null;
  const recentSummaries = mergeImportBatchSummaries(
    blockingDraftSummary ? [blockingDraftSummary, ...batches.map(toAdminImportBatchSummary)] : batches.map(toAdminImportBatchSummary)
  );
  const errors = selected
    ? await db
        .select({
          id: importErrors.id,
          rowNumber: importErrors.rowNumber,
          fieldName: importErrors.fieldName,
          code: importErrors.code,
          message: importErrors.message
        })
        .from(importErrors)
        .where(eq(importErrors.importBatchId, selected.id))
        .orderBy(asc(importErrors.rowNumber), asc(importErrors.createdAt))
        .limit(100)
    : [];

  return {
    batches: recentSummaries,
    selected,
    blockingDraft: blockingDraftSummary,
    hiddenBlockingDraft: Boolean(
      blockingDraftSummary && (!selected || selected.id !== blockingDraftSummary.id)
    ),
    errors
  };
}

export async function publishAdminImportBatch({
  importBatchId,
  adminUserId,
  perf
}: {
  importBatchId: string;
  adminUserId: string;
  perf?: ImportPerfLogger;
}) {
  const publish = async () => {
    const batch = await getImportBatchForAction(importBatchId);

    if (!batch.report) {
      throw new AdminImportError("not_ready", "Перед публикацией нужен предварительный отчёт.");
    }

    if (
      !batch.catalogVersionId ||
      batch.status !== "analyzed" ||
      batch.versionStatus !== "draft" ||
      batch.report.safety?.canPublish !== true ||
      batch.publishJobId
    ) {
      throw new AdminImportError("already_finalized", "Этот импорт уже нельзя опубликовать.");
    }

    let publishResult: Awaited<ReturnType<typeof publishCatalogVersion>>;

    try {
      publishResult = await publishCatalogVersion({
        catalogVersionId: batch.catalogVersionId,
        report: batch.report,
        perf
      });
    } catch (error) {
      await writeImportAuditSafely({
        adminUserId,
        action: "import.publish_failed",
        entityType: "catalog_version",
        entityId: batch.catalogVersionId,
        metadata: {
          importBatchId: batch.id,
          sourceFileName: batch.sourceFileName,
          error: error instanceof Error ? error.message : String(error),
          safety: error instanceof ImportSafetyError ? error.report : null
        }
      });

      if (error instanceof ImportSafetyError) {
        throw new AdminImportError("safety_blocked", error.message);
      }

      throw new AdminImportError(
        "publish_failed",
        error instanceof Error ? error.message : "Не удалось опубликовать импорт."
      );
    }

    await writeImportAuditSafely({
      adminUserId,
      action: "import.publish",
      entityType: "catalog_version",
      entityId: batch.catalogVersionId,
      metadata: {
        importBatchId: batch.id,
        sourceFileName: batch.sourceFileName,
        searchIndex: {
          status: "synced",
          indexUid: publishResult.indexUid,
          indexedCount: publishResult.indexedCount
        },
        previousActiveVersionId: publishResult.previousActiveVersionId,
        safety: publishResult.safety,
        report: toAuditReportSummary(batch.report)
      }
    });
  };

  return perf
    ? perf.measure("publish_action", publish)
    : publish();
}

export async function cancelAdminImportBatch({
  importBatchId,
  adminUserId
}: {
  importBatchId: string;
  adminUserId: string;
}) {
  let cancelled: {
    id: string;
    catalogVersionId: string | null;
    sourceFileName: string;
    report: StoredImportReport | null;
  } | null = null;
  try {
    cancelled = await db.transaction(async (tx) => {
      const [batch] = await tx
        .select({
          id: importBatches.id,
          catalogVersionId: importBatches.catalogVersionId,
          sourceFileName: importBatches.sourceFileName,
          status: importBatches.status,
          report: importBatches.report,
          fileHash: importBatches.fileHash,
          publishJobId: importBatches.publishJobId,
          phase: importBatches.phase
        })
        .from(importBatches)
        .where(eq(importBatches.id, importBatchId))
        .for("update")
        .limit(1);

      if (!batch) throw new AdminImportError("not_found", "Импорт не найден.");
      if (batch.status === "cancelled") return null;

      const [version] = batch.catalogVersionId
        ? await tx
            .select({ status: catalogVersions.status })
            .from(catalogVersions)
            .where(eq(catalogVersions.id, batch.catalogVersionId))
            .for("update")
            .limit(1)
        : [null];
      const report = toStoredReport(batch.report);
      const state = toImportStateBatch(
        { ...batch, versionStatus: version?.status ?? null },
        report
      );
      if (!canCancelImportStrict(state)) {
        throw new AdminImportError("already_finalized", "Этот импорт уже нельзя отменить.");
      }

      await tx
        .update(importBatches)
        .set({ status: "cancelled" })
        .where(eq(importBatches.id, batch.id));

      if (batch.catalogVersionId && version?.status === "draft") {
        await tx
          .update(catalogVersions)
          .set({ status: "rolled_back" })
          .where(and(eq(catalogVersions.id, batch.catalogVersionId), eq(catalogVersions.status, "draft")));
      }

      return {
        id: batch.id,
        catalogVersionId: batch.catalogVersionId,
        sourceFileName: batch.sourceFileName,
        report
      };
    });
  } catch (error) {
    if (error instanceof AdminImportError) throw error;
    throw new AdminImportError(
      "cancel_failed",
      error instanceof Error ? error.message : "Не удалось отменить импорт."
    );
  }

  if (cancelled) {
    await writeImportAuditSafely({
      adminUserId,
      action: "import.cancel",
      entityType: "catalog_version",
      entityId: cancelled.catalogVersionId,
      metadata: {
        importBatchId: cancelled.id,
        sourceFileName: cancelled.sourceFileName,
        report: cancelled.report ? toAuditReportSummary(cancelled.report) : null
      }
    });
  }
}

function validateImportFile(file: File | null): asserts file is File {
  if (!file || file.size === 0) {
    throw new AdminImportError(file ? "empty_file" : "missing_file", "Выберите Excel-файл.");
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new AdminImportError(
      "file_too_large",
      `Файл больше ${formatMegabytes(MAX_IMPORT_FILE_SIZE_BYTES)} МБ.`
    );
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new AdminImportError("invalid_extension", "Загрузить можно только .xls или .xlsx.");
  }

  if (!ALLOWED_MIME_TYPES.has(file.type) && !GENERIC_MIME_TYPES.has(file.type)) {
    throw new AdminImportError("invalid_type", "Тип файла не похож на Excel-документ.");
  }
}

async function saveUploadedImportFile(file: File | null) {
  validateImportFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const storedFileName = buildImportUploadStorageFileName({
    originalName: file.name,
    fileHash
  });
  const uploadDir = getImportUploadDir();
  const filePath = getImportUploadFilePath(storedFileName);

  await mkdir(uploadDir, { recursive: true });
  await writeFile(filePath, buffer);

  return {
    filePath,
    storagePath: getImportStoragePath(filePath),
    originalName: file.name,
    fileHash,
    size: file.size
  };
}

export function buildImportUploadStorageFileName({
  originalName,
  fileHash,
  timestamp = Date.now(),
  storageId = randomUUID()
}: {
  originalName: string;
  fileHash: string;
  timestamp?: number;
  storageId?: string;
}) {
  const extension = path.extname(originalName).toLowerCase();
  const safeBaseName = path
    .basename(originalName, extension)
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${timestamp}-${storageId}-${fileHash.slice(0, 12)}-${safeBaseName || "catalog"}${extension}`;
}

async function removeRejectedUploadFileSafely(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code !== "ENOENT") {
      console.error("[admin/import] rejected_upload_cleanup_failed", { fileName: path.basename(filePath) });
    }
  }
}

function assertWorkerImportAvailable() {
  if (!isImportWorkerModeAvailable()) {
    throw new AdminImportError(
      "worker_unavailable",
      "Фоновая обработка импорта сейчас недоступна. Попробуйте позже."
    );
  }
}

async function assertImportCanStart(fileHash: string) {
  const blocker = await getImportStartBlocker(fileHash);

  if (blocker?.type === "blocking_draft") {
    throw new AdminImportError(
      "import_in_progress",
      "Уже есть подготовленный черновик импорта. Опубликуйте или отмените его перед новой загрузкой.",
      { blockingBatchId: blocker.batch.id }
    );
  }

  if (blocker?.type === "duplicate_file") {
    throw new AdminImportError(
      "duplicate_file",
      "Файл с таким содержимым уже загружался. Повторная загрузка заблокирована.",
      { duplicateBatchId: blocker.batch.id }
    );
  }
}

export async function getImportStartBlocker(fileHash: string): Promise<ImportStartBlocker | null> {
  const [runningWorkerImport] = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      analyzedAt: importBatches.analyzedAt,
      publishedAt: importBatches.publishedAt,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      fileHash: importBatches.fileHash,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase,
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .where(and(eq(importBatches.status, "uploaded"), inArray(importBatches.phase, ["queued", "analyzing", "retrying"])))
    .limit(1);

  if (runningWorkerImport) {
    return { type: "blocking_draft", batch: runningWorkerImport };
  }

  const blockingDraft = await getBlockingImportDraft();
  if (blockingDraft) {
    return {
      type: "blocking_draft",
      batch: blockingDraft
    };
  }

  const duplicateFile = await getDuplicateFileBlocker(fileHash);
  if (duplicateFile) {
    return {
      type: "duplicate_file",
      batch: duplicateFile
    };
  }

  return null;
}

function isActiveWorkerImportConstraint(error: unknown) {
  let candidate = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== "object") return false;
    if (
      "constraint_name" in candidate &&
      (candidate as { constraint_name?: unknown }).constraint_name === "import_batches_one_active_worker_analyze"
    ) {
      return true;
    }
    candidate = "cause" in candidate ? (candidate as { cause?: unknown }).cause : null;
  }

  return false;
}

export async function getBlockingImportDraft(exceptCatalogVersionId?: string) {
  const draftRows = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      analyzedAt: importBatches.analyzedAt,
      publishedAt: importBatches.publishedAt,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      fileHash: importBatches.fileHash,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase,
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .innerJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .where(eq(catalogVersions.status, "draft"))
    .orderBy(desc(importBatches.createdAt))
    .limit(100);

  return (
    draftRows.find(
      (batch) =>
        batch.catalogVersionId !== exceptCatalogVersionId && isBlockingImportDraft(batch)
    ) ?? null
  );
}

export async function getDuplicateFileBlocker(fileHash: string) {
  const sameFileRows = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      analyzedAt: importBatches.analyzedAt,
      publishedAt: importBatches.publishedAt,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      fileHash: importBatches.fileHash,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase,
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .where(eq(importBatches.fileHash, fileHash))
    .orderBy(desc(importBatches.createdAt))
    .limit(50);

  return sameFileRows.find((batch) => isDuplicateFileBlockerForHash(batch, fileHash)) ?? null;
}

async function getImportBatchById(importBatchId: string) {
  const [batch] = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      analyzedAt: importBatches.analyzedAt,
      publishedAt: importBatches.publishedAt,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      fileHash: importBatches.fileHash,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase,
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .where(eq(importBatches.id, importBatchId))
    .limit(1);

  return batch ?? null;
}

async function getImportBatchForAction(importBatchId: string) {
  const [batch] = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      fileHash: importBatches.fileHash,
      publishJobId: importBatches.publishJobId,
      phase: importBatches.phase
    })
    .from(importBatches)
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .where(eq(importBatches.id, importBatchId))
    .limit(1);

  if (!batch) {
    throw new AdminImportError("not_found", "Импорт не найден.");
  }

  return {
    ...batch,
    report: toStoredReport(batch.report)
  };
}

function toAdminImportBatchSummary(
  batch: ImportBatchRecord
): AdminImportBatchSummary {
  const report = toStoredReport(batch.report);
  const state = toImportStateBatch(batch, report);
  const canRetryPublishedSearch =
    batch.status === "published" &&
    batch.versionStatus === "active" &&
    Boolean(batch.publishJobId) &&
    batch.phase === "failed";

  return {
    ...batch,
    report,
    publishJobId: batch.publishJobId ?? null,
    phase: batch.phase ?? null,
    canPublish:
      (canPublishImport(batch.status, batch.versionStatus, report) || canRetryPublishedSearch) &&
      (!batch.publishJobId || batch.phase === "failed") &&
      batch.phase !== "publishing" &&
      batch.phase !== "publish_queued",
    canCancel: canCancelImportForUi(state),
    canCancelStrict: canCancelImportStrict(state),
    canCancelForUi: canCancelImportForUi(state),
    isBlockingDraft: isBlockingImportDraft(state),
    isFinalized: isFinalizedImport(state)
  };
}

export function canCancelImport(status: string, versionStatus: string | null) {
  return canCancelImportForUi({
    catalogVersionId: versionStatus === "draft" ? "__legacy_unknown_version__" : null,
    status,
    versionStatus
  });
}

function toImportStateBatch(
  batch: Pick<
    ImportBatchRecord,
    "id" | "catalogVersionId" | "status" | "versionStatus" | "fileHash" | "publishJobId" | "phase"
  >,
  report?: StoredImportReport | null
): ImportStateBatch {
  return {
    id: batch.id,
    catalogVersionId: batch.catalogVersionId,
    status: batch.status,
    versionStatus: batch.versionStatus,
    fileHash: batch.fileHash,
    publishJobId: batch.publishJobId,
    phase: batch.phase,
    report
  };
}

function mergeImportBatchSummaries(batches: AdminImportBatchSummary[]) {
  const seen = new Set<string>();
  const merged: AdminImportBatchSummary[] = [];

  for (const batch of batches) {
    if (seen.has(batch.id)) {
      continue;
    }

    seen.add(batch.id);
    merged.push(batch);
  }

  return merged;
}

export function normalizeStoredImportReport(value: unknown): StoredImportReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeReport = value as Partial<StoredImportReport> & Record<string, unknown>;
  if (
    typeof maybeReport.addedCount !== "number" ||
    typeof maybeReport.updatedCount !== "number" ||
    typeof maybeReport.archivedCount !== "number" ||
    typeof maybeReport.errorRows !== "number" ||
    typeof maybeReport.reviewRows !== "number"
  ) {
    return null;
  }

  return {
    ...(maybeReport as StoredImportReport),
    fileName: stringValue(maybeReport.fileName, ""),
    selectedSheetName: stringValue(maybeReport.selectedSheetName, ""),
    sheets: arrayValue(maybeReport.sheets),
    totalRows: numberValue(maybeReport.totalRows),
    productCandidateRows: numberValue(maybeReport.productCandidateRows),
    parsedRows: numberValue(maybeReport.parsedRows),
    validRows: numberValue(maybeReport.validRows),
    reviewRows: numberValue(maybeReport.reviewRows),
    errorRows: numberValue(maybeReport.errorRows),
    skippedRows: numberValue(maybeReport.skippedRows),
    addedCount: numberValue(maybeReport.addedCount),
    updatedCount: numberValue(maybeReport.updatedCount),
    archivedCount: numberValue(maybeReport.archivedCount),
    unchangedCount: numberValue(maybeReport.unchangedCount),
    issueCounts: normalizeIssueCounts(maybeReport.issueCounts),
    priceChanges: normalizePriceChanges(maybeReport),
    safety: normalizeSafetyReport(maybeReport.safety),
    examples: normalizeExamples(maybeReport.examples),
    autoCategorizationPreview: normalizeAutoCategorizationPreview(maybeReport),
    categorization: normalizeCategorizationSummary(maybeReport.categorization)
  };
}

function toStoredReport(value: unknown): StoredImportReport | null {
  return normalizeStoredImportReport(value);
}

function normalizePriceChanges(report: Record<string, unknown>) {
  const priceChanges = recordValue(report.priceChanges);

  return {
    existingWithPriceCount: numberValue(
      priceChanges?.existingWithPriceCount,
      report.existingWithPriceCount
    ),
    existingPriceUpdatedCount: numberValue(
      priceChanges?.existingPriceUpdatedCount,
      report.pricesChanged
    ),
    increasedCount: numberValue(priceChanges?.increasedCount, report.pricesIncreased),
    decreasedCount: numberValue(priceChanges?.decreasedCount, report.pricesDecreased),
    unchangedCount: numberValue(priceChanges?.unchangedCount, report.pricesUnchanged)
  };
}

function normalizeAutoCategorizationPreview(report: Record<string, unknown>) {
  const preview = recordValue(report.autoCategorizationPreview);
  const shadowHigh = numberValue(
    preview?.shadowHigh,
    preview?.highConfidence,
    report.newHighConfidence
  );
  const shadowMedium = numberValue(preview?.shadowMedium, preview?.mediumConfidence);
  const shadowLow = numberValue(preview?.shadowLow, preview?.lowConfidence);
  const wouldAutoPublish = numberValue(preview?.wouldAutoPublish, report.expectedPublicCount);
  const wouldRequireReview = numberValue(preview?.wouldRequireReview, report.newNeedsReview);

  return {
    totalProducts: numberValue(preview?.totalProducts, report.productCandidateRows),
    legacyMatched: numberValue(preview?.legacyMatched),
    legacyNeedsReview: numberValue(preview?.legacyNeedsReview),
    existingCategoryPreserved: numberValue(
      preview?.existingCategoryPreserved,
      report.existingInherited
    ),
    shadowHigh,
    shadowMedium,
    shadowLow,
    wouldAutoPublish,
    wouldRequireReview,
    highConfidence: numberValue(preview?.highConfidence, shadowHigh),
    mediumConfidence: numberValue(preview?.mediumConfidence, shadowMedium),
    lowConfidence: numberValue(preview?.lowConfidence, shadowLow),
    needsReview: numberValue(preview?.needsReview, wouldRequireReview),
    emptyName: numberValue(preview?.emptyName),
    averageConfidence: numberValue(preview?.averageConfidence),
    automationPotential: numberValue(preview?.automationPotential),
    threshold: numberValue(preview?.threshold, 0.92),
    sources: arrayValue(preview?.sources),
    topUnresolvedGroups: arrayValue(preview?.topUnresolvedGroups),
    highConfidenceExamples: arrayValue(preview?.highConfidenceExamples),
    lowConfidenceExamples: arrayValue(preview?.lowConfidenceExamples),
    dangerousGroups: arrayValue(preview?.dangerousGroups)
  };
}

function normalizeSafetyReport(value: unknown): StoredImportReport["safety"] {
  const safety = recordValue(value);
  if (!safety) {
    return undefined;
  }

  const checks = arrayValue(safety.checks)
    .map((check) => normalizeSafetyCheck(check))
    .filter((check) => check !== null);
  const blockingCount = numberValue(
    safety.blockingCount,
    checks.filter((check) => check.status === "blocked").length
  );
  const warningCount = numberValue(
    safety.warningCount,
    checks.filter((check) => check.status === "warning").length
  );

  return {
    canPublish:
      typeof safety.canPublish === "boolean"
        ? safety.canPublish
        : checks.length > 0 && blockingCount === 0,
    blockingCount,
    warningCount,
    checks
  };
}

function normalizeSafetyCheck(value: unknown) {
  const check = recordValue(value);
  if (!check) {
    return null;
  }

  return {
    code: stringValue(check.code, "unknown"),
    status: safetyStatusValue(check.status),
    message: stringValue(check.message, "Нет данных."),
    currentValue:
      typeof check.currentValue === "boolean"
        ? check.currentValue
        : numberValue(check.currentValue),
    threshold: typeof check.threshold === "number" ? check.threshold : undefined
  };
}

function normalizeExamples(value: unknown): StoredImportReport["examples"] {
  const examples = recordValue(value);

  return {
    valid: arrayValue(examples?.valid),
    needsReview: arrayValue(examples?.needsReview),
    errors: arrayValue(examples?.errors)
  };
}

function normalizeIssueCounts(value: unknown) {
  const counts = recordValue(value);
  if (!counts) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, numberValue(count)])
  );
}

function normalizeCategorizationSummary(value: unknown): StoredImportReport["categorization"] {
  const categorization = recordValue(value);
  if (!categorization) {
    return undefined;
  }

  return {
    matchedRows: numberValue(categorization.matchedRows),
    unmatchedRows: numberValue(categorization.unmatchedRows),
    activeRules: numberValue(categorization.activeRules)
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue<T = never>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function safetyStatusValue(value: unknown): ImportSafetyCheckStatus {
  return value === "passed" || value === "warning" || value === "blocked"
    ? value
    : "warning";
}

function toAuditReportSummary(report: StoredImportReport | ImportPreviewReport) {
  return {
    addedCount: report.addedCount,
    updatedCount: report.updatedCount,
    archivedCount: report.archivedCount,
    errorRows: report.errorRows,
    reviewRows: report.reviewRows,
    totalRows: report.totalRows,
    selectedSheetName: report.selectedSheetName,
    priceChanges: report.priceChanges,
    safety: report.safety
      ? {
          canPublish: report.safety.canPublish,
          blockingCount: report.safety.blockingCount,
          warningCount: report.safety.warningCount,
          blockedChecks: report.safety.checks
            .filter((check) => check.status === "blocked")
            .map((check) => check.code),
          warningChecks: report.safety.checks
            .filter((check) => check.status === "warning")
            .map((check) => check.code)
        }
      : null,
    autoCategorizationPreview: report.autoCategorizationPreview
      ? {
          totalProducts: report.autoCategorizationPreview.totalProducts,
          legacyMatched: report.autoCategorizationPreview.legacyMatched,
          legacyNeedsReview: report.autoCategorizationPreview.legacyNeedsReview,
          existingCategoryPreserved:
            report.autoCategorizationPreview.existingCategoryPreserved,
          shadowHigh: report.autoCategorizationPreview.shadowHigh,
          shadowMedium: report.autoCategorizationPreview.shadowMedium,
          shadowLow: report.autoCategorizationPreview.shadowLow,
          wouldAutoPublish: report.autoCategorizationPreview.wouldAutoPublish,
          wouldRequireReview: report.autoCategorizationPreview.wouldRequireReview,
          highConfidence: report.autoCategorizationPreview.highConfidence,
          mediumConfidence: report.autoCategorizationPreview.mediumConfidence,
          lowConfidence: report.autoCategorizationPreview.lowConfidence,
          needsReview: report.autoCategorizationPreview.needsReview,
          automationPotential: report.autoCategorizationPreview.automationPotential
        }
      : null
  };
}

function formatMegabytes(bytes: number) {
  return Math.round(bytes / 1024 / 1024);
}

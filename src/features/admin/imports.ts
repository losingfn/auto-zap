import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adminUsers,
  auditLogs,
  catalogVersions,
  importBatches,
  importErrors
} from "@/db/schema";
import { createDraftImport } from "@/features/import/draft-service";
import { publishCatalogVersion } from "@/features/import/publish-service";
import { ImportSafetyError } from "@/features/import/safety";
import type { ImportPreviewReport } from "@/features/import/types";

const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const IMPORT_UPLOAD_DIR = path.join(process.cwd(), "data", "imports", "uploads");
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
  | "already_finalized";

export class AdminImportError extends Error {
  constructor(
    public readonly code: AdminImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AdminImportError";
  }
}

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
};

export type AdminImportRowError = {
  id: string;
  rowNumber: number | null;
  fieldName: string | null;
  code: string;
  message: string;
};

export async function createAdminDraftImportFromUpload({
  file,
  adminUserId
}: {
  file: File | null;
  adminUserId: string;
}) {
  const storedFile = await saveUploadedImportFile(file);
  await assertImportCanStart(storedFile.fileHash);

  try {
    const result = await createDraftImport({
      filePath: storedFile.filePath,
      fileBuffer: storedFile.buffer,
      sourceFileName: storedFile.originalName,
      fileHash: storedFile.fileHash,
      uploadedBy: adminUserId,
      storagePath: storedFile.storagePath
    });

    await db.insert(auditLogs).values({
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
    console.error("[admin/import] analysis_failed", {
      sourceFileName: storedFile.originalName,
      fileSizeBytes: storedFile.size,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    await db.insert(auditLogs).values({
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
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .leftJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .orderBy(desc(importBatches.createdAt))
    .limit(10);

  const selectedRaw =
    (selectedBatchId ? batches.find((batch) => batch.id === selectedBatchId) : null) ??
    (selectedBatchId ? await getImportBatchById(selectedBatchId) : null) ??
    batches[0] ??
    null;

  const selected = selectedRaw ? toAdminImportBatchSummary(selectedRaw) : null;
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
    batches: batches.map(toAdminImportBatchSummary),
    selected,
    errors
  };
}

export async function publishAdminImportBatch({
  importBatchId,
  adminUserId
}: {
  importBatchId: string;
  adminUserId: string;
}) {
  const batch = await getActionableImportBatch(importBatchId);

  if (!batch.report) {
    throw new AdminImportError("not_ready", "Перед публикацией нужен предварительный отчёт.");
  }

  if (batch.status !== "analyzed" || batch.versionStatus !== "draft") {
    throw new AdminImportError("already_finalized", "Этот импорт уже нельзя опубликовать.");
  }

  let publishResult: Awaited<ReturnType<typeof publishCatalogVersion>>;

  try {
    publishResult = await publishCatalogVersion({
      catalogVersionId: batch.catalogVersionId,
      report: batch.report
    });
  } catch (error) {
    await db.insert(auditLogs).values({
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

  await db.insert(auditLogs).values({
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
}

export async function cancelAdminImportBatch({
  importBatchId,
  adminUserId
}: {
  importBatchId: string;
  adminUserId: string;
}) {
  const batch = await getActionableImportBatch(importBatchId);

  if (batch.status !== "analyzed" || batch.versionStatus !== "draft") {
    throw new AdminImportError("already_finalized", "Этот импорт уже нельзя отменить.");
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(importBatches)
        .set({ status: "cancelled" })
        .where(eq(importBatches.id, batch.id));

      await tx
        .update(catalogVersions)
        .set({ status: "rolled_back" })
        .where(eq(catalogVersions.id, batch.catalogVersionId));

      await tx.insert(auditLogs).values({
        adminUserId,
        action: "import.cancel",
        entityType: "catalog_version",
        entityId: batch.catalogVersionId,
        metadata: {
          importBatchId: batch.id,
          sourceFileName: batch.sourceFileName,
          report: batch.report ? toAuditReportSummary(batch.report) : null
        }
      });
    });
  } catch (error) {
    throw new AdminImportError(
      "cancel_failed",
      error instanceof Error ? error.message : "Не удалось отменить импорт."
    );
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
  const extension = path.extname(file.name).toLowerCase();
  const safeBaseName = path
    .basename(file.name, extension)
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const storedFileName = `${Date.now()}-${fileHash.slice(0, 12)}-${safeBaseName || "catalog"}${extension}`;
  const filePath = path.join(IMPORT_UPLOAD_DIR, storedFileName);

  await mkdir(IMPORT_UPLOAD_DIR, { recursive: true });
  await writeFile(filePath, buffer);

  return {
    filePath,
    storagePath: path.relative(process.cwd(), filePath),
    originalName: file.name,
    fileHash,
    size: file.size,
    buffer
  };
}

async function assertImportCanStart(fileHash: string) {
  const [openDraft] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .innerJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .where(and(eq(importBatches.status, "analyzed"), eq(catalogVersions.status, "draft")))
    .limit(1);

  if (openDraft) {
    throw new AdminImportError(
      "import_in_progress",
      "Уже есть подготовленный черновик импорта. Опубликуйте или отмените его перед новой загрузкой."
    );
  }

  const [sameFile] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.fileHash, fileHash),
        inArray(importBatches.status, ["uploaded", "analyzed", "published"])
      )
    )
    .limit(1);

  if (sameFile) {
    throw new AdminImportError(
      "duplicate_file",
      "Файл с таким содержимым уже загружался. Повторная загрузка заблокирована."
    );
  }
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

async function getActionableImportBatch(importBatchId: string) {
  const [batch] = await db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      report: importBatches.report,
      versionStatus: catalogVersions.status
    })
    .from(importBatches)
    .innerJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .where(and(eq(importBatches.id, importBatchId), eq(catalogVersions.status, "draft")))
    .limit(1);

  if (!batch || !batch.catalogVersionId) {
    throw new AdminImportError("not_found", "Черновик импорта не найден.");
  }

  return {
    ...batch,
    catalogVersionId: batch.catalogVersionId,
    report: toStoredReport(batch.report)
  };
}

function toAdminImportBatchSummary(
  batch: Awaited<ReturnType<typeof getImportBatchById>> extends infer T ? NonNullable<T> : never
): AdminImportBatchSummary {
  const report = toStoredReport(batch.report);
  const canChange = batch.status === "analyzed" && batch.versionStatus === "draft";

  return {
    ...batch,
    report,
    canPublish: canChange && report !== null && report.safety?.canPublish !== false,
    canCancel: canChange
  };
}

function toStoredReport(value: unknown): StoredImportReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeReport = value as Partial<StoredImportReport>;
  if (
    typeof maybeReport.addedCount !== "number" ||
    typeof maybeReport.updatedCount !== "number" ||
    typeof maybeReport.archivedCount !== "number" ||
    typeof maybeReport.errorRows !== "number" ||
    typeof maybeReport.reviewRows !== "number"
  ) {
    return null;
  }

  return maybeReport as StoredImportReport;
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

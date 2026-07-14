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
import type { ImportPreviewReport, ImportSafetyCheckStatus } from "@/features/import/types";

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
    unchangedCount: numberValue(priceChanges?.unchangedCount, report.pricesUnchanged),
    maxIncreaseAmount: numberValue(priceChanges?.maxIncreaseAmount, report.maxIncrease),
    maxIncreasePercent: numberValue(priceChanges?.maxIncreasePercent),
    maxDecreaseAmount: numberValue(priceChanges?.maxDecreaseAmount, report.maxDecrease),
    maxDecreasePercent: numberValue(priceChanges?.maxDecreasePercent),
    averageChangeAmount: numberValue(priceChanges?.averageChangeAmount),
    averageChangePercent: numberValue(
      priceChanges?.averageChangePercent,
      report.averagePercentChange
    )
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

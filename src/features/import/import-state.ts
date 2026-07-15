export type ImportStateReport = {
  safety?: {
    canPublish?: boolean | null;
  } | null;
} | null;

export type ImportStateBatch = {
  id?: string;
  catalogVersionId?: string | null;
  status: string;
  versionStatus: string | null;
  fileHash?: string | null;
  report?: unknown;
};

export type ImportStartBlocker =
  | {
      type: "blocking_draft";
      batch: ImportStateBatch;
    }
  | {
      type: "duplicate_file";
      batch: ImportStateBatch;
    };

const FINAL_IMPORT_STATUSES = new Set([
  "published",
  "cancelled",
  "archived",
  "rolled_back",
  "completed",
  "succeeded"
]);

const FINAL_CATALOG_VERSION_STATUSES = new Set(["active", "archived", "rolled_back"]);

const LEGACY_ORPHAN_CANCELABLE_STATUSES = new Set([
  "uploaded",
  "analyzed",
  "failed",
  "safety_blocked",
  "processing",
  "draft"
]);

const DUPLICATE_FILE_BLOCKING_STATUSES = new Set(["uploaded", "analyzed"]);

export function isFinalImportStatus(status: string) {
  return FINAL_IMPORT_STATUSES.has(status);
}

export function isFinalCatalogVersionStatus(status: string | null) {
  return status !== null && FINAL_CATALOG_VERSION_STATUSES.has(status);
}

export function isFinalizedImport(batch: ImportStateBatch) {
  return isFinalImportStatus(batch.status) || isFinalCatalogVersionStatus(batch.versionStatus);
}

export function isBlockingImportDraft(batch: ImportStateBatch) {
  return (
    Boolean(batch.catalogVersionId) &&
    batch.versionStatus === "draft" &&
    !isFinalImportStatus(batch.status)
  );
}

export function canCancelImportStrict(batch: ImportStateBatch) {
  if (isFinalizedImport(batch)) {
    return false;
  }

  if (isBlockingImportDraft(batch)) {
    return true;
  }

  return batch.versionStatus === null && LEGACY_ORPHAN_CANCELABLE_STATUSES.has(batch.status);
}

export function canCancelImportForUi(batch: ImportStateBatch) {
  return canCancelImportStrict(batch);
}

export function canPublishImport(status: string, versionStatus: string | null, report: ImportStateReport) {
  return status === "analyzed" && versionStatus === "draft" && report?.safety?.canPublish === true;
}

export function isBlockingDuplicateFileImport(batch: ImportStateBatch) {
  return isBlockingImportDraft(batch) && DUPLICATE_FILE_BLOCKING_STATUSES.has(batch.status);
}

export function isDuplicateFileBlockerForHash(batch: ImportStateBatch, fileHash: string | null) {
  return Boolean(fileHash && batch.fileHash === fileHash && isBlockingDuplicateFileImport(batch));
}

export function selectImportBatchForAdminPage<T extends ImportStateBatch>({
  blockingDraft,
  recentBatches,
  requestedBatch
}: {
  blockingDraft: T | null;
  recentBatches: T[];
  requestedBatch?: T | null;
}) {
  if (requestedBatch) {
    return requestedBatch;
  }

  return blockingDraft ?? recentBatches[0] ?? null;
}

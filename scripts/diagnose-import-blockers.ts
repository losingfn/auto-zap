import { existsSync, readFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { adminUsers, catalogVersions, importBatches } from "../src/db/schema";
import {
  canCancelImportForUi,
  canCancelImportStrict,
  canPublishImport,
  isBlockingDuplicateFileImport,
  isBlockingImportDraft,
  isFinalizedImport,
  normalizeStoredImportReport
} from "../src/features/admin/imports";
import {
  diagnoseImportDeadlock,
  getRecommendedSafeAction
} from "../src/features/import/import-diagnostics";
import { selectImportBatchForAdminPage } from "../src/features/import/import-state";

type DiagnosticImportRow = Awaited<ReturnType<typeof readRecentImportRows>>[number];

const limit = getLimit();

async function main() {
  const [recentRows, draftRows] = await Promise.all([
    readRecentImportRows(limit),
    readDraftImportRows()
  ]);
  const blockingDrafts = draftRows.filter((row) => isBlockingImportDraft(row));
  const blockingDraft = blockingDrafts[0] ?? null;
  const selectedBatch = selectImportBatchForAdminPage({
    blockingDraft,
    recentBatches: recentRows
  });
  const selectedBatchId = selectedBatch?.id ?? null;
  const blockingBatchId = blockingDraft?.id ?? null;
  const diagnosticRows = mergeRows([...draftRows, ...recentRows]).map((row) =>
    toDiagnosticRow(row, selectedBatchId, blockingBatchId)
  );
  const selectedDiagnosticRow =
    diagnosticRows.find((row) => row.id === selectedBatchId) ?? null;
  const blockingDiagnosticRow =
    diagnosticRows.find((row) => row.id === blockingBatchId) ?? null;
  const serverActionStaleRisk = detectServerActionStaleRisk();
  const diagnosis = diagnoseImportDeadlock({
    rows: diagnosticRows,
    selectedBatchId,
    serverActionStaleRisk
  });

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    limit,
    blockingDraftCount: blockingDrafts.length,
    selectedBatchId,
    blockingBatchId,
    hiddenBlockingDraft: Boolean(blockingBatchId && selectedBatchId !== blockingBatchId),
    diagnosis,
    recommendedSafeAction: getRecommendedSafeAction(diagnosis),
    serverActionStaleRisk,
    selectedBatch: selectedDiagnosticRow,
    blockingBatch: blockingDiagnosticRow,
    recentImportBatches: recentRows.map((row) =>
      toDiagnosticRow(row, selectedBatchId, blockingBatchId)
    ),
    allDraftCandidates: draftRows.map((row) =>
      toDiagnosticRow(row, selectedBatchId, blockingBatchId)
    )
  };

  console.log(JSON.stringify(output, null, 2));
}

async function readRecentImportRows(rowLimit: number) {
  return db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      fileHash: importBatches.fileHash,
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
    .limit(rowLimit);
}

async function readDraftImportRows() {
  return db
    .select({
      id: importBatches.id,
      catalogVersionId: importBatches.catalogVersionId,
      sourceFileName: importBatches.sourceFileName,
      status: importBatches.status,
      fileHash: importBatches.fileHash,
      createdAt: importBatches.createdAt,
      analyzedAt: importBatches.analyzedAt,
      publishedAt: importBatches.publishedAt,
      report: importBatches.report,
      versionStatus: catalogVersions.status,
      uploadedByName: adminUsers.fullName,
      uploadedByEmail: adminUsers.email
    })
    .from(importBatches)
    .innerJoin(catalogVersions, eq(catalogVersions.id, importBatches.catalogVersionId))
    .leftJoin(adminUsers, eq(adminUsers.id, importBatches.uploadedBy))
    .where(eq(catalogVersions.status, "draft"))
    .orderBy(desc(importBatches.createdAt));
}

function toDiagnosticRow(
  row: DiagnosticImportRow,
  selectedBatchId: string | null,
  blockingBatchId: string | null
) {
  const report = normalizeStoredImportReport(row.report);
  const state = {
    id: row.id,
    catalogVersionId: row.catalogVersionId,
    status: row.status,
    versionStatus: row.versionStatus,
    fileHash: row.fileHash,
    report
  };
  const safety = report?.safety ?? null;

  return {
    id: row.id,
    sourceFileName: row.sourceFileName,
    fileHash: row.fileHash,
    status: row.status,
    catalogVersionId: row.catalogVersionId,
    versionStatus: row.versionStatus,
    createdAt: row.createdAt?.toISOString() ?? null,
    analyzedAt: row.analyzedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    uploadedByName: row.uploadedByName,
    uploadedByEmail: row.uploadedByEmail,
    hasReport: Boolean(report),
    hasSafetyReport: Boolean(safety),
    safetyCanPublish: safety?.canPublish ?? null,
    canPublishImport: canPublishImport(row.status, row.versionStatus, report),
    canCancelStrict: canCancelImportStrict(state),
    canCancelForUi: canCancelImportForUi(state),
    isBlockingDraft: isBlockingImportDraft(state),
    isDuplicateHashBlocker: isBlockingDuplicateFileImport(state),
    isFinalized: isFinalizedImport(state),
    whySelected: getSelectedReason(row.id, selectedBatchId, blockingBatchId),
    whyBlocking: getBlockingReason(state)
  };
}

function getSelectedReason(
  id: string,
  selectedBatchId: string | null,
  blockingBatchId: string | null
) {
  if (id !== selectedBatchId) {
    return null;
  }

  if (id === blockingBatchId) {
    return "selected because it is the current blocking draft";
  }

  return "selected as the latest recent import because no blocking draft was found";
}

function getBlockingReason(row: Parameters<typeof isBlockingImportDraft>[0]) {
  if (isBlockingImportDraft(row)) {
    return "catalog version is draft and import status is non-final";
  }

  if (row.versionStatus !== "draft") {
    return "catalog version is not draft";
  }

  if (!row.catalogVersionId) {
    return "import batch is not linked to a catalog version";
  }

  if (isFinalizedImport(row)) {
    return "import or catalog version is finalized";
  }

  return "not blocking by current resolver";
}

function mergeRows(rows: DiagnosticImportRow[]) {
  const seen = new Set<string>();
  const merged: DiagnosticImportRow[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }

    seen.add(row.id);
    merged.push(row);
  }

  return merged;
}

function detectServerActionStaleRisk() {
  const pagePath = "src/app/admin/(panel)/import/page.tsx";
  if (!existsSync(pagePath)) {
    return false;
  }

  const source = readFileSync(pagePath, "utf8");
  return /action=\{cancelImportAction\}/.test(source) && !/ImportCancelButton/.test(source);
}

function getLimit() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  if (!limitArg) {
    return 25;
  }

  const parsed = Number(limitArg.slice("--limit=".length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : 25;
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        readOnly: true,
        error: formatError(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});

function formatError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const errorWithCause = error as Error & {
    code?: string;
    cause?: unknown;
  };

  return {
    name: error.name,
    message: error.message,
    code: errorWithCause.code,
    cause: errorWithCause.cause ? formatError(errorWithCause.cause) : undefined
  };
}

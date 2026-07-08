import type {
  AnalyzedImportRow,
  ExistingProductSnapshot,
  ExcelSheetSummary,
  ImportPreviewReport
} from "./types";

export interface BuildReportInput {
  fileName: string;
  selectedSheetName: string;
  sheets: ExcelSheetSummary[];
  rows: AnalyzedImportRow[];
  existingProducts?: ExistingProductSnapshot[];
}

export function buildImportReport(input: BuildReportInput): ImportPreviewReport {
  const existingByCode = new Map(
    (input.existingProducts ?? []).map((product) => [product.shopCode, product])
  );
  const incomingCodes = new Set(
    input.rows
      .filter((row) => row.shopCode && row.status !== "error" && row.status !== "skipped")
      .map((row) => row.shopCode!)
  );

  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const row of input.rows) {
    if (!row.shopCode || row.status !== "valid") {
      continue;
    }

    const existing = existingByCode.get(row.shopCode);
    if (!existing) {
      addedCount += 1;
      continue;
    }

    const priceChanged = row.price !== null && Math.abs(existing.price - row.price) > 0.009;
    const nameChanged = existing.name.trim() !== (row.name ?? "").trim();
    if (priceChanged || nameChanged) {
      updatedCount += 1;
    } else {
      unchangedCount += 1;
    }
  }

  const archivedCount = [...existingByCode.keys()].filter((code) => !incomingCodes.has(code)).length;
  const issueCounts: Record<string, number> = {};
  for (const row of input.rows) {
    for (const issue of row.issues) {
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    }
  }

  const productCandidateRows = input.rows.filter((row) => row.status !== "skipped").length;
  const parsedRows = input.rows.filter((row) => row.shopCode !== null).length;
  const validRows = input.rows.filter((row) => row.status === "valid").length;
  const reviewRows = input.rows.filter((row) => row.status === "needs_review").length;
  const errorRows = input.rows.filter((row) => row.status === "error").length;
  const skippedRows = input.rows.filter((row) => row.status === "skipped").length;

  return {
    fileName: input.fileName,
    selectedSheetName: input.selectedSheetName,
    sheets: input.sheets,
    totalRows: input.rows.length,
    productCandidateRows,
    parsedRows,
    validRows,
    reviewRows,
    errorRows,
    skippedRows,
    addedCount,
    updatedCount,
    archivedCount,
    unchangedCount,
    issueCounts,
    examples: {
      valid: input.rows.filter((row) => row.status === "valid").slice(0, 5),
      needsReview: input.rows.filter((row) => row.status === "needs_review").slice(0, 5),
      errors: input.rows.filter((row) => row.status === "error").slice(0, 10)
    }
  };
}

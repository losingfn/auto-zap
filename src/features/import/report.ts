import type {
  AnalyzedImportRow,
  ExistingProductSnapshot,
  ExcelSheetSummary,
  ImportPriceChangeReport,
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
  const priceChanges = buildPriceChangeReport(input.rows, existingByCode);

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
    priceChanges,
    examples: {
      valid: input.rows.filter((row) => row.status === "valid").slice(0, 5),
      needsReview: input.rows.filter((row) => row.status === "needs_review").slice(0, 5),
      errors: input.rows.filter((row) => row.status === "error").slice(0, 10)
    }
  };
}

export function buildPriceChangeReport(
  rows: AnalyzedImportRow[],
  existingByCode: Map<string, ExistingProductSnapshot>
): ImportPriceChangeReport {
  let existingWithPriceCount = 0;
  let existingPriceUpdatedCount = 0;
  let increasedCount = 0;
  let decreasedCount = 0;
  let unchangedCount = 0;
  let maxIncreaseAmount = 0;
  let maxIncreasePercent = 0;
  let maxDecreaseAmount = 0;
  let maxDecreasePercent = 0;
  let totalChangeAmount = 0;
  let totalChangePercent = 0;

  for (const row of rows) {
    if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
      continue;
    }

    const existing = existingByCode.get(row.shopCode);
    if (!existing || existing.price <= 0) {
      continue;
    }

    existingWithPriceCount += 1;
    const changeAmount = row.price - existing.price;
    const changePercent = changeAmount / existing.price;
    totalChangeAmount += changeAmount;
    totalChangePercent += changePercent;

    if (Math.abs(changeAmount) <= 0.009) {
      unchangedCount += 1;
      continue;
    }

    existingPriceUpdatedCount += 1;
    if (changeAmount > 0) {
      increasedCount += 1;
      maxIncreaseAmount = Math.max(maxIncreaseAmount, changeAmount);
      maxIncreasePercent = Math.max(maxIncreasePercent, changePercent);
    } else {
      decreasedCount += 1;
      maxDecreaseAmount = Math.min(maxDecreaseAmount, changeAmount);
      maxDecreasePercent = Math.min(maxDecreasePercent, changePercent);
    }
  }

  return {
    existingWithPriceCount,
    existingPriceUpdatedCount,
    increasedCount,
    decreasedCount,
    unchangedCount,
    maxIncreaseAmount,
    maxIncreasePercent,
    maxDecreaseAmount,
    maxDecreasePercent,
    averageChangeAmount:
      existingWithPriceCount > 0 ? totalChangeAmount / existingWithPriceCount : 0,
    averageChangePercent:
      existingWithPriceCount > 0 ? totalChangePercent / existingWithPriceCount : 0
  };
}

import path from "node:path";
import {
  buildDefaultCategorizationContext,
  categorizeProductName,
  getCategorizationConfidenceBucket
} from "../src/features/categorization/engine";
import { AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD } from "../src/features/categorization/types";
import { analyzeImportFile } from "../src/features/import/analyze";
import type { AnalyzedImportRow } from "../src/features/import/types";

const [, , inputPath, selectedSheetName] = process.argv;

if (!inputPath) {
  console.error("Usage: pnpm import:check <path-to-catalog.xls|xlsx> [sheetName]");
  process.exit(1);
}

const result = analyzeImportFile(path.resolve(inputPath), { selectedSheetName });
const dryRun = buildDryRunSummary(result.rows, result.report);

console.log(
  JSON.stringify(
    {
      report: result.report,
      dryRun,
      note: "This command validates and previews import only. It does not write to PostgreSQL."
    },
    null,
    2
  )
);

function buildDryRunSummary(
  rows: AnalyzedImportRow[],
  report: ReturnType<typeof analyzeImportFile>["report"]
) {
  const context = buildDefaultCategorizationContext();
  const unresolvedReasons = new Map<string, number>();
  const unresolvedGroups = new Map<string, { count: number; examples: string[] }>();

  let shadowHigh = 0;
  let shadowMedium = 0;
  let shadowLow = 0;
  let wouldAutoPublish = 0;
  let wouldRequireReview = 0;
  let fastenersAppears = false;

  for (const row of rows) {
    if (!isProductCandidate(row)) {
      continue;
    }

    const result = categorizeProductName(`${row.shopCode ?? ""} ${row.name || row.rawName}`, context);
    const bucket = getCategorizationConfidenceBucket(result);
    if (bucket === "high") {
      shadowHigh += 1;
    } else if (bucket === "medium") {
      shadowMedium += 1;
    } else {
      shadowLow += 1;
    }

    if (result.target?.categorySlug === "krepezh") {
      fastenersAppears = true;
    }

    if (wouldAutoPublishInDryRun(row, result)) {
      wouldAutoPublish += 1;
      continue;
    }

    wouldRequireReview += 1;
    unresolvedReasons.set(result.source, (unresolvedReasons.get(result.source) ?? 0) + 1);
    const key = row.shopCode?.split("-")[0]?.trim().toUpperCase() || "unknown";
    const group = unresolvedGroups.get(key) ?? { count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 5) {
      group.examples.push(`${row.shopCode ?? "NO_CODE"} ${row.name || row.rawName}`.trim());
    }
    unresolvedGroups.set(key, group);
  }

  return {
    totalRows: report.totalRows,
    parsedRows: report.parsedRows,
    validRows: report.validRows,
    existingProducts: 0,
    existingUpdated: report.updatedCount,
    priceChanged: report.priceChanges.existingPriceUpdatedCount,
    pricesIncreased: report.priceChanges.increasedCount,
    pricesDecreased: report.priceChanges.decreasedCount,
    newProducts: report.addedCount,
    newActive: wouldAutoPublish,
    newUnresolved: wouldRequireReview,
    archiveCandidates: report.archivedCount,
    invalidRows: report.errorRows,
    duplicates: report.issueCounts.duplicate_code ?? 0,
    safetyStatus: "dry_run_only",
    wouldPublish: false,
    expectedPublicCount: wouldAutoPublish,
    expectedSearchDocumentCount: wouldAutoPublish,
    shadowHigh,
    shadowMedium,
    shadowLow,
    wouldAutoPublish,
    wouldRequireReview,
    unresolvedReasons: Object.fromEntries(unresolvedReasons),
    topUnresolvedGroups: [...unresolvedGroups.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, 12),
    fastenersAppears,
    taxonomyCreatedCount: 0
  };
}

function wouldAutoPublishInDryRun(
  row: AnalyzedImportRow,
  result: ReturnType<typeof categorizeProductName>
) {
  return Boolean(
    row.status !== "needs_review" &&
      !result.needsReview &&
      result.target?.categorySlug &&
      result.target.subcategorySlug &&
      result.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD
  );
}

function isProductCandidate(row: AnalyzedImportRow) {
  return Boolean(
    row.shopCode &&
      row.price !== null &&
      row.status !== "error" &&
      row.status !== "skipped"
  );
}

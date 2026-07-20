import path from "node:path";
import {
  buildDefaultCategorizationContext,
  categorizeProductName,
  getCategorizationConfidenceBucket,
  normalizeForCategorization
} from "../src/features/categorization/engine";
import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationResult,
  type CategorizationSource
} from "../src/features/categorization/types";
import { analyzeImportFile } from "../src/features/import/analyze";
import type { AnalyzedImportRow } from "../src/features/import/types";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: pnpm categorization:check <path-to-catalog.xls|xlsx>");
  process.exit(1);
}

const context = buildDefaultCategorizationContext();
const analysis = analyzeImportFile(path.resolve(inputPath));
const summary = new Map<string, { categorySlug: string; subcategorySlug: string; count: number }>();
const sources = new Map<CategorizationSource, number>();
const unresolvedGroups = new Map<string, { count: number; examples: string[] }>();
const examples = {
  high: [] as Array<ReturnType<typeof toExample>>,
  medium: [] as Array<ReturnType<typeof toExample>>,
  low: [] as Array<ReturnType<typeof toExample>>
};
const confidenceBuckets = {
  high: 0,
  medium: 0,
  low: 0
};

let legacyMatched = 0;
let legacyNeedsReview = 0;
let wouldAutoPublish = 0;
let wouldRequireReview = 0;

for (const row of analysis.rows) {
  if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
    continue;
  }

  const result = categorizeProductName(buildTitle(row), context);
  const bucket = getCategorizationConfidenceBucket(result);
  confidenceBuckets[bucket] += 1;
  sources.set(result.source, (sources.get(result.source) ?? 0) + 1);
  pushExample(examples[bucket], toExample(row, result), 8);

  if (shouldAutoPublishInShadow(row, result)) {
    wouldAutoPublish += 1;
  } else {
    wouldRequireReview += 1;
  }

  if (!result.target) {
    legacyNeedsReview += 1;
    pushUnresolvedGroup(unresolvedGroups, row, result);
    continue;
  }

  legacyMatched += 1;
  const key = `${result.target.categorySlug}/${result.target.subcategorySlug}`;
  const current = summary.get(key) ?? {
    categorySlug: result.target.categorySlug,
    subcategorySlug: result.target.subcategorySlug,
    count: 0
  };
  current.count += 1;
  summary.set(key, current);
}

console.log(
  JSON.stringify(
    {
      fileName: analysis.report.fileName,
      selectedSheetName: analysis.report.selectedSheetName,
      rules: context.rules.length,
      threshold: AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
      matched: legacyMatched,
      needsReview: legacyNeedsReview,
      legacyMatched,
      legacyNeedsReview,
      shadowHigh: confidenceBuckets.high,
      shadowMedium: confidenceBuckets.medium,
      shadowLow: confidenceBuckets.low,
      wouldAutoPublish,
      wouldRequireReview,
      confidenceBuckets,
      existingProductCategory: sources.get("existing_product_category") ?? 0,
      sources: [...sources.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
      topBuckets: [...summary.values()].sort((a, b) => b.count - a.count).slice(0, 20),
      topUnresolvedGroups: topEntries(unresolvedGroups, 20),
      examples
    },
    null,
    2
  )
);

function buildTitle(row: AnalyzedImportRow) {
  return `${row.shopCode ?? ""} ${row.name || row.rawName}`.trim();
}

function toExample(row: AnalyzedImportRow, result: CategorizationResult) {
  return {
    rowNumber: row.rowNumber,
    shopCode: row.shopCode,
    name: row.name || row.rawName,
    confidence: result.confidence,
    source: result.source,
    reason: result.reason,
    categorySlug: result.target?.categorySlug,
    subcategorySlug: result.target?.subcategorySlug,
    matchedRule: result.matchedRule
      ? {
          pattern: result.matchedRule.pattern,
          matchType: result.matchedRule.matchType,
          priority: result.matchedRule.priority
        }
      : null
  };
}

function pushExample<T>(bucket: T[], example: T, limit: number) {
  if (bucket.length < limit) {
    bucket.push(example);
  }
}

function pushUnresolvedGroup(
  groups: Map<string, { count: number; examples: string[] }>,
  row: AnalyzedImportRow,
  result: CategorizationResult
) {
  const signal =
    result.matchedRule?.pattern ??
    row.shopCode?.split("-")[0]?.trim().toUpperCase() ??
    firstMeaningfulToken(row.name || row.rawName) ??
    "unknown";
  const current = groups.get(signal) ?? { count: 0, examples: [] };
  current.count += 1;
  const example = buildTitle(row);
  if (current.examples.length < 5 && !current.examples.includes(example)) {
    current.examples.push(example);
  }
  groups.set(signal, current);
}

function firstMeaningfulToken(value: string) {
  return normalizeForCategorization(value)
    .split(/\s+/)
    .map((token) => token.replace(/^\d+|\d+$/g, ""))
    .find((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function topEntries(bucket: Map<string, { count: number; examples: string[] }>, limit: number) {
  return [...bucket.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ru"))
    .slice(0, limit);
}

function shouldAutoPublishInShadow(row: AnalyzedImportRow, result: CategorizationResult) {
  return Boolean(
    row.status === "valid" &&
      !result.needsReview &&
      result.target &&
      result.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD
  );
}

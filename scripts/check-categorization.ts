import path from "node:path";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import { analyzeImportFile } from "../src/features/import/analyze";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: pnpm categorization:check <path-to-catalog.xls|xlsx>");
  process.exit(1);
}

const context = buildDefaultCategorizationContext();
const analysis = analyzeImportFile(path.resolve(inputPath));
const summary = new Map<string, { categorySlug: string; subcategorySlug: string; count: number }>();
let matched = 0;
let needsReview = 0;

for (const row of analysis.rows) {
  if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
    continue;
  }

  const result = categorizeProductName(`${row.shopCode} ${row.name || row.rawName}`, context);
  if (!result.target) {
    needsReview += 1;
    continue;
  }

  matched += 1;
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
      matched,
      needsReview,
      topBuckets: [...summary.values()].sort((a, b) => b.count - a.count).slice(0, 20)
    },
    null,
    2
  )
);

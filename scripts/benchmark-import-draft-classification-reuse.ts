import * as XLSX from "xlsx";
import { analyzeImportFile } from "../src/features/import/analyze";
import { createDraftClassificationRun, isImportProductCandidate } from "../src/features/import/draft-classification";
import type { CategorizationResult } from "../src/features/categorization/types";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "../src/features/import/types";
import { buildDefaultCategorizationContext } from "../src/features/categorization/engine";
import { createLegacyDraftClassificationPass } from "./helpers/import-draft-classification-reference";

const runCount = 5;
const fixture = createFixture();
const parsed = analyzeImportFile("benchmark.xlsx", {
  fileBuffer: fixture.workbook,
  fileName: "benchmark.xlsx",
  existingProducts: fixture.existingProducts
});
const candidateRows = parsed.rows.filter(isImportProductCandidate);

async function main() {
  const parsing = await runBenchmarks(() =>
    analyzeImportFile("benchmark.xlsx", {
      fileBuffer: fixture.workbook,
      fileName: "benchmark.xlsx",
      existingProducts: fixture.existingProducts
    })
  );
  const baseline = await runBenchmarks(() => runLegacyThreePasses());
  const reused = await runBenchmarks(() => runReusedSinglePass());

  console.log(
    JSON.stringify(
      {
        fixture: {
          workbook_rows: parsed.rows.length,
          classification_candidates: candidateRows.length,
          active_products: fixture.existingProducts.length,
          transaction_creation: "not measured: local PostgreSQL is unavailable; benchmark is CPU-only and does not write data"
        },
        parsing_excel: summarize(parsing),
        legacy_three_passes: summarize(baseline),
        reused_single_pass: summarize(reused),
        expected_computation_counts: {
          legacy_classification_calls: candidateRows.length * 3,
          reused_classification_calls: candidateRows.length,
          legacy_similarity_fallback_calls: baseline[0]!.value.similarityFallbacks,
          reused_similarity_fallback_calls: reused[0]!.value.similarityFallbacks
        },
        created_entities: reused[0]!.value.entities
      },
      null,
      2
    )
  );
}

async function runBenchmarks<T>(operation: () => T) {
  const runs = [];
  for (let index = 0; index < runCount; index += 1) {
    runs.push(await measure(operation));
  }
  return runs;
}

function runLegacyThreePasses() {
  const first = createTrackedLegacyPass();
  const second = createTrackedLegacyPass();
  const third = createTrackedLegacyPass();
  return {
    similarityFallbacks: first.similarityFallbacks + second.similarityFallbacks + third.similarityFallbacks,
    entities: third.entities
  };
}

function runReusedSinglePass() {
  return createTrackedReusedRun();
}

function createTrackedLegacyPass() {
  let similarityFallbacks = 0;
  const run = createLegacyDraftClassificationPass({
    rows: parsed.rows,
    categorizationContext: fixture.categorizationContext,
    existingProducts: fixture.existingProducts,
    onSimilarityFallback() {
      similarityFallbacks += 1;
    }
  });
  return buildTrackedResult(run, similarityFallbacks);
}

function createTrackedReusedRun() {
  let similarityFallbacks = 0;
  const run = createDraftClassificationRun({
    rows: parsed.rows,
    categorizationContext: fixture.categorizationContext,
    existingProducts: fixture.existingProducts,
    observer: {
      measureSimilarityFallback<T>(operation: () => T) {
        similarityFallbacks += 1;
        return operation();
      }
    }
  });
  return buildTrackedResult(run, similarityFallbacks);
}

function buildTrackedResult(
  run: ClassificationPass,
  similarityFallbacks: number
) {
  const decisions = candidateRows.map((row) => run.categorizationFor(row)!);

  return {
    similarityFallbacks,
    entities: {
      draft_products: parsed.rows.filter(
        (row) => row.status === "valid" || row.status === "needs_review"
      ).length,
      review_queue_rows: decisions.filter((result) => result.needsReview).length,
      auto_ready: decisions.filter((result) => result.decisionStatus === "AUTO_READY").length,
      group_review: decisions.filter((result) => result.decisionStatus === "GROUP_REVIEW").length,
      manual_review: decisions.filter((result) => result.decisionStatus === "MANUAL_REVIEW").length,
      blocked: decisions.filter((result) => result.decisionStatus === "BLOCKED_CONFLICT").length,
      invalid: decisions.filter((result) => result.decisionStatus === "INVALID_INPUT").length,
      skipped: parsed.rows.filter((row) => row.status === "skipped").length
    }
  };
}

type ClassificationPass = {
  categorizationFor: (row: AnalyzedImportRow) => CategorizationResult | undefined;
};

async function measure<T>(operation: () => T) {
  const before = process.memoryUsage();
  const scheduledAt = performance.now();
  const eventLoopLag = new Promise<number>((resolve) => {
    setImmediate(() => resolve(Math.max(0, performance.now() - scheduledAt)));
  });
  const startedAt = performance.now();
  const value = operation();
  const durationMs = performance.now() - startedAt;
  const after = process.memoryUsage();

  return {
    value,
    durationMs,
    rss: Math.max(before.rss, after.rss),
    heapUsed: Math.max(before.heapUsed, after.heapUsed),
    heapTotal: Math.max(before.heapTotal, after.heapTotal),
    eventLoopLagMs: await eventLoopLag
  };
}

function summarize<T>(runs: Awaited<ReturnType<typeof measure<T>>>[]) {
  const warmRuns = runs.slice(1);
  return {
    cold_ms: round(runs[0]!.durationMs),
    warm_median_ms: round(median(warmRuns.map((run) => run.durationMs))),
    warm_p95_ms: round(percentile(warmRuns.map((run) => run.durationMs), 0.95)),
    peak_rss_bytes: Math.max(...runs.map((run) => run.rss)),
    peak_heap_used_bytes: Math.max(...runs.map((run) => run.heapUsed)),
    peak_heap_total_bytes: Math.max(...runs.map((run) => run.heapTotal)),
    event_loop_lag_median_ms: round(median(runs.map((run) => run.eventLoopLagMs)))
  };
}

function createFixture() {
  const target = {
    categoryId: "category-filter",
    categorySlug: "filtry-i-masla",
    categoryName: "Фильтры и масла",
    subcategoryId: "subcategory-oil-filter",
    subcategorySlug: "maslyanye-filtry",
    subcategoryName: "Масляные фильтры",
    status: "active" as const
  };
  const existingProducts: ExistingProductSnapshot[] = [
    ...Array.from({ length: 50 }, (_, index) => ({
      shopCode: `EXISTING-${index + 1}`,
      name: `Старый фильтр ${index + 1}`,
      price: 100,
      ...target
    })),
    ...Array.from({ length: 40 }, (_, index) => ({
      shopCode: `SIM-${index + 1}`,
      name: `Квантум омега зета ${index + 1}`,
      price: 100,
      ...target
    }))
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Номенклатура", "Цена", "Остаток"],
    ...Array.from({ length: 50 }, (_, index) => [
      `EXISTING-${index + 1} Обновлённый фильтр`,
      100,
      1
    ]),
    ...Array.from({ length: 50 }, (_, index) => [
      `KNOWN-${index + 1} Фильтр масляный`,
      100,
      1
    ]),
    ...Array.from({ length: 50 }, (_, index) => [
      `SIMNEW-${index + 1} Квантум омега зета`,
      100,
      1
    ]),
    ...Array.from({ length: 50 }, (_, index) => [
      `MANUAL-${index + 1} Неизвестная сущность`,
      100,
      1
    ])
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Каталог");

  return {
    workbook: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer,
    existingProducts,
    categorizationContext: buildDefaultCategorizationContext()
  };
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentileValue) - 1] ?? 0;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

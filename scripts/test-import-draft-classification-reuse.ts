import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDraftClassificationRun, isImportProductCandidate } from "../src/features/import/draft-classification";
import { needsProductReview, resolveDraftProductStatus } from "../src/features/import/automation";
import type { CategorizationResult } from "../src/features/categorization/types";
import type { AnalyzedImportRow } from "../src/features/import/types";
import { createLegacyDraftClassificationPass } from "./helpers/import-draft-classification-reference";
import { createImportDraftClassificationFixture } from "./helpers/import-draft-classification-fixture";

run("one import run preserves old three-pass results and removes repeated classification", () => {
  const fixture = createImportDraftClassificationFixture();
  const oldReportPass = createLegacyTrackedPass(fixture);
  const oldPreviewPass = createLegacyTrackedPass(fixture);
  const oldProductsPass = createLegacyTrackedPass(fixture);
  const reusedPass = createReusedTrackedRun(fixture);
  const candidates = fixture.rows.filter(isImportProductCandidate);

  for (const row of fixture.rows) {
    assert.deepEqual(
      reusedPass.run.categorizationFor(row),
      oldReportPass.run.categorizationFor(row),
      `report result changed for row ${row.rowNumber}`
    );
    assert.deepEqual(
      reusedPass.run.categorizationFor(row),
      oldPreviewPass.run.categorizationFor(row),
      `preview result changed for row ${row.rowNumber}`
    );
    assert.deepEqual(
      reusedPass.run.categorizationFor(row),
      oldProductsPass.run.categorizationFor(row),
      `draft product result changed for row ${row.rowNumber}`
    );
  }

  assert.deepEqual(deriveImportOutcome(fixture.rows, reusedPass.run), deriveImportOutcome(fixture.rows, oldProductsPass.run));
  assert.deepEqual(
    candidates.map((row) => reusedPass.run.categorizationFor(row)),
    candidates.map((row) => oldReportPass.run.categorizationFor(row))
  );
  assert.deepEqual(
    candidates.map((row) => row.rowNumber),
    [...candidates].sort((left, right) => left.rowIndex - right.rowIndex).map((row) => row.rowNumber)
  );

  for (const row of candidates) {
    assert.strictEqual(
      reusedPass.run.categorizationFor(row),
      reusedPass.run.categorizationFor(row),
      `run did not preserve source row association for row ${row.rowNumber}`
    );
  }

  assert.equal(reusedPass.classifications, candidates.length);
  assert.equal(
    oldReportPass.classifications + oldPreviewPass.classifications + oldProductsPass.classifications,
    candidates.length * 3
  );
  assert.equal(
    oldReportPass.similarityFallbacks + oldPreviewPass.similarityFallbacks + oldProductsPass.similarityFallbacks,
    reusedPass.similarityFallbacks * 3
  );
  assert.ok(reusedPass.similarityFallbacks > 0, "fixture must exercise similarity fallback");
});

run("repeated import runs are independent and deterministic", () => {
  const fixture = createImportDraftClassificationFixture();
  const first = createReusedTrackedRun(fixture).run;
  const second = createReusedTrackedRun(fixture).run;

  for (const row of fixture.rows) {
    assert.deepEqual(first.categorizationFor(row), second.categorizationFor(row));
    if (isImportProductCandidate(row)) {
      assert.notStrictEqual(first.categorizationFor(row), second.categorizationFor(row));
    }
  }
});

run("classification failure is propagated and no incomplete run is returned", () => {
  const fixture = createImportDraftClassificationFixture();
  const original = new Error("similarity instrumentation failure");
  const observer = {
    measureSimilarityFallback<T>(_operation: () => T): T {
      throw original;
    }
  };

  assert.throws(
    () =>
      createDraftClassificationRun({
        ...fixture,
        observer
      }),
    (error: unknown) => error === original && error instanceof Error && error.stack === original.stack
  );
});

run("draft creation uses the local run for every categorization consumer", () => {
  const source = readFileSync(
    new URL("../src/features/import/draft-service.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /categorizeImportRow/);
  assert.match(source, /buildCategorizationSummary\(analysis\.rows, classificationRun\)/);
  assert.match(source, /buildAutoCategorizationPreview\(analysis\.rows, classificationRun\)/);
  assert.match(source, /classificationRun\.categorizationFor\(row\)!/);
});

function createLegacyTrackedPass(fixture: ReturnType<typeof createImportDraftClassificationFixture>) {
  let similarityFallbacks = 0;
  const run = createLegacyDraftClassificationPass({
    ...fixture,
    onSimilarityFallback() {
      similarityFallbacks += 1;
    }
  });

  return {
    run,
    classifications: fixture.rows.filter(isImportProductCandidate).length,
    similarityFallbacks
  };
}

function createReusedTrackedRun(fixture: ReturnType<typeof createImportDraftClassificationFixture>) {
  let similarityFallbacks = 0;
  const run = createDraftClassificationRun({
    ...fixture,
    observer: {
      measureSimilarityFallback<T>(operation: () => T) {
        similarityFallbacks += 1;
        return operation();
      }
    }
  });

  return {
    run,
    classifications: fixture.rows.filter(isImportProductCandidate).length,
    similarityFallbacks
  };
}

function deriveImportOutcome(
  rows: ReturnType<typeof createImportDraftClassificationFixture>["rows"],
  run: ClassificationPass
) {
  const decisions = rows
    .filter(isImportProductCandidate)
    .map((row) => ({ row, result: run.categorizationFor(row)! }));
  const draftProducts = decisions.filter(
    ({ row }) => row.status === "valid" || row.status === "needs_review"
  );

  return {
    order: decisions.map(({ row }) => row.rowNumber),
    results: decisions.map(({ result }) => result),
    draftProductCount: draftProducts.length,
    reviewQueueCount: draftProducts.filter(({ row, result }) => needsProductReview(row, result)).length,
    autoReadyRows: decisions.filter(({ result }) => result.decisionStatus === "AUTO_READY").length,
    groupReviewRows: decisions.filter(({ result }) => result.decisionStatus === "GROUP_REVIEW").length,
    manualReviewRows: decisions.filter(({ result }) => result.decisionStatus === "MANUAL_REVIEW").length,
    blockedRows: decisions.filter(({ result }) => result.decisionStatus === "BLOCKED_CONFLICT").length,
    invalidRows:
      rows.filter((row) => row.status === "error").length +
      decisions.filter(({ result }) => result.decisionStatus === "INVALID_INPUT").length,
    skippedRows: rows.filter((row) => row.status === "skipped").length,
    productStatuses: draftProducts.map(({ row, result }) => resolveDraftProductStatus(row, result))
  };
}

type ClassificationPass = {
  categorizationFor: (row: AnalyzedImportRow) => CategorizationResult | undefined;
};

function run(name: string, test: () => void) {
  try {
    test();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

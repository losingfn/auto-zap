import assert from "node:assert/strict";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import type { CategorizationResult } from "../src/features/categorization/types";
import { createAdminRedirectUrlFromParts } from "../src/middleware";
import { needsProductReview, resolveImportProductName } from "../src/features/import/automation";
import { buildImportReport, buildPriceChangeReport } from "../src/features/import/report";
import { evaluateImportSafety } from "../src/features/import/safety";
import type {
  AnalyzedImportRow,
  ExistingProductSnapshot,
  ImportPreviewReport
} from "../src/features/import/types";

const target = {
  categoryId: "cat-1",
  categorySlug: "dvigatel",
  categoryName: "Двигатель",
  subcategoryId: "sub-1",
  subcategorySlug: "filtry",
  subcategoryName: "Фильтры"
};

run("existing product keeps category and skips review", () => {
  const context = buildDefaultCategorizationContext();
  const result = categorizeProductName("A-1 неизвестный товар", context, {
    existingProduct: {
      ...target,
      status: "active"
    }
  });

  assert.equal(result.source, "existing_product_category");
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.target, target);
  assert.equal(needsProductReview(row(), result), false);
});

run("existing product updates price and preserves name fallback", () => {
  const existing = new Map<string, ExistingProductSnapshot>([
    ["A-1", { shopCode: "A-1", name: "Старое название", price: 100 }]
  ]);
  const priceChanges = buildPriceChangeReport([row({ price: 125 })], existing);

  assert.equal(priceChanges.existingPriceUpdatedCount, 1);
  assert.equal(priceChanges.increasedCount, 1);
  assert.equal(priceChanges.maxIncreaseAmount, 25);
  assert.equal(resolveImportProductName(row({ name: null }), existing.get("A-1")), "Старое название");
});

run("new high-confidence product becomes active", () => {
  assert.equal(needsProductReview(row(), categorization({ confidence: 0.92 })), false);
});

run("new low-confidence product becomes needs_review", () => {
  assert.equal(needsProductReview(row(), categorization({ confidence: 0.88 })), true);
});

run("row-level review item is not publishable", () => {
  assert.equal(
    needsProductReview(row({ status: "needs_review" }), categorization({ confidence: 0.98 })),
    true
  );
});

run("missing item becomes archive candidate", () => {
  const report = buildImportReport({
    fileName: "catalog.xls",
    selectedSheetName: "Sheet1",
    sheets: [],
    rows: [row()],
    existingProducts: [
      { shopCode: "A-1", name: "Existing A", price: 100 },
      { shopCode: "B-2", name: "Existing B", price: 200 }
    ]
  });

  assert.equal(report.archivedCount, 1);
});

run("anomalous archive blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report({ archivedCount: 4 }),
    activeProductCount: 10,
    draftActiveProductCount: 6,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "archive_ratio" && check.status === "blocked"));
});

run("duplicate shopCode blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report({ issueCounts: { duplicate_code: 1 } }),
    activeProductCount: 10,
    draftActiveProductCount: 10,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "duplicate_shop_code" && check.status === "blocked"));
});

run("empty name is not published for new product", () => {
  const result = categorization({
    target: null,
    confidence: 0,
    source: "empty_name",
    needsReview: true
  });

  assert.equal(needsProductReview(row({ name: null, status: "needs_review" }), result), true);
});

run("invalid category blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report(),
    activeProductCount: 10,
    draftActiveProductCount: 10,
    invalidCategoryCount: 1,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "invalid_category" && check.status === "blocked"));
});

run("parallel import blocks publish", () => {
  const safety = evaluateImportSafety({
    report: report(),
    activeProductCount: 10,
    draftActiveProductCount: 10,
    hasActiveVersion: true,
    hasBlockingImport: true
  });

  assert.equal(safety.canPublish, false);
  assert.ok(safety.checks.some((check) => check.code === "no_parallel_import" && check.status === "blocked"));
});

run("admin redirect uses forwarded production origin", () => {
  const url = createAdminRedirectUrlFromParts({
    requestUrl: "http://localhost:3000/admin/import",
    pathname: "/admin/login",
    forwardedHost: "autozap.example",
    forwardedProto: "https"
  });
  url.searchParams.set("next", "/admin/import");

  assert.equal(url.origin, "https://autozap.example");
  assert.equal(url.pathname, "/admin/login");
  assert.equal(url.searchParams.get("next"), "/admin/import");
  assert.equal(url.toString().includes("localhost"), false);
});

console.log("import automation checks passed");

function run(name: string, test: () => void) {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function row(overrides: Partial<AnalyzedImportRow> = {}): AnalyzedImportRow {
  return {
    sheetName: "Sheet1",
    rowNumber: 2,
    rowIndex: 1,
    rawName: "A-1 Фильтр масляный",
    stockQuantity: 1,
    price: 100,
    stockSum: 100,
    shopCode: "A-1",
    name: "Фильтр масляный",
    status: "valid",
    issues: [],
    ...overrides
  };
}

function categorization(overrides: Partial<CategorizationResult> = {}): CategorizationResult {
  return {
    target,
    matchedRule: null,
    confidence: 0.98,
    source: "strong_multi_token",
    reason: "test",
    matchedSignals: [],
    needsReview: false,
    reviewReason: null,
    ...overrides
  };
}

function report(overrides: Partial<ImportPreviewReport> = {}): ImportPreviewReport {
  return {
    fileName: "catalog.xls",
    selectedSheetName: "Sheet1",
    sheets: [],
    totalRows: 10,
    productCandidateRows: 10,
    parsedRows: 10,
    validRows: 10,
    reviewRows: 0,
    errorRows: 0,
    skippedRows: 0,
    addedCount: 0,
    updatedCount: 10,
    archivedCount: 0,
    unchangedCount: 0,
    issueCounts: {},
    priceChanges: {
      existingWithPriceCount: 10,
      existingPriceUpdatedCount: 1,
      increasedCount: 1,
      decreasedCount: 0,
      unchangedCount: 9,
      maxIncreaseAmount: 10,
      maxIncreasePercent: 0.1,
      maxDecreaseAmount: 0,
      maxDecreasePercent: 0,
      averageChangeAmount: 1,
      averageChangePercent: 0.01
    },
    examples: {
      valid: [],
      needsReview: [],
      errors: []
    },
    autoCategorizationPreview: {
      totalProducts: 10,
      legacyMatched: 10,
      legacyNeedsReview: 0,
      existingCategoryPreserved: 10,
      shadowHigh: 10,
      shadowMedium: 0,
      shadowLow: 0,
      wouldAutoPublish: 10,
      wouldRequireReview: 0,
      highConfidence: 10,
      mediumConfidence: 0,
      lowConfidence: 0,
      needsReview: 0,
      emptyName: 0,
      averageConfidence: 0.98,
      automationPotential: 1,
      threshold: 0.92,
      sources: [],
      topUnresolvedGroups: [],
      highConfidenceExamples: [],
      lowConfidenceExamples: [],
      dangerousGroups: []
    },
    ...overrides
  };
}

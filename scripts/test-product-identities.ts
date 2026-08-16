import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefaultCategorizationContext } from "../src/features/categorization/engine";
import { createDraftClassificationRun } from "../src/features/import/draft-classification";
import {
  createProductIdentityResolutionRun,
  normalizeProductIdentityName
} from "../src/features/import/product-identity-resolver";
import { evaluateImportSafety } from "../src/features/import/safety";
import type {
  AnalyzedImportRow,
  ExistingProductSnapshot,
  ImportPreviewReport
} from "../src/features/import/types";
import { planReviewSnapshotIdentities } from "../src/features/admin/review";

const migrationSource = readFileSync("db/migrations/0010_product_identities.sql", "utf8");
const schemaSource = readFileSync("src/db/schema.ts", "utf8");
const draftSource = readFileSync("src/features/import/draft-service.ts", "utf8");

run("same code and normalized name keep the existing identity despite a price change", () => {
  const incoming = importRow({ price: 250, name: "  ФИЛЬТР   масляный  " });
  const run = createProductIdentityResolutionRun({
    rows: [incoming],
    existingProducts: [existingProduct({ name: "фильтр масляный" })]
  });

  assert.deepEqual(run.resolutionFor(incoming), {
    kind: "existing",
    productIdentityId: "identity-existing"
  });
  assert.equal(run.isIdentityConflict(incoming), false);
  assert.deepEqual(run.newProductIdentityIds, []);
});

run("approved name normalization handles case, spaces, ё/е and technical punctuation", () => {
  assert.equal(
    normalizeProductIdentityName("  Фильтр-маслЁный,   2108. "),
    normalizeProductIdentityName("фильтр масленый 2108")
  );
});

run("same shopCode with a different name becomes identity_conflict without fuzzy matching", () => {
  const incoming = importRow({ name: "Фильтр воздушный" });
  const run = createProductIdentityResolutionRun({
    rows: [incoming],
    existingProducts: [existingProduct({ name: "Фильтр масляный" })]
  });

  assert.deepEqual(run.resolutionFor(incoming), {
    kind: "conflict",
    existingProductIdentityId: "identity-existing",
    existingProductName: "Фильтр масляный"
  });
  assert.equal(run.isIdentityConflict(incoming), true);
});

run("new shopCode receives a new identity and two snapshots receive distinct identities", () => {
  const first = importRow({ shopCode: "NEW-1" });
  const second = importRow({ shopCode: "NEW-2" });
  let next = 0;
  const run = createProductIdentityResolutionRun({
    rows: [first, second],
    existingProducts: [],
    createIdentityId: () => `identity-new-${++next}`
  });

  assert.deepEqual(run.resolutionFor(first), { kind: "new", productIdentityId: "identity-new-1" });
  assert.deepEqual(run.resolutionFor(second), { kind: "new", productIdentityId: "identity-new-2" });
  assert.equal(new Set(run.newProductIdentityIds).size, 2);
  assert.match(migrationSource, /products_version_identity_unique/);
  assert.match(migrationSource, /WHERE product_identity_id IS NOT NULL/);
  assert.match(schemaSource, /versionIdentityUnique/);
});

run("identity conflict cannot inherit the existing category through draft classification", () => {
  const incoming = importRow({ name: "Совсем другой товар" });
  const classification = createDraftClassificationRun({
    rows: [incoming],
    categorizationContext: buildDefaultCategorizationContext(),
    existingProducts: [
      existingProduct({
        categoryId: "category-1",
        categorySlug: "filtry-i-masla",
        categoryName: "Фильтры и масла",
        subcategoryId: "subcategory-1",
        subcategorySlug: "maslyanye-filtry",
        subcategoryName: "Масляные фильтры",
        status: "active"
      })
    ],
    identityConflictRows: new Set([incoming])
  });

  assert.notEqual(classification.categorizationFor(incoming)?.source, "existing_product_category");
});

run("review snapshot clone preserves an existing identity", () => {
  const plan = planReviewSnapshotIdentities(
    [{ id: "snapshot-1", status: "active", productIdentityId: "identity-existing" }],
    []
  );

  assert.equal(plan.productIdentityIdFor("snapshot-1"), "identity-existing");
  assert.deepEqual(plan.newProductIdentityIds, []);
});

run("review resolves identity conflict as SAME using the candidate identity", () => {
  const plan = planReviewSnapshotIdentities(
    [{ id: "snapshot-conflict", status: "needs_review", productIdentityId: null }],
    [{ productId: "snapshot-conflict", identityDecision: "same", productIdentityId: "identity-existing" }]
  );

  assert.equal(plan.productIdentityIdFor("snapshot-conflict"), "identity-existing");
  assert.deepEqual(plan.newProductIdentityIds, []);
});

run("review resolves identity conflict as NEW by creating one new identity", () => {
  const plan = planReviewSnapshotIdentities(
    [{ id: "snapshot-conflict", status: "needs_review", productIdentityId: null }],
    [{ productId: "snapshot-conflict", identityDecision: "new", productIdentityId: null }],
    () => "identity-created-by-review"
  );

  assert.equal(plan.productIdentityIdFor("snapshot-conflict"), "identity-created-by-review");
  assert.deepEqual(plan.newProductIdentityIds, ["identity-created-by-review"]);
});

run("unresolved identity conflict and an active product without identity are rejected", () => {
  assert.throws(
    () =>
      planReviewSnapshotIdentities(
        [{ id: "snapshot-conflict", status: "needs_review", productIdentityId: null }],
        [{ productId: "snapshot-conflict", identityDecision: null, productIdentityId: null }]
      ),
    /Identity conflict не разрешён/
  );
  assert.throws(
    () => planReviewSnapshotIdentities([{ id: "snapshot-active", status: "active", productIdentityId: null }], []),
    /active товар без постоянной identity/
  );
});

run("publish safety blocks a draft with a public product missing identity", () => {
  const safety = evaluateImportSafety({
    report: reportFixture(),
    activeProductCount: 1,
    draftActiveProductCount: 1,
    invalidCategoryCount: 0,
    missingProductIdentityCount: 1,
    hasActiveVersion: true
  });

  assert.equal(safety.canPublish, false);
  assert.equal(
    safety.checks.find((check) => check.code === "missing_product_identity")?.status,
    "blocked"
  );
});

run("an absent product does not schedule an identity deletion", () => {
  const run = createProductIdentityResolutionRun({
    rows: [],
    existingProducts: [existingProduct()]
  });

  assert.deepEqual(run.newProductIdentityIds, []);
  assert.doesNotMatch(migrationSource, /DELETE\s+FROM\s+product_identities/i);
  assert.match(draftSource, /identityResolutionRun\.newProductIdentityIds/);
});

function existingProduct(overrides: Partial<ExistingProductSnapshot> = {}): ExistingProductSnapshot {
  return {
    productIdentityId: "identity-existing",
    shopCode: "A-1",
    name: "Фильтр масляный",
    price: 100,
    ...overrides
  };
}

function importRow(overrides: Partial<AnalyzedImportRow> = {}): AnalyzedImportRow {
  return {
    sheetName: "Лист1",
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

function reportFixture(): ImportPreviewReport {
  return {
    fileName: "identity.xlsx",
    selectedSheetName: "Лист1",
    sheets: [],
    totalRows: 1,
    productCandidateRows: 1,
    parsedRows: 1,
    validRows: 1,
    reviewRows: 0,
    errorRows: 0,
    skippedRows: 0,
    addedCount: 0,
    updatedCount: 0,
    archivedCount: 0,
    unchangedCount: 1,
    issueCounts: {},
    priceChanges: {
      existingWithPriceCount: 0,
      existingPriceUpdatedCount: 0,
      increasedCount: 0,
      decreasedCount: 0,
      unchangedCount: 0
    },
    examples: { valid: [], needsReview: [], errors: [] }
  };
}

function run(name: string, test: () => void) {
  test();
  console.log(`✓ ${name}`);
}

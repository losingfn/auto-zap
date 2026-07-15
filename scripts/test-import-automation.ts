import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogTaxonomy, defaultCategorizationRules } from "../src/config/catalog-taxonomy";
import { isPublicTaxonomyTarget } from "../src/config/public-taxonomy";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import type { CategorizationResult } from "../src/features/categorization/types";
import { createAdminRedirectUrlFromParts } from "../src/middleware";
import {
  canCancelImport,
  canPublishImport,
  isBlockingImportDraft,
  normalizeStoredImportReport
} from "../src/features/admin/imports";
import {
  buildImportCancelledRedirect,
  handleCancelImportRequest,
  isSameOriginAdminMutation
} from "../src/features/admin/import-cancel-endpoint";
import { getStaticPublicCategories } from "../src/features/catalog/data";
import { needsProductReview, resolveImportProductName } from "../src/features/import/automation";
import { buildImportReport, buildPriceChangeReport } from "../src/features/import/report";
import { evaluateImportSafety } from "../src/features/import/safety";
import { SEARCH_INDEX_PREPARE_FAILED_MESSAGE } from "../src/features/search/indexing";
import {
  replaceSearchIndexDocumentsWithClient,
  SEARCH_INDEX_UID,
  type SearchIndex,
  type SearchIndexClient
} from "../src/features/search/meilisearch";
import type {
  AnalyzedImportRow,
  ExistingProductSnapshot,
  ImportPreviewReport
} from "../src/features/import/types";
import type { SearchProductDocument } from "../src/features/search/types";

const target = {
  categoryId: "cat-1",
  categorySlug: "filtry-i-masla",
  categoryName: "Фильтры и масла",
  subcategoryId: "sub-1",
  subcategorySlug: "maslyanye-filtry",
  subcategoryName: "Масляные фильтры"
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

run("previous needs_review product does not become trusted existing category", () => {
  const context = buildDefaultCategorizationContext();
  const result = categorizeProductName("A-1 неизвестный товар", context, {
    existingProduct: {
      ...target,
      status: "needs_review"
    }
  });

  assert.notEqual(result.source, "existing_product_category");
  assert.equal(needsProductReview(row(), result), true);
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

run("legacy stored import report gets safe PR10 defaults", () => {
  const normalized = normalizeStoredImportReport(legacyStoredReport());

  assert.ok(normalized);
  assert.equal(normalized.priceChanges.existingWithPriceCount, 0);
  assert.equal(normalized.priceChanges.existingPriceUpdatedCount, 0);
  assert.equal(normalized.priceChanges.increasedCount, 0);
  assert.equal(normalized.priceChanges.decreasedCount, 0);
  assert.equal(normalized.priceChanges.unchangedCount, 0);
  assert.deepEqual(normalized.examples.needsReview, []);
  assert.equal(normalized.autoCategorizationPreview?.existingCategoryPreserved, 0);
  assert.equal(normalized.autoCategorizationPreview?.wouldAutoPublish, 0);
});

run("stored import report preserves new price and automation summaries", () => {
  const normalized = normalizeStoredImportReport({
    ...legacyStoredReport(),
    existingWithPriceCount: 7,
    pricesChanged: 4,
    pricesIncreased: 3,
    pricesDecreased: 1,
    pricesUnchanged: 2,
    maxIncrease: 150,
    maxDecrease: -40,
    averagePercentChange: 0.12,
    existingInherited: 5,
    newHighConfidence: 6,
    newNeedsReview: 2,
    expectedPublicCount: 9
  });

  assert.ok(normalized);
  assert.equal(normalized.priceChanges.existingWithPriceCount, 7);
  assert.equal(normalized.priceChanges.existingPriceUpdatedCount, 4);
  assert.equal(normalized.priceChanges.increasedCount, 3);
  assert.equal(normalized.priceChanges.decreasedCount, 1);
  assert.equal(normalized.priceChanges.unchangedCount, 2);
  assert.equal(normalized.priceChanges.maxIncreaseAmount, 150);
  assert.equal(normalized.priceChanges.maxDecreaseAmount, -40);
  assert.equal(normalized.priceChanges.averageChangePercent, 0.12);
  assert.equal(normalized.autoCategorizationPreview?.existingCategoryPreserved, 5);
  assert.equal(normalized.autoCategorizationPreview?.shadowHigh, 6);
  assert.equal(normalized.autoCategorizationPreview?.wouldRequireReview, 2);
  assert.equal(normalized.autoCategorizationPreview?.wouldAutoPublish, 9);
});

run("legacy import report cannot publish but can be cancelled", () => {
  const normalized = normalizeStoredImportReport(legacyStoredReport());

  assert.ok(normalized);
  assert.equal(canPublishImport("analyzed", "draft", normalized), false);
  assert.equal(canCancelImport("analyzed", "draft"), true);
  assert.equal(canCancelImport("failed", "draft"), true);
  assert.equal(canCancelImport("published", "active"), false);
});

run("legacy unfinished import statuses can be cancelled", () => {
  assert.equal(canCancelImport("analyzed", "draft"), true);
  assert.equal(canCancelImport("uploaded", "draft"), true);
  assert.equal(canCancelImport("failed", "draft"), true);
  assert.equal(canCancelImport("safety_blocked", "draft"), true);
  assert.equal(canCancelImport("processing", "draft"), true);
  assert.equal(canCancelImport("published", "active"), false);
  assert.equal(canCancelImport("analyzed", "active"), false);
  assert.equal(canCancelImport("analyzed", "archived"), false);
});

run("cancelled imports do not block the next import", () => {
  assert.equal(isBlockingImportDraft("analyzed", "draft"), true);
  assert.equal(isBlockingImportDraft("failed", "draft"), true);
  assert.equal(isBlockingImportDraft("cancelled", "draft"), false);
  assert.equal(isBlockingImportDraft("cancelled", "rolled_back"), false);
});

run("public taxonomy excludes fasteners category and rules", () => {
  assert.equal(getStaticPublicCategories().some((category) => category.slug === "krepezh"), false);
  assert.equal(catalogTaxonomy.some((category) => String(category.slug) === "krepezh"), false);
  assert.equal(
    defaultCategorizationRules.some((rule) => rule.categorySlug === "krepezh"),
    false
  );
  assert.equal(isPublicTaxonomyTarget("krepezh", "bolty"), false);
});

run("fastener-like single token is not auto-published as a new public category", () => {
  const result = categorizeProductName("B-1 болт м8", buildDefaultCategorizationContext());

  assert.notEqual(result.target?.categorySlug, "krepezh");
  assert.equal(needsProductReview(row({ shopCode: "B-1", name: "болт м8" }), result), true);
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

run("search documents query filters active products and public taxonomy", () => {
  const source = readFileSync(new URL("../src/features/search/documents.ts", import.meta.url), "utf8");

  assert.match(source, /eq\(products\.status,\s*"active"\)/);
  assert.match(source, /publicTaxonomyTargetCondition/);
});

run("publish prepares search index before active DB transaction", () => {
  const source = readFileSync(
    new URL("../src/features/import/publish-service.ts", import.meta.url),
    "utf8"
  );
  const searchSyncIndex = source.indexOf("syncSearchIndexForCatalogVersion(catalogVersionId)");
  const transactionIndex = source.indexOf("db.transaction");

  assert.ok(searchSyncIndex > -1);
  assert.ok(transactionIndex > -1);
  assert.ok(searchSyncIndex < transactionIndex);
});

run("search indexing failure message keeps old search explicit", () => {
  assert.match(SEARCH_INDEX_PREPARE_FAILED_MESSAGE, /Старый поиск сохранён/);
});

run("cancel action uses stable API button instead of server action form", () => {
  const pageSource = readFileSync(
    new URL("../src/app/admin/(panel)/import/page.tsx", import.meta.url),
    "utf8"
  );
  const buttonSource = readFileSync(
    new URL("../src/app/admin/(panel)/import/import-cancel-button.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(pageSource, /action=\{cancelImportAction\}/);
  assert.match(pageSource, /ImportCancelButton/);
  assert.match(buttonSource, /fetch\(\s*`\/api\/admin\/imports\/\$\{encodeURIComponent\(batchId\)\}\/cancel`/);
  assert.match(buttonSource, /Отмена…/);
  assert.match(buttonSource, /role="alert"/);
  assert.match(buttonSource, /router\.replace/);
});

run("cancel business logic does not touch active catalog or Meilisearch", () => {
  const source = readFileSync(new URL("../src/features/admin/imports.ts", import.meta.url), "utf8");
  const cancelSource = extractFunctionSource(source, "cancelAdminImportBatch", "function validateImportFile");

  assert.match(cancelSource, /set\(\{\s*status:\s*"cancelled"\s*\}\)/s);
  assert.match(cancelSource, /status:\s*"rolled_back"/);
  assert.doesNotMatch(cancelSource, /syncSearch|Meili|meili/i);
  assert.doesNotMatch(cancelSource, /status:\s*"active"/);
});

function run(name: string, test: () => void) {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function runAsync(name: string, test: () => Promise<void>) {
  try {
    await test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function runSearchIndexChecks() {
  await runImportCancelEndpointChecks();

  await runAsync("failed staging add keeps active search index intact", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocument = searchDocument({ id: "new-product", name: "New product" });
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__failed-add`;
    const client = new FakeSearchIndexClient([oldDocument]);
    client.failAddForUid.add(stagingIndexUid);

    await assert.rejects(
      () =>
        replaceSearchIndexDocumentsWithClient(client, [newDocument], [], {
          expectedDocumentCount: 1,
          stagingIndexUid
        }),
      /add failed/
    );

    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.equal(getFakeIndex(client, SEARCH_INDEX_UID).deleteAllDocumentsCount, 0);
    assert.equal(client.swaps.length, 0);
  });

  await runAsync("successful staging index swaps active search index", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocuments = [
      searchDocument({ id: "new-product-1", name: "New product 1" }),
      searchDocument({ id: "new-product-2", name: "New product 2" })
    ];
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__success`;
    const client = new FakeSearchIndexClient([oldDocument]);

    const result = await replaceSearchIndexDocumentsWithClient(client, newDocuments, [], {
      expectedDocumentCount: newDocuments.length,
      stagingIndexUid
    });

    assert.equal(result.indexUid, SEARCH_INDEX_UID);
    assert.equal(result.stagingIndexUid, stagingIndexUid);
    assert.equal(result.indexedCount, 2);
    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "new-product-1",
      "new-product-2"
    ]);
    assert.deepEqual(getFakeIndex(client, stagingIndexUid).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.deepEqual(client.swaps, [[SEARCH_INDEX_UID, stagingIndexUid]]);
  });

  await runAsync("staging count mismatch blocks swap and keeps active search index", async () => {
    const oldDocument = searchDocument({ id: "old-product", name: "Old product" });
    const newDocument = searchDocument({ id: "new-product", name: "New product" });
    const stagingIndexUid = `${SEARCH_INDEX_UID}__staging__count-mismatch`;
    const client = new FakeSearchIndexClient([oldDocument]);
    client.statsOverrideByUid.set(stagingIndexUid, 0);

    await assert.rejects(
      () =>
        replaceSearchIndexDocumentsWithClient(client, [newDocument], [], {
          expectedDocumentCount: 1,
          stagingIndexUid
        }),
      /ожидалось 1, получено 0/
    );

    assert.deepEqual(getFakeIndex(client, SEARCH_INDEX_UID).documents.map((document) => document.id), [
      "old-product"
    ]);
    assert.equal(client.swaps.length, 0);
  });

  console.log("import automation checks passed");
}

async function runImportCancelEndpointChecks() {
  await runAsync("cancel endpoint without admin session returns unauthorized", async () => {
    let called = false;
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "batch-1" },
      {
        getSession: async () => null,
        cancelImportBatch: async () => {
          called = true;
        }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "unauthorized");
    assert.equal(called, false);
  });

  await runAsync("cancel endpoint with valid session calls shared business function", async () => {
    let calledWith: { importBatchId: string; adminUserId: string } | null = null;
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "batch-1" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async (input) => {
          calledWith = input;
        }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(calledWith, { importBatchId: "batch-1", adminUserId: "admin-1" });
    assert.deepEqual(payload, {
      ok: true,
      status: "cancelled",
      redirectTo: buildImportCancelledRedirect("batch-1")
    });
  });

  await runAsync("cancel endpoint rejects cross-origin mutation", async () => {
    let called = false;
    const response = await handleCancelImportRequest(
      cancelRequest("https://evil.example"),
      { batchId: "batch-1" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async () => {
          called = true;
        }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.ok, false);
    assert.equal(called, false);
  });

  await runAsync("cancel endpoint surfaces business errors as JSON", async () => {
    const response = await handleCancelImportRequest(
      cancelRequest(),
      { batchId: "batch-1" },
      {
        getSession: async () => testSession(),
        cancelImportBatch: async () => {
          throw new Error("database unavailable");
        },
        logger: { error: () => undefined }
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.message, "database unavailable");
  });

  await runAsync("same-origin cancel request allows forwarded production origin", async () => {
    const request = new Request("http://127.0.0.1:3000/api/admin/imports/batch-1/cancel", {
      method: "POST",
      headers: {
        origin: "https://autozap.example",
        "x-forwarded-host": "autozap.example",
        "x-forwarded-proto": "https"
      }
    });

    assert.equal(isSameOriginAdminMutation(request), true);
  });
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

function legacyStoredReport() {
  return {
    fileName: "old-catalog.xls",
    selectedSheetName: "Sheet1",
    sheets: [],
    totalRows: 10,
    productCandidateRows: 10,
    parsedRows: 10,
    validRows: 9,
    reviewRows: 1,
    errorRows: 0,
    skippedRows: 0,
    addedCount: 2,
    updatedCount: 3,
    archivedCount: 0,
    unchangedCount: 4,
    issueCounts: {}
  };
}

function searchDocument(overrides: Partial<SearchProductDocument> = {}): SearchProductDocument {
  return {
    id: "product",
    catalogVersionId: "catalog-version",
    status: "active",
    shopCode: "A-1",
    shopCodeNormalized: "a-1",
    shopCodeCompact: "a1",
    name: "Product",
    rawName: "Product",
    slug: "product",
    price: 100,
    categorySlug: "dvigatel",
    categoryName: "Двигатель",
    subcategorySlug: "filtry",
    subcategoryName: "Фильтры",
    url: "/catalog/dvigatel/filtry/product",
    searchText: "Product",
    normalizedText: "product",
    synonymText: "",
    translitText: "product",
    brandText: "",
    ...overrides
  };
}

function getFakeIndex(client: FakeSearchIndexClient, indexUid: string) {
  const index = client.indexes.get(indexUid);
  assert.ok(index, `Expected fake index ${indexUid} to exist`);
  return index;
}

function cancelRequest(origin = "https://autozap.example") {
  return new Request("https://autozap.example/api/admin/imports/batch-1/cancel", {
    method: "POST",
    headers: { origin }
  });
}

function testSession() {
  return {
    user: {
      id: "admin-1",
      email: "admin@example.com",
      fullName: "Admin",
      role: "owner" as const
    }
  };
}

function extractFunctionSource(source: string, startPattern: string, endPattern: string) {
  const start = source.indexOf(startPattern);
  const end = source.indexOf(endPattern, start);
  assert.ok(start >= 0, `Missing source start ${startPattern}`);
  assert.ok(end > start, `Missing source end ${endPattern}`);

  return source.slice(start, end);
}

class FakeSearchIndexClient implements SearchIndexClient {
  readonly indexes = new Map<string, FakeSearchIndex<SearchProductDocument>>();
  readonly failAddForUid = new Set<string>();
  readonly statsOverrideByUid = new Map<string, number>();
  readonly swaps: Array<[string, string]> = [];
  readonly tasks = {
    waitForTask: async (task: unknown) => task
  };

  constructor(activeDocuments: SearchProductDocument[]) {
    this.indexes.set(SEARCH_INDEX_UID, new FakeSearchIndex(SEARCH_INDEX_UID, activeDocuments));
  }

  async getRawIndex(uid: string) {
    const index = this.indexes.get(uid);
    if (!index) {
      throw { cause: { code: "index_not_found" } };
    }

    return index;
  }

  async createIndex(uid: string) {
    const index = new FakeSearchIndex<SearchProductDocument>(uid);
    index.failOnAddMessage = this.failAddForUid.has(uid) ? "add failed" : null;
    index.statsOverride = this.statsOverrideByUid.get(uid) ?? null;
    this.indexes.set(uid, index);

    return { taskUid: `create:${uid}` };
  }

  async deleteIndex(uid: string) {
    if (!this.indexes.has(uid)) {
      throw { cause: { code: "index_not_found" } };
    }

    this.indexes.delete(uid);
    return { taskUid: `delete:${uid}` };
  }

  index<T>(uid: string): SearchIndex<T> {
    let index = this.indexes.get(uid);
    if (!index) {
      index = new FakeSearchIndex<SearchProductDocument>(uid);
      this.indexes.set(uid, index);
    }

    return index as unknown as SearchIndex<T>;
  }

  async swapIndexes(params: Array<{ indexes: [string, string] }>) {
    for (const { indexes } of params) {
      const [firstUid, secondUid] = indexes;
      const firstIndex = getFakeIndex(this, firstUid);
      const secondIndex = getFakeIndex(this, secondUid);
      const firstDocuments = firstIndex.documents;

      firstIndex.documents = secondIndex.documents;
      secondIndex.documents = firstDocuments;
      this.swaps.push([firstUid, secondUid]);
    }

    return { taskUid: "swap" };
  }
}

class FakeSearchIndex<T extends { id: string }> implements SearchIndex<T> {
  documents: T[];
  deleteAllDocumentsCount = 0;
  updateSettingsCount = 0;
  failOnAddMessage: string | null = null;
  statsOverride: number | null = null;

  constructor(readonly uid: string, documents: T[] = []) {
    this.documents = [...documents];
  }

  async updateSettings() {
    this.updateSettingsCount += 1;
    return { taskUid: `settings:${this.uid}` };
  }

  async deleteAllDocuments() {
    this.deleteAllDocumentsCount += 1;
    this.documents = [];
    return { taskUid: `delete-documents:${this.uid}` };
  }

  async addDocuments(documents: T[]) {
    if (this.failOnAddMessage) {
      throw new Error(this.failOnAddMessage);
    }

    this.documents.push(...documents);
    return { taskUid: `add-documents:${this.uid}` };
  }

  async getStats() {
    return {
      numberOfDocuments: this.statsOverride ?? this.documents.length
    };
  }
}

void runSearchIndexChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

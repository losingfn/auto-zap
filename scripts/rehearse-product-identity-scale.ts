import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import * as XLSX from "xlsx";
import { assertLocalTestDatabase } from "../src/lib/server/local-db-safety";

const { databaseUrl, databaseName } = assertLocalTestDatabase({
  requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS",
  purpose: "Stage 3 product identity rehearsal"
});
const sql = postgres(databaseUrl, { max: 1 });

const TEST_MEILI_PORT = 17700;
const TEST_MEILI_HOST = `http://127.0.0.1:${TEST_MEILI_PORT}`;
const BASE_PRODUCT_COUNT = 27_000;
const SURVIVING_SAFE_COUNT = 21_698;
const CONFLICT_CODES = [21_699, 21_700] as const;
const NEW_PRODUCT_COUNT = 3_300;
const REAPPEARING_PRODUCT_NUMBER = 27_000;
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const VERSION_ARCHIVE = "aaaaaaaa-0000-4000-8000-000000000001";
const VERSION_ONE = "aaaaaaaa-0000-4000-8000-000000000002";

type TaxonomyTarget = {
  categoryId: string;
  categorySlug: string;
  subcategoryId: string;
  subcategorySlug: string;
};

type SnapshotProduct = {
  shopCode: string;
  name: string;
  price: number;
};

type PurchaseListProduct = {
  productIdentityId: string;
  name: string;
  price: number;
  url: string;
};

type RehearsalMetrics = Record<string, { durationMs: number; rss: number; heapUsed: number }>;

const metrics: RehearsalMetrics = {};

async function main() {
  assert.equal(process.env.NODE_ENV, "test", "Stage 3 rehearsal requires NODE_ENV=test.");
  process.env.MEILI_HOST = TEST_MEILI_HOST;
  process.env.MEILI_MASTER_KEY = "stage3-isolated-meili-stub-key-0001";
  process.env.ADMIN_IMPORT_PERF_LOGS ??= "1";

  const meili = await startIsolatedMeiliStub();
  try {
    await reportAndVerifyTestTarget("schema reset and migration");
    await measure("schema_reset_and_migration", rebuildSchemaAndSeed);

    await reportAndVerifyTestTarget("baseline fixture");
    const targets = await measure("baseline_fixture", seedBaselineFixture);
    const baseline = await snapshotBaseline();
    console.log(`[stage3] baseline=${JSON.stringify(baseline)}`);

    // Project modules are imported only after the test-only Meilisearch endpoint is listening.
    const { createDraftImport } = await import("../src/features/import/draft-service");
    const { publishAdminImportBatch, getAdminImportPageData } = await import("../src/features/admin/imports");
    const {
      applyManualReviewCorrection,
      getAdminReviewPageData,
      publishReviewWorkspace
    } = await import("../src/features/admin/review");
    const { publishCatalogVersion } = await import("../src/features/import/publish-service");
    const { createImportPerfLogger } = await import("../src/lib/server/import-perf");
    const { POST } = await import("../src/app/api/purchase-list/route");
    const { searchProducts } = await import("../src/features/search/service");

    const savedIdentityIds = buildSavedPurchaseListIds();
    const initialPurchaseList = await loadPurchaseList(POST, savedIdentityIds);
    assert.equal(initialPurchaseList.length, 100, "V1 purchase list must resolve all saved identities.");

    const v2Rows = buildVersionTwoRows();
    const v2Perf = createImportPerfLogger();
    await reportAndVerifyTestTarget("V2 draft import");
    const v2Draft = await measure("v2_draft_import", () =>
      createDraftImport({
        filePath: "/private/tmp/autozap-stage3-v2.xlsx",
        fileBuffer: buildWorkbook(v2Rows),
        sourceFileName: "stage3-v2-realistic-update.xlsx",
        fileHash: createHash("sha256").update("stage3-v2").digest("hex"),
        uploadedBy: ADMIN_ID,
        perf: v2Perf
      })
    );
    v2Perf?.setImportBatchId(v2Draft.importBatchId);
    assert.equal(v2Draft.report.productCandidateRows, 25_000);
    assert.equal(v2Draft.report.addedCount, NEW_PRODUCT_COUNT);
    assert.equal(v2Draft.report.archivedCount, 5_300);
    assert.equal(v2Draft.report.reviewRows, 2);
    assert.equal(v2Draft.report.errorRows, 0);
    assert.equal(v2Draft.report.safety?.canPublish, true);
    await assertV2DraftIdentityResolution(v2Draft.catalogVersionId);

    const importPage = await getAdminImportPageData(v2Draft.importBatchId);
    assert.equal(importPage.selected?.id, v2Draft.importBatchId);
    assert.equal(importPage.selected?.canPublish, true);

    await reportAndVerifyTestTarget("V2 publish");
    await measure("v2_publish", () =>
      publishAdminImportBatch({
        importBatchId: v2Draft.importBatchId,
        adminUserId: ADMIN_ID,
        perf: v2Perf
      })
    );
    await assertVersionTwoPublished(v2Draft.catalogVersionId, savedIdentityIds, POST);

    const reviewPage = await getAdminReviewPageData(
      { scope: "active", pageSize: "20" },
      { adminUserId: ADMIN_ID, createWorkspaceIfNeeded: true }
    );
    assert.equal(reviewPage.queueCount, 2);
    assert.equal(reviewPage.items.length, 2);
    assert.ok(reviewPage.items.every((item) => item.identityConflict));

    const conflicts = await getOpenIdentityConflicts(v2Draft.catalogVersionId);
    assert.equal(conflicts.length, 2);
    const sameConflict = conflicts[0]!;
    const newConflict = conflicts[1]!;
    const sameTarget = targetForProductNumber(sameConflict.productNumber, targets);
    await reportAndVerifyTestTarget("review resolution (same)");
    await measure("review_same_resolution", () =>
      applyManualReviewCorrection({
        reviewQueueId: sameConflict.reviewQueueId,
        productId: sameConflict.productId,
        categoryId: sameTarget.categoryId,
        subcategoryId: sameTarget.subcategoryId,
        adminUserId: ADMIN_ID,
        learnRule: false,
        identityDecision: "same"
      })
    );

    await reportAndVerifyTestTarget("review publish with unresolved identity conflict");
    const partialReviewPublish = await measure("review_publish_unresolved_carry_forward", () =>
      publishReviewWorkspace({ adminUserId: ADMIN_ID })
    );
    await assertUnresolvedConflictCarriesForward({
      catalogVersionId: partialReviewPublish.catalogVersionId,
      unresolvedProductNumber: newConflict.productNumber,
      post: POST
    });
    console.log(
      "[stage3][safety-gap] unresolved identity conflict did not reject review publication; it was carried forward as non-public needs_review"
    );

    const [carriedConflict] = await getOpenIdentityConflicts(partialReviewPublish.catalogVersionId);
    assert.equal(carriedConflict?.productNumber, newConflict.productNumber);
    const newTarget = targetForProductNumber(carriedConflict!.productNumber, targets);
    await reportAndVerifyTestTarget("review resolution (new)");
    await measure("review_new_resolution", () =>
      applyManualReviewCorrection({
        reviewQueueId: carriedConflict!.reviewQueueId,
        productId: carriedConflict!.productId,
        categoryId: newTarget.categoryId,
        subcategoryId: newTarget.subcategoryId,
        adminUserId: ADMIN_ID,
        learnRule: false,
        identityDecision: "new"
      })
    );
    await reportAndVerifyTestTarget("review workspace publish");
    const reviewPublish = await measure("review_workspace_publish", () =>
      publishReviewWorkspace({ adminUserId: ADMIN_ID })
    );
    await assertReviewPublication(reviewPublish.catalogVersionId, sameConflict, newConflict);

    await reportAndVerifyTestTarget("missing identity publication rejection");
    await verifyMissingIdentityPublicationRejects(publishCatalogVersion, targets[0]!);

    await reportAndVerifyTestTarget("V4 reappearance draft import");
    const v4Rows = await buildVersionFourRows(reviewPublish.catalogVersionId);
    const v4Perf = createImportPerfLogger();
    const v4Draft = await measure("v4_reappearance_draft_import", () =>
      createDraftImport({
        filePath: "/private/tmp/autozap-stage3-v4.xlsx",
        fileBuffer: buildWorkbook(v4Rows),
        sourceFileName: "stage3-v4-reappearance.xlsx",
        fileHash: createHash("sha256").update("stage3-v4").digest("hex"),
        uploadedBy: ADMIN_ID,
        perf: v4Perf
      })
    );
    v4Perf?.setImportBatchId(v4Draft.importBatchId);
    assert.equal(v4Draft.report.productCandidateRows, 25_001);
    assert.equal(v4Draft.report.addedCount, 1, "Only reappearing shopCode must be a current-catalog new item.");
    assert.equal(v4Draft.report.reviewRows, 0);
    assert.equal(v4Draft.report.safety?.canPublish, true);

    const oldIdentity = identityId(REAPPEARING_PRODUCT_NUMBER);
    const v4Reappearance = await getProductByCode(v4Draft.catalogVersionId, shopCode(REAPPEARING_PRODUCT_NUMBER));
    assert.ok(v4Reappearance.productIdentityId);
    assert.notEqual(v4Reappearance.productIdentityId, oldIdentity);

    await reportAndVerifyTestTarget("V4 reappearance publish");
    await measure("v4_reappearance_publish", () =>
      publishAdminImportBatch({
        importBatchId: v4Draft.importBatchId,
        adminUserId: ADMIN_ID,
        perf: v4Perf
      })
    );

    await verifyReappearanceFailClosed({
      versionId: v4Draft.catalogVersionId,
      oldIdentity,
      newIdentity: v4Reappearance.productIdentityId!,
      savedIdentityIds,
      post: POST
    });
    await verifyDatabaseConstraints(v4Draft.catalogVersionId, oldIdentity, targets[0]!);
    await verifyPurchaseListBatchPerformance(POST, savedIdentityIds);
    await verifySearch(searchProducts, meili);
    await verifyApiValidation(POST, savedIdentityIds[0]!);
    await verifyFinalIntegrity({ baseline, finalVersionId: v4Draft.catalogVersionId });

    console.log(`[stage3] metrics=${JSON.stringify(metrics)}`);
    console.log(
      `[stage3] result=${JSON.stringify({
        activeProducts: 25_001,
        historicalReappearanceContinuity: "intentionally_not_implemented_for_safety",
        meili: "isolated_http_stub_only_no_real_test_meilisearch_available"
      })}`
    );
  } finally {
    await meili.close();
    await sql.end({ timeout: 10 });
  }
}

async function reportAndVerifyTestTarget(phase: string) {
  const [target] = await sql<{ database: string; user: string }[]>`
    SELECT current_database() AS database, current_user AS user
  `;
  console.log(`[stage3][db-target] phase=${phase} current_database=${target?.database} current_user=${target?.user}`);
  assert.equal(target?.database, databaseName);
  assert.equal(target?.user, "autozap_test");
}

async function rebuildSchemaAndSeed() {
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const migrationDirectory = path.join(process.cwd(), "db", "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    await sql.unsafe(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }

  for (const seed of ["001_categories.sql", "002_taxonomy_rules.sql", "003_search_synonyms.sql"]) {
    await sql.unsafe(await readFile(path.join(process.cwd(), "db", "seeds", seed), "utf8"));
  }

  await sql`
    INSERT INTO admin_users (id, email, full_name, password_hash, role)
    VALUES (${ADMIN_ID}, 'stage3@example.test', 'Stage 3 Test Admin', 'not-used-in-rehearsal', 'owner')
  `;
}

async function seedBaselineFixture(): Promise<TaxonomyTarget[]> {
  const targets = await loadFixtureTargets();
  await sql`
    INSERT INTO catalog_versions (id, status, source_file_name, published_at)
    VALUES
      (${VERSION_ARCHIVE}, 'archived', 'stage3-archived-baseline.xlsx', '2026-01-01T00:00:00Z'),
      (${VERSION_ONE}, 'active', 'stage3-v1-baseline.xlsx', '2026-02-01T00:00:00Z')
  `;

  for (const chunk of chunked(Array.from({ length: BASE_PRODUCT_COUNT }, (_, index) => identityId(index + 1)), 1_000)) {
    await sql.unsafe(
      `INSERT INTO product_identities (id) VALUES ${chunk.map((id) => `(${quote(id)})`).join(",")}`
    );
  }

  const initialProducts = Array.from({ length: BASE_PRODUCT_COUNT }, (_, offset) => {
    const productNumber = offset + 1;
    const target = targetForProductNumber(productNumber, targets);
    return {
      id: snapshotId("v1", productNumber),
      catalogVersionId: VERSION_ONE,
      productIdentityId: identityId(productNumber),
      shopCode: shopCode(productNumber),
      name: baselineName(productNumber),
      price: baselinePrice(productNumber),
      target
    };
  });
  await insertProducts(initialProducts);

  const archivedSnapshotProducts = initialProducts.slice(0, 120).map((product) => ({
    ...product,
    id: snapshotId("archive", Number(product.shopCode.slice(3))),
    catalogVersionId: VERSION_ARCHIVE,
    price: product.price - 5
  }));
  await insertProducts(archivedSnapshotProducts);
  return targets;
}

async function loadFixtureTargets(): Promise<TaxonomyTarget[]> {
  const rows = await sql<TaxonomyTarget[]>`
    SELECT
      c.id AS "categoryId",
      c.slug AS "categorySlug",
      s.id AS "subcategoryId",
      s.slug AS "subcategorySlug"
    FROM categories c
    INNER JOIN subcategories s ON s.category_id = c.id
    WHERE (c.slug, s.slug) IN (
      ('filtry-i-masla', 'maslyanye-filtry'),
      ('filtry-i-masla', 'vozdushnye-filtry'),
      ('tormoznaya-sistema', 'prochaya-tormoznaya-sistema')
    )
  `;
  assert.equal(rows.length, 3, "The seeded public taxonomy targets are required for Stage 3.");
  const order = [
    "filtry-i-masla/maslyanye-filtry",
    "filtry-i-masla/vozdushnye-filtry",
    "tormoznaya-sistema/prochaya-tormoznaya-sistema"
  ];
  return order.map((key) => {
    const target = rows.find((row) => `${row.categorySlug}/${row.subcategorySlug}` === key);
    assert.ok(target, `Missing target ${key}`);
    return target;
  });
}

async function insertProducts(
  rows: Array<{
    id: string;
    catalogVersionId: string;
    productIdentityId: string;
    shopCode: string;
    name: string;
    price: number;
    target: TaxonomyTarget;
  }>
) {
  for (const chunk of chunked(rows, 1_000)) {
    const values = chunk
      .map(
        (row) =>
          `(${quote(row.id)},${quote(row.catalogVersionId)},${quote(row.productIdentityId)},${quote(row.shopCode)},${quote(`${row.shopCode} ${row.name}`)},${quote(row.name)},${quote(slugFor(row.shopCode, row.name))},${row.price.toFixed(2)},3,${(row.price * 3).toFixed(2)},${quote(row.target.categoryId)},${quote(row.target.subcategoryId)},'active',${quote(`${row.shopCode} ${row.name}`)})`
      )
      .join(",");
    await sql.unsafe(`
      INSERT INTO products (
        id, catalog_version_id, product_identity_id, shop_code, raw_name, name, slug, price,
        stock_quantity, stock_sum, category_id, subcategory_id, status, search_text
      ) VALUES ${values}
    `);
  }
}

async function snapshotBaseline() {
  const [activeCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM products WHERE catalog_version_id = ${VERSION_ONE} AND status = 'active'
  `;
  const [versionCount] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM catalog_versions`;
  const checksum = await catalogChecksum(VERSION_ONE);
  const controls = await loadControls(VERSION_ONE);
  assert.equal(activeCount?.count, BASE_PRODUCT_COUNT);
  assert.equal(versionCount?.count, 2);
  return { activeCount: activeCount?.count ?? 0, versionCount: versionCount?.count ?? 0, checksum, controls };
}

async function catalogChecksum(catalogVersionId: string) {
  const rows = await sql<Array<{ shop_code: string; name: string; price: string; product_identity_id: string | null }>>`
    SELECT shop_code, name, price::text, product_identity_id
    FROM products
    WHERE catalog_version_id = ${catalogVersionId}
    ORDER BY shop_code
  `;
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(`${row.shop_code}|${row.name}|${row.price}|${row.product_identity_id ?? ""}\n`);
  }
  return hash.digest("hex");
}

async function loadControls(catalogVersionId: string) {
  return sql<Array<{ id: string; shop_code: string; name: string; price: string; slug: string; category: string; subcategory: string }>>`
    SELECT
      p.id,
      p.shop_code,
      p.name,
      p.price::text,
      p.slug,
      c.slug AS category,
      s.slug AS subcategory
    FROM products p
    INNER JOIN categories c ON c.id = p.category_id
    INNER JOIN subcategories s ON s.id = p.subcategory_id
    WHERE p.catalog_version_id = ${catalogVersionId}
      AND p.shop_code IN (${shopCode(1)}, ${shopCode(8_000)}, ${shopCode(18_001)}, ${shopCode(21_699)}, ${shopCode(REAPPEARING_PRODUCT_NUMBER)})
    ORDER BY p.shop_code
  `;
}

function buildVersionTwoRows(): SnapshotProduct[] {
  const rows: SnapshotProduct[] = [];
  for (let number = 1; number <= SURVIVING_SAFE_COUNT; number += 1) {
    rows.push({
      shopCode: shopCode(number),
      name: normalizedIncomingName(number),
      price: number <= 8_000 ? baselinePrice(number) + 17.5 : baselinePrice(number)
    });
  }
  for (const number of CONFLICT_CODES) {
    rows.push({
      shopCode: shopCode(number),
      name: `Колодки тормозные конфликт ${number}`,
      price: baselinePrice(number) + 23
    });
  }
  for (let number = BASE_PRODUCT_COUNT + 1; number <= BASE_PRODUCT_COUNT + NEW_PRODUCT_COUNT; number += 1) {
    rows.push({
      shopCode: shopCode(number),
      name: `Фильтр масляный новая серия ${number}`,
      price: 240 + (number % 800)
    });
  }
  assert.equal(rows.length, 25_000);
  return rows;
}

function normalizedIncomingName(number: number) {
  const name = baselineName(number);
  if (number < 18_001) return name;
  switch (number % 4) {
    case 0:
      return name.toUpperCase();
    case 1:
      return name.replaceAll(" ", "  ");
    case 2:
      return name.replace("Фильтр масляный", "Фильтр-масляный,");
    default:
      return name.replace("серия", "серия   ");
  }
}

function buildWorkbook(rows: SnapshotProduct[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Номенклатура", "Цена", "Остаток", "Сумма"],
    ...rows.map((row) => [`${row.shopCode} ${row.name}`, row.price, 3, row.price * 3])
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Каталог");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function assertV2DraftIdentityResolution(catalogVersionId: string) {
  const [priceUpdated] = await sql<{ product_identity_id: string; price: string }[]>`
    SELECT product_identity_id, price::text
    FROM products
    WHERE catalog_version_id = ${catalogVersionId} AND shop_code = ${shopCode(1)}
  `;
  assert.equal(priceUpdated?.product_identity_id, identityId(1));
  assert.equal(Number(priceUpdated?.price), baselinePrice(1) + 17.5);

  const normalized = await sql<Array<{ shop_code: string; product_identity_id: string | null }>>`
    SELECT shop_code, product_identity_id
    FROM products
    WHERE catalog_version_id = ${catalogVersionId}
      AND shop_code IN (${shopCode(18_001)}, ${shopCode(18_002)}, ${shopCode(18_003)}, ${shopCode(18_004)})
    ORDER BY shop_code
  `;
  assert.deepEqual(normalized.map((row) => row.product_identity_id), [identityId(18_001), identityId(18_002), identityId(18_003), identityId(18_004)]);

  const conflicts = await sql<Array<{ shop_code: string; product_identity_id: string | null; status: string }>>`
    SELECT shop_code, product_identity_id, status
    FROM products
    WHERE catalog_version_id = ${catalogVersionId}
      AND shop_code IN (${shopCode(CONFLICT_CODES[0])}, ${shopCode(CONFLICT_CODES[1])})
    ORDER BY shop_code
  `;
  assert.deepEqual(conflicts.map((row) => row.product_identity_id), [null, null]);
  assert.deepEqual(conflicts.map((row) => row.status), ["needs_review", "needs_review"]);
}

async function assertVersionTwoPublished(
  catalogVersionId: string,
  savedIdentityIds: string[],
  post: typeof import("../src/app/api/purchase-list/route").POST
) {
  const [active] = await sql<{ id: string }[]>`SELECT id FROM catalog_versions WHERE status = 'active'`;
  assert.equal(active?.id, catalogVersionId);
  const [activeCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM products WHERE catalog_version_id = ${catalogVersionId} AND status = 'active'
  `;
  assert.equal(activeCount?.count, 24_998);

  const afterUpdate = await loadPurchaseList(post, savedIdentityIds);
  assert.equal(afterUpdate.length, 70, "Absent identities must not resolve through archived V1.");
  assert.equal(afterUpdate.find((product) => product.productIdentityId === identityId(1))?.price, baselinePrice(1) + 17.5);
  assert.equal(afterUpdate.some((product) => product.productIdentityId === identityId(REAPPEARING_PRODUCT_NUMBER)), false);

  const [archivedX] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM products p
    INNER JOIN catalog_versions v ON v.id = p.catalog_version_id
    WHERE p.product_identity_id = ${identityId(REAPPEARING_PRODUCT_NUMBER)} AND v.status = 'archived'
  `;
  assert.ok((archivedX?.count ?? 0) >= 1);
}

async function getOpenIdentityConflicts(catalogVersionId: string) {
  const rows = await sql<Array<{ reviewQueueId: string; productId: string; shopCode: string }>>`
    SELECT rq.id AS "reviewQueueId", p.id AS "productId", p.shop_code AS "shopCode"
    FROM review_queue rq
    INNER JOIN products p ON p.id = rq.product_id
    WHERE rq.catalog_version_id = ${catalogVersionId}
      AND rq.status = 'open'
      AND rq.identity_candidate_id IS NOT NULL
    ORDER BY p.shop_code
  `;
  return rows.map((row) => ({ ...row, productNumber: Number(row.shopCode.slice(3)) }));
}

async function assertReviewPublication(
  catalogVersionId: string,
  sameConflict: { productNumber: number },
  newConflict: { productNumber: number }
) {
  const [active] = await sql<{ id: string }[]>`SELECT id FROM catalog_versions WHERE status = 'active'`;
  assert.equal(active?.id, catalogVersionId);
  const [activeCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM products WHERE catalog_version_id = ${catalogVersionId} AND status = 'active'
  `;
  assert.equal(activeCount?.count, 25_000);
  const rows = await sql<Array<{ shop_code: string; product_identity_id: string }>>`
    SELECT shop_code, product_identity_id
    FROM products
    WHERE catalog_version_id = ${catalogVersionId}
      AND shop_code IN (${shopCode(sameConflict.productNumber)}, ${shopCode(newConflict.productNumber)})
    ORDER BY shop_code
  `;
  assert.equal(rows[0]?.product_identity_id, identityId(sameConflict.productNumber));
  assert.notEqual(rows[1]?.product_identity_id, identityId(newConflict.productNumber));
}

async function assertUnresolvedConflictCarriesForward({
  catalogVersionId,
  unresolvedProductNumber,
  post
}: {
  catalogVersionId: string;
  unresolvedProductNumber: number;
  post: typeof import("../src/app/api/purchase-list/route").POST;
}) {
  const [status] = await sql<{ status: string; product_identity_id: string | null }[]>`
    SELECT status, product_identity_id
    FROM products
    WHERE catalog_version_id = ${catalogVersionId} AND shop_code = ${shopCode(unresolvedProductNumber)}
  `;
  assert.equal(status?.status, "needs_review");
  assert.equal(status?.product_identity_id, null);
  assert.deepEqual(await loadPurchaseList(post, [identityId(unresolvedProductNumber)]), []);
  const conflicts = await getOpenIdentityConflicts(catalogVersionId);
  assert.equal(conflicts.length, 1);
}

async function verifyMissingIdentityPublicationRejects(
  publishCatalogVersion: typeof import("../src/features/import/publish-service").publishCatalogVersion,
  target: TaxonomyTarget
) {
  const missingIdentityVersionId = "aaaaaaaa-0000-4000-8000-000000000010";
  await sql`
    INSERT INTO catalog_versions (id, status, source_file_name)
    VALUES (${missingIdentityVersionId}, 'draft', 'stage3-missing-identity.xlsx')
  `;
  await sql`
    INSERT INTO products (
      id, catalog_version_id, shop_code, raw_name, name, slug, price, category_id, subcategory_id, status, search_text
    ) VALUES (
      ${snapshotId("missing", 1)}, ${missingIdentityVersionId}, 'AZ-990001', 'AZ-990001 Фильтр масляный контроль',
      'Фильтр масляный контроль', 'az-990001-filtr-maslyanyy-kontrol', 100,
      ${target.categoryId}, ${target.subcategoryId}, 'active', 'AZ-990001 Фильтр масляный контроль'
    )
  `;
  const report = minimalPublishReport();
  await assert.rejects(
    () => publishCatalogVersion({ catalogVersionId: missingIdentityVersionId, report }),
    (error: unknown) => {
      if (!(error instanceof Error) || !("report" in error)) return false;
      const checks = (error as { report?: { checks?: Array<{ code?: string; status?: string }> } }).report?.checks;
      return checks?.some((check) => check.code === "missing_product_identity" && check.status === "blocked") === true;
    },
    "Active product without productIdentityId must fail the publish safety gate."
  );
  await sql`UPDATE catalog_versions SET status = 'rolled_back' WHERE id = ${missingIdentityVersionId}`;
}

function minimalPublishReport(): import("../src/features/import/types").ImportPreviewReport {
  return {
    fileName: "stage3-safety.xlsx",
    selectedSheetName: "Каталог",
    sheets: [],
    totalRows: 1,
    parsedRows: 1,
    productCandidateRows: 1,
    validRows: 1,
    addedCount: 0,
    updatedCount: 1,
    unchangedCount: 0,
    archivedCount: 0,
    reviewRows: 0,
    errorRows: 0,
    skippedRows: 0,
    issueCounts: {},
    priceChanges: {
      existingWithPriceCount: 1,
      existingPriceUpdatedCount: 0,
      increasedCount: 0,
      decreasedCount: 0,
      unchangedCount: 1,
      maxIncreaseAmount: 0,
      maxIncreasePercent: 0,
      maxDecreaseAmount: 0,
      maxDecreasePercent: 0,
      averageChangeAmount: 0,
      averageChangePercent: 0
    },
    examples: {
      valid: [],
      needsReview: [],
      errors: []
    },
    autoCategorizationPreview: {
      totalProducts: 1,
      legacyMatched: 1,
      legacyNeedsReview: 0,
      existingCategoryPreserved: 1,
      shadowHigh: 1,
      shadowMedium: 0,
      shadowLow: 0,
      wouldAutoPublish: 1,
      wouldRequireReview: 0,
      highConfidence: 1,
      mediumConfidence: 0,
      lowConfidence: 0,
      needsReview: 0,
      emptyName: 0,
      averageConfidence: 1,
      automationPotential: 1,
      threshold: 0.9,
      sources: [],
      topUnresolvedGroups: [],
      dangerousGroups: [],
      highConfidenceExamples: [],
      lowConfidenceExamples: []
    }
  };
}

async function buildVersionFourRows(sourceVersionId: string): Promise<SnapshotProduct[]> {
  const rows = await sql<Array<{ shop_code: string; name: string; price: string }>>`
    SELECT shop_code, name, price::text
    FROM products
    WHERE catalog_version_id = ${sourceVersionId} AND status = 'active'
    ORDER BY shop_code
  `;
  assert.equal(rows.length, 25_000);
  const result = rows.map((row, index) => ({
    shopCode: row.shop_code,
    name: row.name,
    price: Number(row.price) + (index < 500 ? 3 : 0)
  }));
  result.push({
    shopCode: shopCode(REAPPEARING_PRODUCT_NUMBER),
    name: baselineName(REAPPEARING_PRODUCT_NUMBER),
    price: baselinePrice(REAPPEARING_PRODUCT_NUMBER) + 50
  });
  return result;
}

async function getProductByCode(catalogVersionId: string, code: string) {
  const [product] = await sql<{ productIdentityId: string | null; id: string; name: string; price: string }[]>`
    SELECT product_identity_id AS "productIdentityId", id, name, price::text
    FROM products
    WHERE catalog_version_id = ${catalogVersionId} AND shop_code = ${code}
  `;
  assert.ok(product, `Expected ${code} in catalog ${catalogVersionId}`);
  return product;
}

async function verifyReappearanceFailClosed({
  versionId,
  oldIdentity,
  newIdentity,
  savedIdentityIds,
  post
}: {
  versionId: string;
  oldIdentity: string;
  newIdentity: string;
  savedIdentityIds: string[];
  post: typeof import("../src/app/api/purchase-list/route").POST;
}) {
  const [active] = await sql<{ id: string }[]>`SELECT id FROM catalog_versions WHERE status = 'active'`;
  assert.equal(active?.id, versionId);
  const oldLookup = await loadPurchaseList(post, [oldIdentity]);
  assert.deepEqual(oldLookup, [], "Current public lookup must not substitute a returned shopCode for old identity X.");
  const newLookup = await loadPurchaseList(post, [newIdentity]);
  assert.equal(newLookup.length, 1);
  assert.equal(newLookup[0]?.productIdentityId, newIdentity);

  const savedAfterReappearance = await loadPurchaseList(post, savedIdentityIds);
  assert.equal(savedAfterReappearance.length, 70);
  assert.equal(savedAfterReappearance.some((product) => product.productIdentityId === newIdentity), false);
  assert.equal(savedAfterReappearance.some((product) => product.productIdentityId === oldIdentity), false);

  const [oldIdentityRow] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM product_identities WHERE id = ${oldIdentity}
  `;
  assert.equal(oldIdentityRow?.count, 1, "Archived identity X must remain durable.");
}

async function verifyDatabaseConstraints(catalogVersionId: string, archivedIdentity: string, target: TaxonomyTarget) {
  const [duplicates] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM (
      SELECT product_identity_id
      FROM products
      WHERE catalog_version_id = ${catalogVersionId} AND product_identity_id IS NOT NULL
      GROUP BY product_identity_id
      HAVING count(*) > 1
    ) duplicates
  `;
  assert.equal(duplicates?.count, 0);

  const [orphans] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM products p
    LEFT JOIN product_identities pi ON pi.id = p.product_identity_id
    WHERE p.catalog_version_id = ${catalogVersionId}
      AND p.product_identity_id IS NOT NULL
      AND pi.id IS NULL
  `;
  assert.equal(orphans?.count, 0);

  await assert.rejects(
    () =>
      sql`
        INSERT INTO products (
          id, catalog_version_id, product_identity_id, shop_code, raw_name, name, slug, price,
          category_id, subcategory_id, status, search_text
        ) VALUES (
          ${snapshotId("duplicate", 1)}, ${catalogVersionId}, ${identityId(1)}, 'AZ-990002',
          'AZ-990002 duplicate', 'duplicate', 'az-990002-duplicate', 100,
          ${target.categoryId}, ${target.subcategoryId}, 'active', 'duplicate'
        )
      `,
    /duplicate key|products_version_identity_unique/
  );

  await assert.rejects(
    () => sql`DELETE FROM product_identities WHERE id = ${archivedIdentity}`,
    /foreign key|restrict/i,
    "FK ON DELETE RESTRICT must protect archived identity X."
  );
}

async function verifyPurchaseListBatchPerformance(
  post: typeof import("../src/app/api/purchase-list/route").POST,
  savedIdentityIds: string[]
) {
  for (const size of [1, 10, 50, 100]) {
    const ids = savedIdentityIds.slice(0, size);
    const startedAt = performance.now();
    const response = await post(requestWithJson({ productIdentityIds: ids }));
    const body = await response.text();
    const durationMs = performance.now() - startedAt;
    assert.equal(response.status, 200);
    console.log(
      `[stage3][purchase-list-batch] requested=${size} returned=${JSON.parse(body).products.length} duration_ms=${Math.round(durationMs)} bytes=${Buffer.byteLength(body)}`
    );
  }
}

async function verifySearch(
  searchProducts: typeof import("../src/features/search/service").searchProducts,
  meili: IsolatedMeiliStub
) {
  const meiliResult = await searchProducts({ query: shopCode(1), limit: 20 });
  assert.equal(meiliResult.source, "meilisearch");
  assert.equal(meiliResult.hits[0]?.productIdentityId, identityId(1));

  meili.failSearches = true;
  try {
    const fallback = await searchProducts({ query: shopCode(1), limit: 20 });
    assert.equal(fallback.source, "postgres_fallback");
    assert.equal(fallback.hits[0]?.productIdentityId, identityId(1));
  } finally {
    meili.failSearches = false;
  }
}

async function verifyApiValidation(
  post: typeof import("../src/app/api/purchase-list/route").POST,
  validIdentity: string
) {
  const malformed = await post(requestWithJson({ productIdentityIds: ["not-a-uuid"] }));
  const oversized = await post(requestWithJson({ productIdentityIds: Array.from({ length: 101 }, () => validIdentity) }));
  assert.equal(malformed.status, 400);
  assert.equal(oversized.status, 400);
}

async function verifyFinalIntegrity({
  baseline,
  finalVersionId
}: {
  baseline: Awaited<ReturnType<typeof snapshotBaseline>>;
  finalVersionId: string;
}) {
  const [activeVersions] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM catalog_versions WHERE status = 'active'`;
  const [activeProducts] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM products WHERE catalog_version_id = ${finalVersionId} AND status = 'active'
  `;
  const [missingIdentity] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM products
    WHERE catalog_version_id = ${finalVersionId} AND status = 'active' AND product_identity_id IS NULL
  `;
  const [unresolvedPublic] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM products
    WHERE catalog_version_id = ${finalVersionId} AND status IN ('needs_review', 'invalid')
  `;
  assert.equal(activeVersions?.count, 1);
  assert.equal(activeProducts?.count, 25_001);
  assert.equal(missingIdentity?.count, 0);
  assert.equal(unresolvedPublic?.count, 0);

  const currentV1Checksum = await catalogChecksum(VERSION_ONE);
  const currentV1Controls = await loadControls(VERSION_ONE);
  assert.equal(currentV1Checksum, baseline.checksum, "Archived V1 snapshot must remain immutable.");
  assert.deepEqual(currentV1Controls, baseline.controls);

  const [archiveVersion] = await sql<{ status: string }[]>`SELECT status FROM catalog_versions WHERE id = ${VERSION_ONE}`;
  assert.equal(archiveVersion?.status, "archived");
}

function buildSavedPurchaseListIds() {
  return [
    ...Array.from({ length: 30 }, (_, index) => identityId(index + 1)),
    ...Array.from({ length: 20 }, (_, index) => identityId(9_001 + index)),
    ...Array.from({ length: 20 }, (_, index) => identityId(18_001 + index)),
    ...Array.from({ length: 30 }, (_, index) => identityId(26_971 + index))
  ];
}

async function loadPurchaseList(
  post: typeof import("../src/app/api/purchase-list/route").POST,
  productIdentityIds: string[]
): Promise<PurchaseListProduct[]> {
  const response = await post(requestWithJson({ productIdentityIds }));
  assert.equal(response.status, 200);
  return (await response.json() as { products: PurchaseListProduct[] }).products;
}

function requestWithJson(body: unknown) {
  return new Request("http://localhost/api/purchase-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function targetForProductNumber(number: number, targets: TaxonomyTarget[]) {
  return targets[(number - 1) % targets.length]!;
}

function identityId(number: number) {
  return deterministicUuid("11111111", number);
}

function snapshotId(version: string, number: number) {
  const prefix: Record<string, string> = {
    archive: "22222222",
    v1: "33333333",
    missing: "44444444",
    duplicate: "55555555"
  };
  return deterministicUuid(prefix[version] ?? "66666666", number);
}

function deterministicUuid(prefix: string, number: number) {
  return `${prefix}-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
}

function shopCode(number: number) {
  // The real parser folds a Latin A into the Cyrillic catalog alphabet; seed the active
  // snapshot in that canonical form so the rehearsal exercises actual matching semantics.
  return `АZ-${String(number).padStart(6, "0")}`;
}

function baselineName(number: number) {
  return `Фильтр масляный серия ${number}`;
}

function baselinePrice(number: number) {
  return 120 + (number % 800);
}

function slugFor(code: string, name: string) {
  return `${code.toLowerCase()}-${name
    .toLowerCase()
    .replace(/[а-яё]/g, (letter) =>
      ({
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", ъ: "", ь: "" } as Record<string, string>)[letter] ?? ""
    )
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function measure<T>(name: string, operation: () => Promise<T>) {
  const startedAt = performance.now();
  const result = await operation();
  const memory = process.memoryUsage();
  const measurement = {
    durationMs: Math.round(performance.now() - startedAt),
    rss: memory.rss,
    heapUsed: memory.heapUsed
  };
  metrics[name] = measurement;
  console.log(`[stage3][metric] name=${name} duration_ms=${measurement.durationMs} rss=${measurement.rss} heap_used=${measurement.heapUsed}`);
  return result;
}

type StubIndex = {
  primaryKey: string;
  documentCount: number;
  documents: Map<string, Record<string, unknown>>;
};

type IsolatedMeiliStub = {
  close: () => Promise<void>;
  failSearches: boolean;
};

async function startIsolatedMeiliStub(): Promise<IsolatedMeiliStub> {
  const indexes = new Map<string, StubIndex>();
  let nextTaskId = 0;
  const state: IsolatedMeiliStub = {
    failSearches: false,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", TEST_MEILI_HOST);
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const body = await readJsonBody(request);
      const task = (type: string) => ({
        taskUid: ++nextTaskId,
        uid: nextTaskId,
        status: "succeeded",
        type,
        enqueuedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString()
      });
      const indexUid = parts[1];

      if (request.method === "GET" && parts[0] === "tasks" && parts[1]) {
        return sendJson(response, 200, task("task"));
      }
      if (request.method === "POST" && url.pathname === "/indexes") {
        const value = asRecord(body);
        const uid = typeof value.uid === "string" ? value.uid : "";
        if (!uid) return sendJson(response, 400, { code: "missing_index_uid" });
        indexes.set(uid, {
          primaryKey: typeof value.primaryKey === "string" ? value.primaryKey : "id",
          documentCount: 0,
          documents: new Map()
        });
        return sendJson(response, 202, task("indexCreation"));
      }
      if (parts[0] === "indexes" && indexUid) {
        const index = indexes.get(indexUid);
        if (!index) return sendJson(response, 404, { message: "Index not found", code: "index_not_found", type: "invalid_request" });
        if (request.method === "GET" && parts.length === 2) {
          return sendJson(response, 200, { uid: indexUid, primaryKey: index.primaryKey, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
        }
        if (request.method === "DELETE" && parts.length === 2) {
          indexes.delete(indexUid);
          return sendJson(response, 202, task("indexDeletion"));
        }
        if (request.method === "PATCH" && parts[2] === "settings") {
          return sendJson(response, 202, task("settingsUpdate"));
        }
        if (request.method === "DELETE" && parts[2] === "documents") {
          index.documents.clear();
          index.documentCount = 0;
          return sendJson(response, 202, task("documentDeletion"));
        }
        if (request.method === "POST" && parts[2] === "documents") {
          const documents = Array.isArray(body) ? body : [];
          for (const document of documents) {
            const item = asRecord(document);
            const id = item[index.primaryKey];
            if (typeof id === "string") {
              index.documentCount += 1;
              // The real service is external to Node. Retain only the control document needed
              // for contract search here, while still validating all upload batches and counts.
              if (item.shopCode === shopCode(1)) index.documents.set(id, item);
            }
          }
          return sendJson(response, 202, task("documentAdditionOrUpdate"));
        }
        if (request.method === "GET" && parts[2] === "stats") {
          return sendJson(response, 200, { numberOfDocuments: index.documentCount, isIndexing: false, fieldDistribution: {} });
        }
        if (request.method === "POST" && parts[2] === "search") {
          if (state.failSearches) return sendJson(response, 503, { message: "Stage 3 forced search outage", code: "internal" });
          const input = asRecord(body);
          const query = String(input.q ?? "").toLocaleLowerCase("ru-RU");
          const limit = typeof input.limit === "number" ? input.limit : 20;
          const hits = [...index.documents.values()]
            .filter((document) => JSON.stringify(document).toLocaleLowerCase("ru-RU").includes(query))
            .slice(0, limit)
            .map((document) => ({ ...document, _rankingScore: 1 }));
          return sendJson(response, 200, { hits, estimatedTotalHits: hits.length, processingTimeMs: 0, query });
        }
      }
      if (request.method === "POST" && url.pathname === "/swap-indexes") {
        const swaps = Array.isArray(body) ? body : [];
        for (const item of swaps) {
          const indexesValue = asRecord(item).indexes;
          if (!Array.isArray(indexesValue) || indexesValue.length !== 2 || !indexesValue.every((value) => typeof value === "string")) {
            return sendJson(response, 400, { code: "invalid_swap" });
          }
          const [left, right] = indexesValue;
          const leftIndex = indexes.get(left);
          const rightIndex = indexes.get(right);
          if (!leftIndex || !rightIndex) return sendJson(response, 404, { code: "index_not_found" });
          indexes.set(left, rightIndex);
          indexes.set(right, leftIndex);
        }
        return sendJson(response, 202, task("indexSwap"));
      }
      return sendJson(response, 404, { code: "not_found" });
    } catch (error) {
      return sendJson(response, 500, { message: error instanceof Error ? error.message : String(error), code: "internal" });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(TEST_MEILI_PORT, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.log(`[stage3] isolated Meilisearch protocol stub listening on ${TEST_MEILI_HOST}`);
  return state;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

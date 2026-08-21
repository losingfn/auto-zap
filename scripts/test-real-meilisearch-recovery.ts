import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SearchIndexClient } from "../src/features/search/meilisearch";
import type { SearchProductDocument } from "../src/features/search/types";

const host = process.env.REAL_MEILI_TEST_HOST;
const apiKey = process.env.REAL_MEILI_TEST_KEY;

if (!host || !apiKey) {
  throw new Error("REAL_MEILI_TEST_HOST and REAL_MEILI_TEST_KEY are required.");
}

async function main() {
  const { MeiliSearch } = await import("meilisearch");
  const {
    getPublishReconciliationAction
  } = await import("../src/features/import/worker-service");
  const { prepareSearchIndexDocumentsWithClient, swapPreparedSearchIndexWithClient } = await import("../src/features/search/meilisearch");

  const client = new MeiliSearch({ host: host!, apiKey: apiKey! }) as unknown as SearchIndexClient;
  const suffix = randomUUID().replaceAll("-", "");
  const targetIndexUid = `autozap_recovery_test_${suffix}`;
  const stagingIndexUid = `${targetIndexUid}_staging`;
  const oldVersionId = `old-${suffix}`;
  const newVersionId = `new-${suffix}`;

  try {
    await replaceCatalogIndex(client, targetIndexUid, `${targetIndexUid}_old`, oldVersionId);
    assert.equal(await readLiveCatalogVersionId(client, targetIndexUid), oldVersionId);

    const prepared = await prepareSearchIndexDocumentsWithClient(
      client,
      [documentFor(newVersionId)],
      [],
      { targetIndexUid, stagingIndexUid, expectedDocumentCount: 1 }
    );

    // A failure before swap leaves the old live index intact.
    assert.equal(await readLiveCatalogVersionId(client, targetIndexUid), oldVersionId);

    await swapPreparedSearchIndexWithClient(client, prepared);
    assert.equal(await readLiveCatalogVersionId(client, targetIndexUid), newVersionId);

    assert.equal(
      getPublishReconciliationAction({
        activeCatalogVersionId: oldVersionId,
        liveCatalogVersionId: newVersionId,
        targetCatalogVersionId: newVersionId,
        batchStatus: "analyzed"
      }),
      "activate_database"
    );

    // Simulate a post-commit reverse mismatch, then restore the index to the
    // PostgreSQL-active version using the same real Meilisearch swap path.
    await replaceCatalogIndex(client, targetIndexUid, `${targetIndexUid}_reverse`, oldVersionId);
    assert.equal(await readLiveCatalogVersionId(client, targetIndexUid), oldVersionId);
    assert.equal(
      getPublishReconciliationAction({
        activeCatalogVersionId: newVersionId,
        liveCatalogVersionId: oldVersionId,
        targetCatalogVersionId: newVersionId,
        batchStatus: "published"
      }),
      "sync_search_to_database"
    );
    await replaceCatalogIndex(client, targetIndexUid, `${targetIndexUid}_reconciled`, newVersionId);
    assert.equal(await readLiveCatalogVersionId(client, targetIndexUid), newVersionId);

    console.log("ok - real Meilisearch staging, swap, crash-state detection, and reverse reconciliation");
  } finally {
    await deleteIndexIfPresent(client, targetIndexUid);
    await deleteIndexIfPresent(client, stagingIndexUid);
  }
}

async function replaceCatalogIndex(
  client: SearchIndexClient,
  targetIndexUid: string,
  stagingIndexUid: string,
  catalogVersionId: string
) {
  const { prepareSearchIndexDocumentsWithClient, swapPreparedSearchIndexWithClient } = await import("../src/features/search/meilisearch");
  const prepared = await prepareSearchIndexDocumentsWithClient(
    client,
    [documentFor(catalogVersionId)],
    [],
    { targetIndexUid, stagingIndexUid, expectedDocumentCount: 1 }
  );
  await swapPreparedSearchIndexWithClient(client, prepared);
}

function documentFor(catalogVersionId: string): SearchProductDocument {
  return {
    id: `product-${catalogVersionId}`,
    catalogVersionId,
    productIdentityId: null,
    shopCode: "TEST-1",
    shopCodeNormalized: "test-1",
    shopCodeCompact: "test1",
    name: "Тестовый товар",
    rawName: "Тестовый товар",
    slug: "test-product",
    price: 1,
    categorySlug: "test",
    categoryName: "Тест",
    subcategorySlug: "test",
    subcategoryName: "Тест",
    url: "/catalog/test/test/test-product",
    status: "active",
    searchText: "Тестовый товар",
    normalizedText: "тестовый товар",
    synonymText: "",
    translitText: "testovy tovar",
    brandText: ""
  };
}

async function readLiveCatalogVersionId(
  client: SearchIndexClient,
  targetIndexUid: string
) {
  const index = client.index<{ catalogVersionId: string }>(targetIndexUid) as unknown as {
    getDocuments(options: { limit: number; fields: string[] }): Promise<{ results: Array<{ catalogVersionId?: string }> }>;
  };
  const result = await index.getDocuments({ limit: 1, fields: ["catalogVersionId"] });
  return result.results[0]?.catalogVersionId ?? null;
}

async function deleteIndexIfPresent(
  client: SearchIndexClient,
  indexUid: string
) {
  try {
    await client.tasks.waitForTask(await client.deleteIndex(indexUid));
  } catch {
    // Test indexes are random and may not have been created before a failure.
  }
}

main().catch((error) => {
  console.error("[real-meilisearch-test] failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});

import { MeiliSearch } from "meilisearch";
import { env } from "@/lib/env";
import type { ImportPerfLogger } from "@/lib/server/import-perf";
import { buildMeiliSynonyms } from "./synonyms";
import type { SearchProductDocument, SearchSynonymRecord } from "./types";

export const SEARCH_INDEX_UID = "autozap_products_active";

let cachedClient: MeiliSearch | null = null;

export function getMeiliClient() {
  if (!cachedClient) {
    cachedClient = new MeiliSearch({
      host: env.MEILI_HOST,
      apiKey: env.MEILI_MASTER_KEY || env.MEILI_SEARCH_KEY
    });
  }

  return cachedClient;
}

export function getSearchIndex() {
  return getMeiliClient().index<SearchProductDocument>(SEARCH_INDEX_UID);
}

type SearchIndexTask = unknown;

export interface SearchIndexClient {
  tasks: {
    waitForTask(task: SearchIndexTask): Promise<unknown>;
  };
  getRawIndex(uid: string): Promise<unknown>;
  createIndex(uid: string, options: { primaryKey: string }): Promise<SearchIndexTask>;
  deleteIndex(uid: string): Promise<SearchIndexTask>;
  index<T>(uid: string): SearchIndex<T>;
  swapIndexes(params: Array<{ indexes: [string, string] }>): Promise<SearchIndexTask>;
}

export interface SearchIndex<T> {
  updateSettings(settings: ReturnType<typeof buildSearchIndexSettings>): Promise<SearchIndexTask>;
  deleteAllDocuments(): Promise<SearchIndexTask>;
  addDocuments(documents: T[], options: { primaryKey: string }): Promise<SearchIndexTask>;
  getStats(): Promise<{ numberOfDocuments: number }>;
}

export interface ReplaceSearchIndexOptions {
  expectedDocumentCount?: number;
  stagingIndexUid?: string;
  targetIndexUid?: string;
  perf?: ImportPerfLogger;
}

export interface PreparedSearchIndex {
  targetIndexUid: string;
  stagingIndexUid: string;
  indexedCount: number;
}

export async function ensureSearchIndex(
  synonyms: SearchSynonymRecord[],
  indexUid = SEARCH_INDEX_UID,
  client: SearchIndexClient = getMeiliClient() as SearchIndexClient
) {
  await ensureSearchIndexExists(client, indexUid);

  const index = client.index<SearchProductDocument>(indexUid);
  await client.tasks.waitForTask(
    await index.updateSettings(buildSearchIndexSettings(synonyms))
  );

  return index;
}

export function buildStagingSearchIndexUid(catalogVersionId: string) {
  const suffix = catalogVersionId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return `${SEARCH_INDEX_UID}__staging__${suffix || "catalog"}`;
}

export async function replaceSearchIndexDocuments(
  documents: SearchProductDocument[],
  synonyms: SearchSynonymRecord[],
  options: ReplaceSearchIndexOptions = {}
) {
  return replaceSearchIndexDocumentsWithClient(
    getMeiliClient() as SearchIndexClient,
    documents,
    synonyms,
    options
  );
}

export async function replaceSearchIndexDocumentsWithClient(
  client: SearchIndexClient,
  documents: SearchProductDocument[],
  synonyms: SearchSynonymRecord[],
  options: ReplaceSearchIndexOptions = {}
) {
  const prepared = await prepareSearchIndexDocumentsWithClient(
    client,
    documents,
    synonyms,
    options
  );
  await swapPreparedSearchIndexWithClient(client, prepared, options.perf);

  return {
    indexUid: prepared.targetIndexUid,
    stagingIndexUid: prepared.stagingIndexUid,
    indexedCount: prepared.indexedCount
  };
}

export async function prepareSearchIndexDocuments(
  documents: SearchProductDocument[],
  synonyms: SearchSynonymRecord[],
  options: ReplaceSearchIndexOptions = {}
) {
  return prepareSearchIndexDocumentsWithClient(
    getMeiliClient() as SearchIndexClient,
    documents,
    synonyms,
    options
  );
}

export async function prepareSearchIndexDocumentsWithClient(
  client: SearchIndexClient,
  documents: SearchProductDocument[],
  synonyms: SearchSynonymRecord[],
  options: ReplaceSearchIndexOptions = {}
): Promise<PreparedSearchIndex> {
  const targetIndexUid = options.targetIndexUid ?? SEARCH_INDEX_UID;
  const perf = options.perf;
  const stagingIndexUid =
    options.stagingIndexUid ?? `${targetIndexUid}__staging__manual`;
  const expectedDocumentCount = options.expectedDocumentCount ?? documents.length;

  await ensureSearchIndexExists(client, targetIndexUid, perf);
  const stagingIndex = await prepareFreshSearchIndex(client, stagingIndexUid, synonyms, perf);

  await waitForSearchTask(client, await stagingIndex.deleteAllDocuments(), perf);

  for (let indexStart = 0; indexStart < documents.length; indexStart += 1000) {
    const chunk = documents.slice(indexStart, indexStart + 1000);
    const task = perf
      ? await perf.measure(
          "upload_meilisearch_batch",
          () => stagingIndex.addDocuments(chunk, { primaryKey: "id" }),
          { rows: chunk.length }
        )
      : await stagingIndex.addDocuments(chunk, { primaryKey: "id" });
    await waitForSearchTask(client, task, perf);
  }

  const stats = await stagingIndex.getStats();
  if (stats.numberOfDocuments !== expectedDocumentCount) {
    throw new Error(
      `Поисковый индекс подготовлен не полностью: ожидалось ${expectedDocumentCount}, получено ${stats.numberOfDocuments}.`
    );
  }

  return {
    targetIndexUid,
    stagingIndexUid,
    indexedCount: documents.length
  };
}

export async function swapPreparedSearchIndex(
  prepared: PreparedSearchIndex,
  perf?: ImportPerfLogger
) {
  return swapPreparedSearchIndexWithClient(getMeiliClient() as SearchIndexClient, prepared, perf);
}

export async function swapPreparedSearchIndexWithClient(
  client: SearchIndexClient,
  prepared: PreparedSearchIndex,
  perf?: ImportPerfLogger
) {
  const task = perf
    ? await perf.measure("swap_meilisearch_index", () =>
        client.swapIndexes([{ indexes: [prepared.targetIndexUid, prepared.stagingIndexUid] }])
      )
    : await client.swapIndexes([{ indexes: [prepared.targetIndexUid, prepared.stagingIndexUid] }]);
  await waitForSearchTask(client, task, perf);

  return {
    indexUid: prepared.targetIndexUid,
    stagingIndexUid: prepared.stagingIndexUid,
    indexedCount: prepared.indexedCount
  };
}

async function ensureSearchIndexExists(
  client: SearchIndexClient,
  indexUid: string,
  perf?: ImportPerfLogger
) {
  try {
    await client.getRawIndex(indexUid);
  } catch {
    await waitForSearchTask(client, await client.createIndex(indexUid, { primaryKey: "id" }), perf);
  }
}

async function prepareFreshSearchIndex(
  client: SearchIndexClient,
  indexUid: string,
  synonyms: SearchSynonymRecord[],
  perf?: ImportPerfLogger
) {
  await deleteIndexIfExists(client, indexUid, perf);
  await waitForSearchTask(client, await client.createIndex(indexUid, { primaryKey: "id" }), perf);

  const index = client.index<SearchProductDocument>(indexUid);
  await waitForSearchTask(client, await index.updateSettings(buildSearchIndexSettings(synonyms)), perf);

  return index;
}

async function deleteIndexIfExists(
  client: SearchIndexClient,
  indexUid: string,
  perf?: ImportPerfLogger
) {
  try {
    await waitForSearchTask(client, await client.deleteIndex(indexUid), perf);
  } catch (error) {
    if (!isIndexNotFoundError(error)) {
      throw error;
    }
  }
}

async function waitForSearchTask(
  client: SearchIndexClient,
  task: SearchIndexTask,
  perf?: ImportPerfLogger
) {
  return perf
    ? perf.measure("wait_meilisearch_task", () => client.tasks.waitForTask(task))
    : client.tasks.waitForTask(task);
}

function buildSearchIndexSettings(synonyms: SearchSynonymRecord[]) {
  return {
    searchableAttributes: [
      "shopCode",
      "shopCodeCompact",
      "name",
      "categoryName",
      "subcategoryName",
      "synonymText",
      "brandText",
      "translitText",
      "searchText"
    ],
    displayedAttributes: [
      "id",
      "catalogVersionId",
      "shopCode",
      "shopCodeNormalized",
      "shopCodeCompact",
      "name",
      "rawName",
      "slug",
      "price",
      "categorySlug",
      "categoryName",
      "subcategorySlug",
      "subcategoryName",
      "url",
      "searchText",
      "normalizedText",
      "synonymText",
      "translitText",
      "brandText"
    ],
    filterableAttributes: ["catalogVersionId", "categorySlug", "subcategorySlug", "status"],
    sortableAttributes: ["price"],
    rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8
      },
      disableOnWords: ["акб", "кпп", "грм", "гур"]
    },
    synonyms: buildMeiliSynonyms(synonyms),
    pagination: {
      maxTotalHits: 1000
    }
  };
}

function isIndexNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof (error as { cause?: { code?: unknown } }).cause === "object" &&
    (error as { cause?: { code?: unknown } }).cause?.code === "index_not_found"
  );
}

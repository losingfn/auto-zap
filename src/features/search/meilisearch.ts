import { MeiliSearch } from "meilisearch";
import { env } from "@/lib/env";
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
  await swapPreparedSearchIndexWithClient(client, prepared);

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
  const stagingIndexUid =
    options.stagingIndexUid ?? `${targetIndexUid}__staging__manual`;
  const expectedDocumentCount = options.expectedDocumentCount ?? documents.length;

  await ensureSearchIndexExists(client, targetIndexUid);
  const stagingIndex = await prepareFreshSearchIndex(client, stagingIndexUid, synonyms);

  await stagingIndex.deleteAllDocuments().then((task) => client.tasks.waitForTask(task));

  for (let indexStart = 0; indexStart < documents.length; indexStart += 1000) {
    const chunk = documents.slice(indexStart, indexStart + 1000);
    await stagingIndex.addDocuments(chunk, { primaryKey: "id" }).then((task) =>
      client.tasks.waitForTask(task)
    );
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

export async function swapPreparedSearchIndex(prepared: PreparedSearchIndex) {
  return swapPreparedSearchIndexWithClient(getMeiliClient() as SearchIndexClient, prepared);
}

export async function swapPreparedSearchIndexWithClient(
  client: SearchIndexClient,
  prepared: PreparedSearchIndex
) {
  await client
    .swapIndexes([{ indexes: [prepared.targetIndexUid, prepared.stagingIndexUid] }])
    .then((task) => client.tasks.waitForTask(task));

  return {
    indexUid: prepared.targetIndexUid,
    stagingIndexUid: prepared.stagingIndexUid,
    indexedCount: prepared.indexedCount
  };
}

async function ensureSearchIndexExists(client: SearchIndexClient, indexUid: string) {
  try {
    await client.getRawIndex(indexUid);
  } catch {
    await client.tasks.waitForTask(await client.createIndex(indexUid, { primaryKey: "id" }));
  }
}

async function prepareFreshSearchIndex(
  client: SearchIndexClient,
  indexUid: string,
  synonyms: SearchSynonymRecord[]
) {
  await deleteIndexIfExists(client, indexUid);
  await client.tasks.waitForTask(await client.createIndex(indexUid, { primaryKey: "id" }));

  const index = client.index<SearchProductDocument>(indexUid);
  await client.tasks.waitForTask(await index.updateSettings(buildSearchIndexSettings(synonyms)));

  return index;
}

async function deleteIndexIfExists(client: SearchIndexClient, indexUid: string) {
  try {
    await client.tasks.waitForTask(await client.deleteIndex(indexUid));
  } catch (error) {
    if (!isIndexNotFoundError(error)) {
      throw error;
    }
  }
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

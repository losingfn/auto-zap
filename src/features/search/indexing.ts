import { getSearchDocumentsForCatalogVersion, getActiveCatalogVersionId } from "./documents";
import {
  buildStagingSearchIndexUid,
  prepareSearchIndexDocuments,
  replaceSearchIndexDocuments,
  swapPreparedSearchIndex,
  type PreparedSearchIndex
} from "./meilisearch";
import { getSearchSynonyms } from "./synonyms";
import type { ImportPerfLogger } from "@/lib/server/import-perf";

export const SEARCH_INDEX_PREPARE_FAILED_MESSAGE =
  "Не удалось подготовить поисковый индекс. Старый поиск сохранён.";

export interface SyncSearchIndexResult {
  catalogVersionId: string;
  indexUid: string;
  stagingIndexUid: string;
  indexedCount: number;
}

export type PreparedCatalogSearchIndex = PreparedSearchIndex & {
  catalogVersionId: string;
};

export async function syncSearchIndexForActiveCatalog(perf?: ImportPerfLogger) {
  const activeVersionId = await getActiveCatalogVersionId();
  if (!activeVersionId) {
    throw new Error("Нет активной версии каталога для индексации.");
  }

  return syncSearchIndexForCatalogVersion(activeVersionId, perf);
}

export async function syncSearchIndexForCatalogVersion(
  catalogVersionId: string,
  perf?: ImportPerfLogger
): Promise<SyncSearchIndexResult> {
  const synonyms = await getSearchSynonyms();
  const documents = perf
    ? await perf.measure(
        "prepare_meilisearch_documents",
        () => getSearchDocumentsForCatalogVersion(catalogVersionId, synonyms),
        { rows: (value) => value.length }
      )
    : await getSearchDocumentsForCatalogVersion(catalogVersionId, synonyms);
  let result: Awaited<ReturnType<typeof replaceSearchIndexDocuments>>;

  try {
    result = await replaceSearchIndexDocuments(documents, synonyms, {
      expectedDocumentCount: documents.length,
      stagingIndexUid: buildStagingSearchIndexUid(catalogVersionId),
      perf
    });
  } catch (error) {
    throw new Error(SEARCH_INDEX_PREPARE_FAILED_MESSAGE, { cause: error });
  }

  return {
    catalogVersionId,
    indexUid: result.indexUid,
    stagingIndexUid: result.stagingIndexUid,
    indexedCount: result.indexedCount
  };
}

export async function prepareSearchIndexForCatalogVersion(
  catalogVersionId: string,
  perf?: ImportPerfLogger
): Promise<PreparedCatalogSearchIndex> {
  const synonyms = await getSearchSynonyms();
  const documents = perf
    ? await perf.measure(
        "prepare_meilisearch_documents",
        () => getSearchDocumentsForCatalogVersion(catalogVersionId, synonyms),
        { rows: (value) => value.length }
      )
    : await getSearchDocumentsForCatalogVersion(catalogVersionId, synonyms);

  try {
    const prepared = await prepareSearchIndexDocuments(documents, synonyms, {
      expectedDocumentCount: documents.length,
      stagingIndexUid: buildStagingSearchIndexUid(catalogVersionId),
      perf
    });

    return {
      ...prepared,
      catalogVersionId
    };
  } catch (error) {
    throw new Error(SEARCH_INDEX_PREPARE_FAILED_MESSAGE, { cause: error });
  }
}

export async function activatePreparedCatalogSearchIndex(
  prepared: PreparedCatalogSearchIndex,
  perf?: ImportPerfLogger
): Promise<SyncSearchIndexResult> {
  const result = await swapPreparedSearchIndex(prepared, perf);

  return {
    catalogVersionId: prepared.catalogVersionId,
    indexUid: result.indexUid,
    stagingIndexUid: result.stagingIndexUid,
    indexedCount: result.indexedCount
  };
}

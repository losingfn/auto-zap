import { getSearchDocumentsForCatalogVersion, getActiveCatalogVersionId } from "./documents";
import { buildStagingSearchIndexUid, replaceSearchIndexDocuments } from "./meilisearch";
import { getSearchSynonyms } from "./synonyms";

export const SEARCH_INDEX_PREPARE_FAILED_MESSAGE =
  "Не удалось подготовить поисковый индекс. Старый поиск сохранён.";

export interface SyncSearchIndexResult {
  catalogVersionId: string;
  indexUid: string;
  stagingIndexUid: string;
  indexedCount: number;
}

export async function syncSearchIndexForActiveCatalog() {
  const activeVersionId = await getActiveCatalogVersionId();
  if (!activeVersionId) {
    throw new Error("Нет активной версии каталога для индексации.");
  }

  return syncSearchIndexForCatalogVersion(activeVersionId);
}

export async function syncSearchIndexForCatalogVersion(
  catalogVersionId: string
): Promise<SyncSearchIndexResult> {
  const synonyms = await getSearchSynonyms();
  const documents = await getSearchDocumentsForCatalogVersion(catalogVersionId, synonyms);
  let result: Awaited<ReturnType<typeof replaceSearchIndexDocuments>>;

  try {
    result = await replaceSearchIndexDocuments(documents, synonyms, {
      expectedDocumentCount: documents.length,
      stagingIndexUid: buildStagingSearchIndexUid(catalogVersionId)
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

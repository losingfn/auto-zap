import { getSearchDocumentsForCatalogVersion, getActiveCatalogVersionId } from "./documents";
import { replaceSearchIndexDocuments } from "./meilisearch";
import { getSearchSynonyms } from "./synonyms";

export interface SyncSearchIndexResult {
  catalogVersionId: string;
  indexUid: string;
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
  const result = await replaceSearchIndexDocuments(documents, synonyms);

  return {
    catalogVersionId,
    indexUid: result.indexUid,
    indexedCount: result.indexedCount
  };
}

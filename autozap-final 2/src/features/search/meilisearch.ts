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

export async function ensureSearchIndex(synonyms: SearchSynonymRecord[]) {
  const client = getMeiliClient();

  try {
    await client.getRawIndex(SEARCH_INDEX_UID);
  } catch {
    await client.tasks.waitForTask(await client.createIndex(SEARCH_INDEX_UID, { primaryKey: "id" }));
  }

  const index = getSearchIndex();
  await index.tasks.waitForTask(
    await index.updateSettings({
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
        "name",
        "slug",
        "price",
        "categorySlug",
        "categoryName",
        "subcategorySlug",
        "subcategoryName",
        "url"
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
    })
  );

  return index;
}

export async function replaceSearchIndexDocuments(
  documents: SearchProductDocument[],
  synonyms: SearchSynonymRecord[]
) {
  const index = await ensureSearchIndex(synonyms);

  await index.tasks.waitForTask(await index.deleteAllDocuments());

  for (let indexStart = 0; indexStart < documents.length; indexStart += 1000) {
    const chunk = documents.slice(indexStart, indexStart + 1000);
    await index.tasks.waitForTask(await index.addDocuments(chunk, { primaryKey: "id" }));
  }

  return {
    indexUid: SEARCH_INDEX_UID,
    indexedCount: documents.length
  };
}

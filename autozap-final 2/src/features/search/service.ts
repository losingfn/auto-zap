import { getSearchIndex } from "./meilisearch";
import { buildExpandedQuery, normalizeSearchText } from "./normalization";
import { searchProductsWithPostgres } from "./postgres";
import { rankSearchHits } from "./ranking";
import { getSearchSynonyms } from "./synonyms";
import type {
  SearchProductDocument,
  SearchProductHit,
  SearchProductsInput,
  SearchProductsResult
} from "./types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function searchProducts(input: SearchProductsInput): Promise<SearchProductsResult> {
  const startedAt = Date.now();
  const query = input.query.trim();
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(input.offset ?? 0, 0);
  const synonyms = await getSearchSynonyms();
  const normalizedQuery = normalizeSearchText(query);
  const expandedQuery = buildExpandedQuery(query, synonyms);

  if (!normalizedQuery) {
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: input.admin ? "postgres_admin" : "meilisearch",
      total: 0,
      processingTimeMs: Date.now() - startedAt,
      hits: []
    };
  }

  if (input.admin) {
    const hits = await searchProductsWithPostgres({ query, limit, offset, admin: true, synonyms });
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: "postgres_admin",
      total: hits.length,
      processingTimeMs: Date.now() - startedAt,
      hits
    };
  }

  try {
    const result = await searchProductsWithMeili(query, limit, synonyms);
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: "meilisearch",
      total: result.estimatedTotalHits,
      processingTimeMs: Date.now() - startedAt,
      hits: result.hits
    };
  } catch (error) {
    const hits = await searchProductsWithPostgres({ query, limit, offset, synonyms });
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: "postgres_fallback",
      total: hits.length,
      processingTimeMs: Date.now() - startedAt,
      hits,
      fallbackReason: error instanceof Error ? error.message : "Meilisearch unavailable"
    };
  }
}

async function searchProductsWithMeili(
  query: string,
  limit: number,
  synonyms: Awaited<ReturnType<typeof getSearchSynonyms>>
): Promise<{ estimatedTotalHits: number; hits: SearchProductHit[] }> {
  const index = getSearchIndex();
  const meiliLimit = Math.min(Math.max(limit * 5, 50), 250);
  const response = await index.search<SearchProductDocument>(query, {
    limit: meiliLimit,
    attributesToRetrieve: [
      "id",
      "catalogVersionId",
      "shopCode",
      "shopCodeNormalized",
      "shopCodeCompact",
      "name",
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
    filter: 'status = "active"',
    showRankingScore: true
  });

  const sourceScores = new Map<string, number>();
  const hits = response.hits.map((hit) => {
    const rankedHit = hit as SearchProductDocument & { _rankingScore?: number };
    sourceScores.set(rankedHit.id, Number(rankedHit._rankingScore ?? 0));
    return rankedHit;
  });

  return {
    estimatedTotalHits: Number(response.estimatedTotalHits ?? hits.length),
    hits: rankSearchHits(hits, query, synonyms, sourceScores).slice(0, limit)
  };
}

import {
  getPublicCategorySlugs,
  isPublicCategorySlug,
  isPublicNavigationTaxonomyTarget
} from "@/config/public-taxonomy";
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
  const filters = {
    categorySlug: input.categorySlug,
    subcategorySlug: input.subcategorySlug
  };
  const synonyms = await getSearchSynonyms();
  const normalizedQuery = normalizeSearchText(query);
  const expandedQuery = buildExpandedQuery(query, synonyms);

  if (!input.admin && !isAllowedPublicSearchFilter(filters)) {
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: "meilisearch",
      total: 0,
      processingTimeMs: Date.now() - startedAt,
      hits: []
    };
  }

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
    const result = await searchProductsWithPostgres({
      query,
      limit,
      offset,
      admin: true,
      synonyms,
      ...filters
    });
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: "postgres_admin",
      total: result.total,
      processingTimeMs: Date.now() - startedAt,
      hits: result.hits
    };
  }

  try {
    const result = await searchProductsWithMeili(query, limit, offset, synonyms, filters);
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
    const result = await searchProductsWithPostgres({ query, limit, offset, synonyms, ...filters });
    return {
      query,
      normalizedQuery,
      expandedQuery,
      source: "postgres_fallback",
      total: result.total,
      processingTimeMs: Date.now() - startedAt,
      hits: result.hits,
      fallbackReason: error instanceof Error ? error.message : "Meilisearch unavailable"
    };
  }
}

export function isAllowedPublicSearchFilter(filters: {
  categorySlug?: string;
  subcategorySlug?: string;
}) {
  if (filters.categorySlug && !isPublicCategorySlug(filters.categorySlug)) {
    return false;
  }

  if (!filters.subcategorySlug) {
    return true;
  }

  return Boolean(
    filters.categorySlug &&
      isPublicNavigationTaxonomyTarget(filters.categorySlug, filters.subcategorySlug)
  );
}

async function searchProductsWithMeili(
  query: string,
  limit: number,
  offset: number,
  synonyms: Awaited<ReturnType<typeof getSearchSynonyms>>,
  filters: { categorySlug?: string; subcategorySlug?: string }
): Promise<{ estimatedTotalHits: number; hits: SearchProductHit[] }> {
  const index = getSearchIndex();
  const meiliLimit = Math.min(Math.max((offset + limit) * 5, 50), 1000);
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
    filter: buildMeiliFilter(filters),
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
    hits: rankSearchHits(hits, query, synonyms, sourceScores).slice(offset, offset + limit)
  };
}

function buildMeiliFilter(filters: { categorySlug?: string; subcategorySlug?: string }) {
  const publicCategories = getPublicCategorySlugs()
    .map((slug) => `"${escapeMeiliFilterValue(slug)}"`)
    .join(", ");
  const conditions = ['status = "active"', `categorySlug IN [${publicCategories}]`];

  if (filters.categorySlug) {
    conditions.push(`categorySlug = "${escapeMeiliFilterValue(filters.categorySlug)}"`);
  }

  if (filters.subcategorySlug) {
    conditions.push(`subcategorySlug = "${escapeMeiliFilterValue(filters.subcategorySlug)}"`);
  }

  return conditions.join(" AND ");
}

function escapeMeiliFilterValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

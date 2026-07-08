import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogVersions, categories, products, subcategories } from "@/db/schema";
import { compactShopCode, normalizeSearchText } from "./normalization";
import { buildSearchDocument, getActiveCatalogVersionId } from "./documents";
import { rankSearchHits } from "./ranking";
import type { SearchProductHit, SearchSynonymRecord } from "./types";

export interface PostgresSearchOptions {
  query: string;
  limit: number;
  offset?: number;
  admin?: boolean;
  synonyms: SearchSynonymRecord[];
}

export async function searchProductsWithPostgres({
  query,
  limit,
  offset = 0,
  admin = false,
  synonyms
}: PostgresSearchOptions): Promise<SearchProductHit[]> {
  const normalizedQuery = normalizeSearchText(query);
  const compactCode = compactShopCode(query);
  const likeQuery = `%${query.trim()}%`;
  const normalizedLikeQuery = `%${normalizedQuery}%`;
  const compactLikeQuery = `%${compactCode}%`;
  const activeVersionId = admin ? null : await getActiveCatalogVersionId();

  if (!normalizedQuery && !compactCode) {
    return [];
  }

  const scoreExpression = sql<number>`greatest(
    similarity(lower(${products.searchText}), lower(${normalizedQuery})),
    word_similarity(lower(${normalizedQuery}), lower(${products.searchText})),
    similarity(lower(${products.name}), lower(${normalizedQuery})),
    similarity(lower(${products.shopCode}), lower(${query}))
  )`;

  const whereConditions = [
    eq(products.status, "active"),
    sql`(
      ${products.shopCode} ILIKE ${likeQuery}
      OR regexp_replace(upper(${products.shopCode}), '[^0-9А-ЯA-Z]', '', 'g') ILIKE ${compactLikeQuery}
      OR ${products.name} ILIKE ${likeQuery}
      OR ${products.rawName} ILIKE ${likeQuery}
      OR ${products.searchText} ILIKE ${normalizedLikeQuery}
      OR ${products.searchText} % ${normalizedQuery}
      OR ${products.name} % ${normalizedQuery}
    )`
  ];

  if (activeVersionId) {
    whereConditions.push(eq(products.catalogVersionId, activeVersionId));
  }

  const rows = await db
    .select({
      id: products.id,
      catalogVersionId: products.catalogVersionId,
      shopCode: products.shopCode,
      rawName: products.rawName,
      name: products.name,
      slug: products.slug,
      price: products.price,
      categorySlug: categories.slug,
      categoryName: categories.name,
      subcategorySlug: subcategories.slug,
      subcategoryName: subcategories.name,
      sourceScore: scoreExpression
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .innerJoin(catalogVersions, eq(catalogVersions.id, products.catalogVersionId))
    .where(and(...whereConditions))
    .orderBy(
      desc(sql<number>`case when regexp_replace(upper(${products.shopCode}), '[^0-9А-ЯA-Z]', '', 'g') = ${compactCode} then 1 else 0 end`),
      desc(scoreExpression)
    )
    .limit(Math.min(Math.max(limit * 5, 50), 250))
    .offset(offset);

  const sourceScores = new Map(rows.map((row) => [row.id, Number(row.sourceScore ?? 0)]));
  const documents = rows.map((row) =>
    buildSearchDocument(
      {
        id: row.id,
        catalogVersionId: row.catalogVersionId,
        shopCode: row.shopCode,
        rawName: row.rawName,
        name: row.name,
        slug: row.slug,
        price: Number(row.price),
        categorySlug: row.categorySlug,
        categoryName: row.categoryName,
        subcategorySlug: row.subcategorySlug,
        subcategoryName: row.subcategoryName
      },
      synonyms
    )
  );

  return rankSearchHits(documents, query, synonyms, sourceScores).slice(0, limit);
}

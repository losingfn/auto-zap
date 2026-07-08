import { and, asc, desc, eq } from "drizzle-orm";
import { catalogTaxonomy } from "@/config/catalog-taxonomy";
import { db } from "@/db/client";
import { catalogVersions, categories, products, subcategories } from "@/db/schema";
import {
  buildQueryVariants,
  compactShopCode,
  compactWhitespace,
  normalizeSearchShopCode,
  normalizeSearchText,
  transliterateCyrillicToLatin
} from "./normalization";
import type { SearchProductDocument, SearchSynonymRecord } from "./types";

export interface ProductSearchTextInput {
  shopCode: string;
  name: string;
  rawName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  synonyms?: SearchSynonymRecord[];
}

export async function getActiveCatalogVersionId() {
  const [activeVersion] = await db
    .select({ id: catalogVersions.id })
    .from(catalogVersions)
    .where(eq(catalogVersions.status, "active"))
    .orderBy(desc(catalogVersions.publishedAt), desc(catalogVersions.createdAt))
    .limit(1);

  return activeVersion?.id ?? null;
}

export async function getSearchDocumentsForCatalogVersion(
  catalogVersionId: string,
  synonyms: SearchSynonymRecord[]
): Promise<SearchProductDocument[]> {
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
      subcategoryName: subcategories.name
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
    .where(and(eq(products.catalogVersionId, catalogVersionId), eq(products.status, "active")))
    .orderBy(asc(products.name));

  return rows.map((row) =>
    buildSearchDocument(
      {
        ...row,
        price: Number(row.price)
      },
      synonyms
    )
  );
}

export function buildSearchDocument(
  product: Omit<
    SearchProductDocument,
    | "status"
    | "shopCodeNormalized"
    | "shopCodeCompact"
    | "url"
    | "searchText"
    | "normalizedText"
    | "synonymText"
    | "translitText"
    | "brandText"
  >,
  synonyms: SearchSynonymRecord[]
): SearchProductDocument {
  const searchText = buildProductSearchText({
    shopCode: product.shopCode,
    name: product.name,
    rawName: product.rawName,
    categoryName: product.categoryName,
    subcategoryName: product.subcategoryName,
    synonyms
  });
  const normalizedText = normalizeSearchText(searchText);
  const synonymText = buildQueryVariants(searchText, synonyms).join(" ");
  const translitText = transliterateCyrillicToLatin(`${searchText} ${synonymText}`);

  return {
    ...product,
    status: "active",
    shopCodeNormalized: normalizeSearchShopCode(product.shopCode),
    shopCodeCompact: compactShopCode(product.shopCode),
    url: `/catalog/${product.categorySlug}/${product.subcategorySlug}/${product.slug}`,
    searchText,
    normalizedText,
    synonymText,
    translitText,
    brandText: extractBrandText(searchText)
  };
}

export function buildProductSearchText(input: ProductSearchTextInput) {
  const base = [
    input.shopCode,
    compactShopCode(input.shopCode),
    input.name,
    input.rawName,
    input.categoryName,
    input.subcategoryName
  ]
    .filter(Boolean)
    .join(" ");
  const variants = input.synonyms ? buildQueryVariants(base, input.synonyms) : [];

  return compactWhitespace([...new Set([base, ...variants, transliterateCyrillicToLatin(base)])].join(" "));
}

export function getStaticSubcategoryName(categorySlug?: string, subcategorySlug?: string) {
  const category = catalogTaxonomy.find((item) => item.slug === categorySlug);
  const subcategory = category?.subcategories.find(([slug]) => slug === subcategorySlug);

  return {
    categoryName: category?.name ?? null,
    subcategoryName: subcategory?.[1] ?? null
  };
}

function extractBrandText(searchText: string) {
  return normalizeSearchText(searchText)
    .split(/\s+/)
    .filter((token) => /[a-z]/i.test(token) && token.length >= 2)
    .join(" ");
}

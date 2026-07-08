export type SearchSource = "meilisearch" | "postgres_fallback" | "postgres_admin" | "fixture";

export interface SearchProductDocument {
  id: string;
  catalogVersionId: string;
  status: "active";
  shopCode: string;
  shopCodeNormalized: string;
  shopCodeCompact: string;
  name: string;
  rawName?: string | null;
  slug: string;
  price: number;
  categorySlug: string;
  categoryName: string;
  subcategorySlug: string;
  subcategoryName: string;
  url: string;
  searchText: string;
  normalizedText: string;
  synonymText: string;
  translitText: string;
  brandText: string;
}

export interface SearchProductHit extends SearchProductDocument {
  relevanceScore: number;
  sourceScore?: number;
}

export interface SearchProductsInput {
  query: string;
  limit?: number;
  offset?: number;
  admin?: boolean;
}

export interface SearchProductsResult {
  query: string;
  normalizedQuery: string;
  expandedQuery: string;
  source: SearchSource;
  total: number;
  processingTimeMs: number;
  hits: SearchProductHit[];
  fallbackReason?: string;
}

export interface SearchSynonymRecord {
  sourceTerm: string;
  targetTerms: string[];
  isBidirectional: boolean;
}

export type CategorizationMatchType = "contains" | "starts_with" | "exact" | "regex";

export interface CategorizationRuleRecord {
  id?: string;
  pattern: string;
  matchType: CategorizationMatchType;
  categoryId?: string;
  categorySlug: string;
  categoryName?: string;
  subcategoryId?: string;
  subcategorySlug: string;
  subcategoryName?: string;
  priority: number;
}

export interface CategorizationTarget {
  categoryId?: string;
  categorySlug: string;
  categoryName?: string;
  subcategoryId?: string;
  subcategorySlug: string;
  subcategoryName?: string;
}

export interface CategorizationResult {
  target: CategorizationTarget | null;
  matchedRule: CategorizationRuleRecord | null;
  needsReview: boolean;
  reviewReason: string | null;
}

export interface CategorizationContext {
  rules: CategorizationRuleRecord[];
  fallbackByCategorySlug: Map<string, CategorizationTarget>;
}

export type CategorizationMatchType = "contains" | "starts_with" | "exact" | "regex";

export const AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD = 0.92;
export const MEDIUM_CATEGORIZATION_CONFIDENCE_THRESHOLD = 0.85;

export type CategorizationSource =
  | "existing_product_category"
  | "exact_article_rule"
  | "exact_prefix_rule"
  | "verified_learning_rule"
  | "strong_multi_token"
  | "single_strong_token"
  | "ambiguous_token"
  | "family_rule"
  | "domain_dictionary"
  | "aggregated_signals"
  | "blocked_conflict"
  | "weak_group_candidate"
  | "empty_name"
  | "invalid_name"
  | "invalid_taxonomy_target"
  | "similarity"
  | "no_match";

export interface CategorizationSignal {
  kind:
    | "pattern"
    | "token"
    | "phrase"
    | "family"
    | "technical"
    | "negative"
    | "existing_product"
    | "neighbor"
    | "validation";
  value: string;
}

export type CategorizationDecisionStatus =
  | "AUTO_READY"
  | "GROUP_REVIEW"
  | "MANUAL_REVIEW"
  | "BLOCKED_CONFLICT"
  | "INVALID_INPUT";

export interface CategorizationCandidate {
  categorySlug: string;
  subcategorySlug: string;
  score: number;
  source: CategorizationSource;
  evidence: string[];
  negativeEvidence: string[];
 }

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
  createdBy?: string | null;
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
  confidence: number;
  source: CategorizationSource;
  reason: string;
  matchedSignals: CategorizationSignal[];
  needsReview: boolean;
  reviewReason: string | null;
  decisionStatus?: CategorizationDecisionStatus;
  familyId?: string | null;
  familyLabel?: string | null;
  candidates?: CategorizationCandidate[];
  negativeSignals?: CategorizationSignal[];
  confidenceModelVersion?: string;
  reviewReasonCode?: string | null;
}

export interface CategorizationContext {
  rules: CategorizationRuleRecord[];
  fallbackByCategorySlug: Map<string, CategorizationTarget>;
}

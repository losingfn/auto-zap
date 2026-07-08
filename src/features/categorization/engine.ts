import { defaultCategorizationRules } from "@/config/catalog-taxonomy";
import { normalizeText } from "@/features/import/normalize";
import type {
  CategorizationContext,
  CategorizationResult,
  CategorizationRuleRecord,
  CategorizationTarget
} from "./types";

export function normalizeForCategorization(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function categorizeProductName(
  productName: string,
  context: CategorizationContext
): CategorizationResult {
  const text = normalizeForCategorization(productName);
  const matchedRule = [...context.rules]
    .sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length)
    .find((rule) => ruleMatches(rule, text));

  if (!matchedRule) {
    return {
      target: null,
      matchedRule: null,
      needsReview: true,
      reviewReason: "Категория и подкатегория не определены правилами."
    };
  }

  return {
    target: {
      categoryId: matchedRule.categoryId,
      categorySlug: matchedRule.categorySlug,
      categoryName: matchedRule.categoryName,
      subcategoryId: matchedRule.subcategoryId,
      subcategorySlug: matchedRule.subcategorySlug,
      subcategoryName: matchedRule.subcategoryName
    },
    matchedRule,
    needsReview: false,
    reviewReason: null
  };
}

export function buildDefaultCategorizationContext(): CategorizationContext {
  const rules: CategorizationRuleRecord[] = defaultCategorizationRules.map((rule) => ({
    pattern: rule.pattern,
    matchType: rule.matchType,
    categorySlug: rule.categorySlug,
    subcategorySlug: rule.subcategorySlug,
    priority: rule.priority
  }));

  return {
    rules,
    fallbackByCategorySlug: new Map<string, CategorizationTarget>()
  };
}

function ruleMatches(rule: CategorizationRuleRecord, normalizedText: string) {
  const pattern = normalizeForCategorization(rule.pattern);
  if (!pattern) {
    return false;
  }

  switch (rule.matchType) {
    case "exact":
      return normalizedText === pattern;
    case "starts_with":
      return normalizedText.startsWith(pattern);
    case "regex":
      try {
        return new RegExp(rule.pattern, "iu").test(normalizedText);
      } catch {
        return false;
      }
    case "contains":
    default:
      return normalizedText.includes(pattern);
  }
}

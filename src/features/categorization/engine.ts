import { defaultCategorizationRules } from "@/config/catalog-taxonomy";
import { normalizeText } from "@/features/import/normalize";
import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  MEDIUM_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationContext,
  type CategorizationResult,
  type CategorizationRuleRecord,
  type CategorizationSignal,
  type CategorizationSource,
  type CategorizationTarget
} from "./types";

export interface ExistingProductCategorizationSnapshot {
  categoryId?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  subcategoryId?: string | null;
  subcategorySlug?: string | null;
  subcategoryName?: string | null;
  status?: string | null;
}

export interface CategorizeProductNameOptions {
  existingProduct?: ExistingProductCategorizationSnapshot | null;
  emptyName?: boolean;
  invalidName?: boolean;
}

export type CategorizationConfidenceBucket = "high" | "medium" | "low";

const PREFIX_RULE_CONFIDENCE = 0.98;
const VERIFIED_LEARNING_RULE_CONFIDENCE = 0.95;
const SINGLE_STRONG_TOKEN_CONFIDENCE = 0.88;
const AMBIGUOUS_TOKEN_CONFIDENCE = 0.82;
const SAFE_SINGLE_RULE_CONFIDENCE = AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD;

const stopSignalTokens = new Set([
  "a",
  "and",
  "at",
  "in",
  "of",
  "on",
  "the",
  "v",
  "а",
  "без",
  "в",
  "г",
  "для",
  "до",
  "и",
  "к",
  "на",
  "о",
  "от",
  "п",
  "пер",
  "перед",
  "с",
  "шт"
]);

const dangerousSingleTokens = new Set([
  "болт",
  "гайка",
  "головка",
  "датчик",
  "двер",
  "жидкость",
  "ключ",
  "крепеж",
  "крепление",
  "ламп",
  "масло",
  "насос",
  "панель",
  "патрубок",
  "провод",
  "ремень",
  "ручка",
  "стекло",
  "трос",
  "фильтр",
  "шланг"
]);

const strongSingleTokens = new Set([
  "акб",
  "аккумулятор",
  "амортиз",
  "антифриз",
  "бампер",
  "барабан",
  "генератор",
  "глушител",
  "домкрат",
  "зеркал",
  "капот",
  "карбюратор",
  "коврик",
  "колод",
  "компрессор",
  "крыло",
  "подшипник",
  "пружин",
  "радиатор",
  "рессор",
  "сайлент",
  "свечи",
  "стартер",
  "ступица",
  "суппорт",
  "тосол",
  "фаркоп",
  "цапф",
  "чехол",
  "шаров"
]);

const safeHighConfidenceSingleRules = new Set([
  "krepezh/bolty:болт",
  "krepezh/bolty:din912",
  "krepezh/bolty:din",
  "krepezh/gayki:гайка",
  "krepezh/gayki:гайк",
  "krepezh/shayby:шайба",
  "krepezh/shayby:шайб",
  "krepezh/shayby:гровер",
  "krepezh/shpilki:шпилька",
  "krepezh/shpilki:шпильк",
  "krepezh/vinty:винт",
  "krepezh/vinty:саморез",
  "krepezh/homuty:хомут",
  "krepezh/homuty:norma",
  "krepezh/shtucery-i-fitingi:штуцер",
  "krepezh/shtucery-i-fitingi:фитинг",
  "krepezh/soediniteli:соединитель",
  "krepezh/soediniteli:соединител",
  "krepezh/soediniteli:быстросъем",
  "krepezh/soediniteli:быстросъём",
  "kuzov-i-optika/emblemy:эмблема",
  "kuzov-i-optika/emblemy:шильдик",
  "kuzov-i-optika/povtoriteli:повторитель",
  "kuzov-i-optika/povtoriteli:поворотник"
]);

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
  context: CategorizationContext,
  options: CategorizeProductNameOptions = {}
): CategorizationResult {
  const existingProductTarget = toExistingProductTarget(options.existingProduct);
  if (existingProductTarget) {
    return {
      target: existingProductTarget,
      matchedRule: null,
      confidence: 1,
      source: "existing_product_category",
      reason: "Категория сохранена из активного каталога для этого артикула.",
      matchedSignals: [
        {
          kind: "existing_product",
          value: `${existingProductTarget.categorySlug}/${existingProductTarget.subcategorySlug}`
        }
      ],
      needsReview: false,
      reviewReason: null
    };
  }

  const text = normalizeForCategorization(productName);
  if (options.emptyName || !text) {
    return buildUnresolvedResult({
      source: "empty_name",
      reason: "Название товара пустое, автоматическая категоризация невозможна.",
      signal: "empty_name"
    });
  }

  if (options.invalidName) {
    return buildUnresolvedResult({
      source: "invalid_name",
      reason: "Название товара не прошло валидацию для автоматической категоризации.",
      signal: "invalid_name"
    });
  }

  const matchedRule = [...context.rules]
    .sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length)
    .find((rule) => ruleMatches(rule, text));

  if (!matchedRule) {
    return buildUnresolvedResult({
      source: "no_match",
      reason: "Категория и подкатегория не определены правилами.",
      signal: "no_match"
    });
  }

  const score = scoreMatchedRule(matchedRule, text);

  return {
    target: targetFromRule(matchedRule),
    matchedRule,
    confidence: score.confidence,
    source: score.source,
    reason: score.reason,
    matchedSignals: score.matchedSignals,
    needsReview: false,
    reviewReason: null
  };
}

export function getCategorizationConfidenceBucket(
  result: Pick<CategorizationResult, "confidence">
): CategorizationConfidenceBucket {
  if (result.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD) {
    return "high";
  }

  if (result.confidence >= MEDIUM_CATEGORIZATION_CONFIDENCE_THRESHOLD) {
    return "medium";
  }

  return "low";
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

function scoreMatchedRule(
  rule: CategorizationRuleRecord,
  normalizedText: string
): {
  confidence: number;
  source: CategorizationSource;
  reason: string;
  matchedSignals: CategorizationSignal[];
} {
  const pattern = normalizeForCategorization(rule.pattern);
  const tokens = tokenizePattern(pattern);
  const matchedSignals = [
    { kind: "pattern" as const, value: pattern },
    ...tokens.map((token) => ({ kind: "token" as const, value: token }))
  ];

  if (rule.matchType === "exact" || looksLikeExactArticleRule(pattern, normalizedText)) {
    return {
      confidence: PREFIX_RULE_CONFIDENCE,
      source: "exact_article_rule",
      reason: `Точное правило по артикулу или названию: "${rule.pattern}".`,
      matchedSignals
    };
  }

  if (isExactPrefixRule(rule, pattern, normalizedText)) {
    return {
      confidence: PREFIX_RULE_CONFIDENCE,
      source: "exact_prefix_rule",
      reason: `Точное префиксное правило: "${rule.pattern}".`,
      matchedSignals
    };
  }

  if (rule.createdBy) {
    return {
      confidence: VERIFIED_LEARNING_RULE_CONFIDENCE,
      source: "verified_learning_rule",
      reason: `Проверенное правило, созданное администратором: "${rule.pattern}".`,
      matchedSignals
    };
  }

  if (tokens.length >= 2) {
    const confidence = tokens.length >= 3 ? 0.95 : 0.92;
    return {
      confidence,
      source: "strong_multi_token",
      reason: `Сработало многословное правило: "${rule.pattern}".`,
      matchedSignals
    };
  }

  const [token] = tokens;
  if (token && isSafeHighConfidenceSingleRule(rule, token)) {
    return {
      confidence: SAFE_SINGLE_RULE_CONFIDENCE,
      source: "single_strong_token",
      reason: `Сработало безопасное точное правило: "${rule.pattern}".`,
      matchedSignals
    };
  }

  if (token && strongSingleTokens.has(token) && !dangerousSingleTokens.has(token)) {
    return {
      confidence: SINGLE_STRONG_TOKEN_CONFIDENCE,
      source: "single_strong_token",
      reason: `Сработал один сильный токен, требуется подтверждение: "${rule.pattern}".`,
      matchedSignals
    };
  }

  return {
    confidence: AMBIGUOUS_TOKEN_CONFIDENCE,
    source: "ambiguous_token",
    reason: `Сработал неоднозначный или опасный токен, нужна ручная проверка: "${rule.pattern}".`,
    matchedSignals
  };
}

function isSafeHighConfidenceSingleRule(rule: CategorizationRuleRecord, token: string) {
  return safeHighConfidenceSingleRules.has(
    `${rule.categorySlug}/${rule.subcategorySlug}:${token}`
  );
}

function buildUnresolvedResult({
  source,
  reason,
  signal
}: {
  source: CategorizationSource;
  reason: string;
  signal: string;
}): CategorizationResult {
  return {
    target: null,
    matchedRule: null,
    confidence: 0,
    source,
    reason,
    matchedSignals: [{ kind: "validation", value: signal }],
    needsReview: true,
    reviewReason: reason
  };
}

function toExistingProductTarget(
  existingProduct: ExistingProductCategorizationSnapshot | null | undefined
): CategorizationTarget | null {
  if (
    (existingProduct?.status && existingProduct.status !== "active") ||
    !existingProduct?.categoryId ||
    !existingProduct.subcategoryId ||
    !existingProduct.categorySlug ||
    !existingProduct.subcategorySlug
  ) {
    return null;
  }

  return {
    categoryId: existingProduct.categoryId,
    categorySlug: existingProduct.categorySlug,
    categoryName: existingProduct.categoryName ?? undefined,
    subcategoryId: existingProduct.subcategoryId,
    subcategorySlug: existingProduct.subcategorySlug,
    subcategoryName: existingProduct.subcategoryName ?? undefined
  };
}

function targetFromRule(rule: CategorizationRuleRecord): CategorizationTarget {
  return {
    categoryId: rule.categoryId,
    categorySlug: rule.categorySlug,
    categoryName: rule.categoryName,
    subcategoryId: rule.subcategoryId,
    subcategorySlug: rule.subcategorySlug,
    subcategoryName: rule.subcategoryName
  };
}

function tokenizePattern(pattern: string) {
  return pattern
    .split(/[\s/]+/)
    .map((token) => token.replace(/^\d+|\d+$/g, ""))
    .filter(
      (token) => token.length >= 2 && !stopSignalTokens.has(token) && !/^\d+$/.test(token)
    );
}

function looksLikeExactArticleRule(pattern: string, normalizedText: string) {
  return (
    pattern.length >= 4 &&
    /[a-zа-я0-9]+-[a-zа-я0-9]+/iu.test(pattern) &&
    normalizedText.includes(pattern)
  );
}

function isExactPrefixRule(
  rule: CategorizationRuleRecord,
  pattern: string,
  normalizedText: string
) {
  return (
    rule.matchType === "starts_with" ||
    (pattern.endsWith("-") &&
      (normalizedText.startsWith(pattern) || normalizedText.includes(` ${pattern}`)))
  );
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

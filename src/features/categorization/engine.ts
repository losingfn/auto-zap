import { catalogTaxonomy, defaultCategorizationRules } from "@/config/catalog-taxonomy";
import { isPublicTaxonomyTarget } from "@/config/public-taxonomy";
import { normalizeText } from "@/features/import/normalize";
import { containsPhrase, normalizeProductText, tokenizeNormalizedProductText } from "./normalization";
import { classifyWithDomainPipeline } from "./pipeline";
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
  "kuzov-i-optika/emblemy:эмблема",
  "kuzov-i-optika/emblemy:шильдик",
  "kuzov-i-optika/povtoriteli:повторитель",
  "kuzov-i-optika/povtoriteli:поворотник"
]);

type CompiledCategorizationRule = {
  pattern: string;
  tokens: string[];
  patternTokens: string[];
  regex: RegExp | null;
};

const compiledRuleCache = new WeakMap<CategorizationRuleRecord, CompiledCategorizationRule>();

export function normalizeForCategorization(value: string) {
  return normalizeProductText(normalizeText(value));
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
      reviewReason: null,
      decisionStatus: "AUTO_READY"
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

  const textTokens = tokenizeNormalizedProductText(text);
  let matchedRule: CategorizationRuleRecord | null = null;
  let matchedCompiledRule: CompiledCategorizationRule | null = null;
  for (const rule of context.rules) {
    const compiledRule = getCompiledRule(rule);
    if (ruleMatches(rule, compiledRule, text, textTokens)) {
      matchedRule = rule;
      matchedCompiledRule = compiledRule;
      break;
    }
  }

  if (!matchedRule || !matchedCompiledRule) {
    return classifyWithDomainPipeline(
      productName,
      context,
      buildUnresolvedResult({
        source: "no_match",
        reason: "Категория и подкатегория не определены правилами.",
        signal: "no_match"
      })
    );
  }

  const score = scoreMatchedRule(matchedRule, matchedCompiledRule, text);
  const target = targetFromRule(matchedRule);
  if (!isPublicTaxonomyTarget(target.categorySlug, target.subcategorySlug)) {
    return classifyWithDomainPipeline(
      productName,
      context,
      buildUnresolvedResult({
        source: "invalid_taxonomy_target",
        reason: "Правило указывает на категорию, которой нет в согласованной публичной таксономии.",
        signal: `${target.categorySlug}/${target.subcategorySlug}`
      })
    );
  }

  return classifyWithDomainPipeline(productName, context, {
    target,
    matchedRule,
    confidence: score.confidence,
    source: score.source,
    reason: score.reason,
    matchedSignals: score.matchedSignals,
    needsReview: score.confidence < AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
    reviewReason:
      score.confidence < AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD
        ? "Требуется подтверждение из-за недостаточной уверенности."
        : null
  });
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
  const targetBySlug = new Map<string, CategorizationTarget>();
  for (const category of catalogTaxonomy) {
    for (const [subcategorySlug, subcategoryName] of category.subcategories) {
      if (!isPublicTaxonomyTarget(category.slug, subcategorySlug)) {
        continue;
      }

      targetBySlug.set(`${category.slug}/${subcategorySlug}`, {
        categorySlug: category.slug,
        categoryName: category.name,
        subcategorySlug,
        subcategoryName
      });
    }
  }

  return {
    rules: sortCategorizationRules(
      rules.filter((rule) =>
        isPublicTaxonomyTarget(rule.categorySlug, rule.subcategorySlug)
      )
    ),
    fallbackByCategorySlug: new Map<string, CategorizationTarget>(),
    targetBySlug
  };
}

function scoreMatchedRule(
  rule: CategorizationRuleRecord,
  compiledRule: CompiledCategorizationRule,
  normalizedText: string
): {
  confidence: number;
  source: CategorizationSource;
  reason: string;
  matchedSignals: CategorizationSignal[];
} {
  const { pattern, tokens } = compiledRule;
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
    !existingProduct.subcategorySlug ||
    !isPublicTaxonomyTarget(existingProduct.categorySlug, existingProduct.subcategorySlug)
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

function sortCategorizationRules(rules: CategorizationRuleRecord[]) {
  return [...rules].sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
}

function getCompiledRule(rule: CategorizationRuleRecord): CompiledCategorizationRule {
  const cached = compiledRuleCache.get(rule);
  if (cached) {
    return cached;
  }

  const pattern = normalizeForCategorization(rule.pattern);
  let regex: RegExp | null = null;
  if (rule.matchType === "regex") {
    try {
      regex = new RegExp(rule.pattern, "iu");
    } catch {
      regex = null;
    }
  }

  const compiled = {
    pattern,
    tokens: tokenizePattern(pattern),
    patternTokens: pattern.includes(" ") ? tokenizeNormalizedProductText(pattern) : [],
    regex
  };
  compiledRuleCache.set(rule, compiled);
  return compiled;
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

function ruleMatches(
  rule: CategorizationRuleRecord,
  compiledRule: CompiledCategorizationRule,
  normalizedText: string,
  normalizedTextTokens: string[]
) {
  const { pattern } = compiledRule;
  if (!pattern) {
    return false;
  }

  switch (rule.matchType) {
    case "exact":
      return normalizedText === pattern;
    case "starts_with":
      return normalizedText.startsWith(pattern);
    case "regex":
      return compiledRule.regex?.test(normalizedText) ?? false;
    case "contains":
    default:
      return patternMatchesNormalizedText(compiledRule, normalizedText, normalizedTextTokens);
  }
}

function patternMatchesNormalizedText(
  compiledRule: CompiledCategorizationRule,
  normalizedText: string,
  normalizedTextTokens: string[]
) {
  const { pattern } = compiledRule;
  if (pattern.includes(" ")) {
    let cursor = 0;
    for (const patternToken of compiledRule.patternTokens) {
      const nextIndex = normalizedTextTokens.findIndex(
        (token, index) => index >= cursor && token.startsWith(patternToken)
      );
      if (nextIndex === -1) {
        return containsPhrase({ normalized: normalizedText }, pattern);
      }
      cursor = nextIndex + 1;
    }
    return true;
  }

  return normalizedTextTokens.some(
    (token) => token === pattern || token.startsWith(pattern)
  );
}

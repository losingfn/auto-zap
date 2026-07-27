import assert from "node:assert/strict";
import {
  buildCategorySuggestion,
  type ReviewSuggestionLevel
} from "../src/features/admin/review";
import {
  suggestRulePatternForProduct
} from "../src/features/categorization/learning";
import { normalizeForCategorization } from "../src/features/categorization/engine";
import { classifyWithDomainPipeline } from "../src/features/categorization/pipeline";
import {
  createPipelineFixtureCases,
  createPipelineFixtureContext
} from "./helpers/categorization-pipeline-fixture";
import {
  classifyWithDomainPipelineReference,
  createPipelineReferenceMetrics
} from "./helpers/categorization-pipeline-reference";
import type { CategorizationResult } from "../src/features/categorization/types";

const COMMON_RISK_WORDS = new Set([
  "болт", "гайка", "шайба", "кольцо", "комплект", "кронштейн", "трубка", "втулка",
  "палец", "ремкомплект", "корпус", "крышка", "датчик", "клапан", "подшипник", "сальник"
]);

const context = createPipelineFixtureContext();
const cases = createPipelineFixtureCases(1300, context);
const referenceMetrics = createPipelineReferenceMetrics();

for (const [index, fixture] of cases.entries()) {
  const oldResult = classifyWithDomainPipelineReference(
    fixture.productName,
    context,
    fixture.legacyResult,
    referenceMetrics
  );
  const newResult = classifyWithDomainPipeline(
    fixture.productName,
    context,
    fixture.legacyResult
  );

  try {
    assert.deepStrictEqual(newResult, oldResult);
  } catch (error) {
    console.error(JSON.stringify({
      index,
      input: fixture.productName,
      legacyResult: fixture.legacyResult,
      oldResult,
      newResult
    }, null, 2));
    throw error;
  }
}

assert.equal(cases.length, 1300);
assert.equal(referenceMetrics.familyEvaluations > 0, true);
assert.equal(referenceMetrics.staticFamilyNormalizations > 0, true);

const reviewContext = { ...context, rules: [] };
const reviewCases = cases
  .filter((fixture) => !isContextRuleFixture(fixture.productName))
  .slice(0, 1000);
assert.equal(reviewCases.length, 1000);
for (const [index, fixture] of reviewCases.entries()) {
  const row = {
    shopCode: `SKU-${index + 1}`,
    name: fixture.productName,
    rawName: fixture.productName,
    suggestedCategoryId: null,
    suggestedSubcategoryId: null
  };
  const oldResult = classifyWithDomainPipelineReference(
    `${row.shopCode} ${row.name || row.rawName}`,
    reviewContext,
    noMatchLegacyResult()
  );
  const oldSuggestion = referenceReviewSuggestion(row, oldResult);
  const newSuggestion = buildCategorySuggestion(row, reviewContext, reviewContext.targetBySlug!);

  try {
    assert.deepStrictEqual(newSuggestion, oldSuggestion);
  } catch (error) {
    console.error(JSON.stringify({
      index,
      input: row,
      oldResult,
      newSuggestion,
      oldSuggestion
    }, null, 2));
    throw error;
  }
}

console.log(JSON.stringify({
  result: "ok",
  cases: cases.length,
  review_suggestion_cases: reviewCases.length,
  family_evaluations: referenceMetrics.familyEvaluations,
  family_candidates: referenceMetrics.familyCandidates,
  product_normalizations: referenceMetrics.productNormalizations,
  static_family_normalizations: referenceMetrics.staticFamilyNormalizations
}));

function noMatchLegacyResult(): CategorizationResult {
  return {
    target: null,
    matchedRule: null,
    confidence: 0,
    source: "no_match",
    reason: "Категория и подкатегория не определены правилами.",
    matchedSignals: [{ kind: "validation", value: "no_match" }],
    needsReview: true,
    reviewReason: "Категория и подкатегория не определены правилами."
  };
}

function referenceReviewSuggestion(
  row: { shopCode: string; name: string; rawName: string },
  result: CategorizationResult
) {
  const normalized = normalizeReviewText(`${row.shopCode} ${row.name || row.rawName}`);
  const target = result.target;
  if (!target?.categoryId || !target.subcategoryId) {
    return manualSuggestion(result.reason, result.matchedSignals.map((signal) => signal.value));
  }

  const hasBroadSingleSignal =
    result.matchedSignals.filter((signal) => signal.kind === "token").length === 1 &&
    result.matchedSignals.some((signal) => COMMON_RISK_WORDS.has(signal.value));
  const conflictingSignals = findConflictingSignals(normalized.tokens, target.categorySlug, target.subcategorySlug);
  const confidence = Math.max(0, result.confidence - conflictingSignals.length * 0.08 - (hasBroadSingleSignal ? 0.12 : 0));
  const level: ReviewSuggestionLevel = confidence >= 0.92 && conflictingSignals.length === 0
    ? "ready"
    : confidence >= 0.85
      ? "quick"
      : "manual";

  if (level === "manual") {
    return {
      level,
      confidence,
      categoryId: target.categoryId,
      subcategoryId: target.subcategoryId,
      categoryName: target.categoryName ?? null,
      subcategoryName: target.subcategoryName ?? null,
      explanation: conflictingSignals.length > 0
        ? "Есть конфликтующие признаки, товар лучше проверить вручную."
        : result.reason,
      matchedSignals: result.matchedSignals.map((signal) => signal.value),
      conflictingSignals,
      rulePattern: null
    };
  }

  return {
    level,
    confidence,
    categoryId: target.categoryId,
    subcategoryId: target.subcategoryId,
    categoryName: target.categoryName ?? null,
    subcategoryName: target.subcategoryName ?? null,
    explanation: result.reason,
    matchedSignals: result.matchedSignals.map((signal) => signal.value),
    conflictingSignals,
    rulePattern: suggestRulePatternForProduct(row.name || row.rawName)
  };
}

function normalizeReviewText(value: string) {
  const normalized = normalizeForCategorization(value)
    .replace(/\bрем\s*\.?\s*к\s*[- ]?\s*т\b/g, "ремкомплект")
    .replace(/\bрем\s+комплект\b/g, "ремкомплект")
    .replace(/\bсуппорта\b/g, "суппорт")
    .replace(/\bсуппортов\b/g, "суппорт")
    .replace(/\bколенвала\b/g, "коленвал")
    .replace(/\bполуоси\b/g, "полуось")
    .replace(/\bступицы\b/g, "ступица")
    .replace(/\bтормоза\b/g, "тормоз")
    .replace(/\s+/g, " ")
    .trim();

  return {
    tokens: normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !/^\d+$/.test(token))
  };
}

function findConflictingSignals(tokens: string[], categorySlug?: string, subcategorySlug?: string) {
  const conflicts: string[] = [];
  const has = (token: string) => tokens.includes(token);
  if (categorySlug === "tormoznaya-sistema" && (has("кардан") || has("гбц") || has("коленвал") || has("полуось"))) {
    conflicts.push("Есть признаки двигателя или трансмиссии.");
  }
  if (categorySlug === "dvigatel-i-transmissiya" && (has("суппорт") || has("тормоз"))) {
    conflicts.push("Есть признаки тормозной системы.");
  }
  if (subcategorySlug === "datchiki" && !has("датчик")) {
    conflicts.push("Нет явного слова «датчик».");
  }
  return conflicts;
}

function manualSuggestion(reason: string, signals: string[]) {
  return {
    level: "manual" as const,
    confidence: 0,
    categoryId: null,
    subcategoryId: null,
    categoryName: null,
    subcategoryName: null,
    explanation: reason,
    matchedSignals: signals,
    conflictingSignals: [],
    rulePattern: null
  };
}

function isContextRuleFixture(value: string) {
  const normalized = normalizeReviewText(value).tokens;
  const hasAll = (...tokens: string[]) => tokens.every((token) => normalized.includes(token));
  return (
    hasAll("болт", "суппорт") ||
    hasAll("болт", "кардан") ||
    hasAll("болт", "гбц") ||
    hasAll("ремкомплект", "суппорт") ||
    hasAll("сальник", "коленвал") ||
    hasAll("сальник", "полуось") ||
    hasAll("датчик", "давление", "масло") ||
    hasAll("подшипник", "ступица") ||
    hasAll("трос", "ручной", "тормоз")
  );
}

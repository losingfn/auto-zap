import { isOtherProductsTarget, isPublicTaxonomyTarget } from "@/config/public-taxonomy";
import {
  CONFIDENCE_MODEL_VERSION,
  DOMAIN_DICTIONARY_VERSION,
  DOMAIN_RULES_VERSION,
  dangerousBroadTokens,
  familyDefinitions,
  weakGeneralTokens,
  type ProductFamilyDefinition
} from "./domain-config";
import {
  containsPhrase,
  hasAnyToken,
  normalizeProductName,
  normalizeTechnicalToken,
  PRODUCT_NORMALIZER_VERSION,
  type NormalizedProductName
} from "./normalization";
import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationCandidate,
  type CategorizationContext,
  type CategorizationResult,
  type CategorizationSignal,
  type CategorizationSource,
  type CategorizationTarget
} from "./types";

export const CATEGORIZATION_PIPELINE_VERSION = [
  PRODUCT_NORMALIZER_VERSION,
  DOMAIN_DICTIONARY_VERSION,
  DOMAIN_RULES_VERSION,
  CONFIDENCE_MODEL_VERSION
].join("+");

interface FamilyCandidate {
  family: ProductFamilyDefinition;
  target: CategorizationTarget;
  score: number;
  evidence: string[];
  negativeEvidence: string[];
  source: CategorizationSource;
}

export function classifyWithDomainPipeline(
  productName: string,
  context: CategorizationContext,
  legacyResult: CategorizationResult
): CategorizationResult {
  if (legacyResult.source === "existing_product_category") {
    return {
      ...legacyResult,
      decisionStatus: "AUTO_READY",
      confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION,
      reviewReasonCode: null
    };
  }

  const features = normalizeProductName(productName);
  if (!features.normalized) {
    return {
      ...legacyResult,
      target: null,
      confidence: 0,
      source: "do_not_publish",
      reason: "Название пустое, товар не публикуется до исправления исходных данных.",
      matchedSignals: [{ kind: "validation", value: "EMPTY_NAME" }],
      needsReview: true,
      reviewReason: "DO_NOT_PUBLISH: EMPTY_NAME.",
      decisionStatus: "DO_NOT_PUBLISH",
      reviewReasonCode: "EMPTY_NAME",
      confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION
    };
  }

  const familyCandidates = familyDefinitions
    .map((family) => evaluateFamilyCandidate(family, features, context, legacyResult))
    .filter((candidate): candidate is FamilyCandidate => candidate !== null);
  const legacyCandidate = legacyResult.target
    ? toLegacyCandidate(legacyResult, features)
    : null;
  const candidates = [...familyCandidates, ...(legacyCandidate ? [legacyCandidate] : [])]
    .sort((a, b) => b.score - a.score || a.family.id.localeCompare(b.family.id));
  const best = candidates[0] ?? null;
  const second = candidates.find(
    (candidate) =>
      !best ||
      candidate.target.categorySlug !== best.target.categorySlug ||
      candidate.target.subcategorySlug !== best.target.subcategorySlug
  );

  if (!best) {
    return buildManualResult(legacyResult, features, "no_candidate", [
      {
        kind: "validation",
        value: "Нет семейства, правила или безопасного похожего target."
      }
    ]);
  }

  const conflictGap = second ? best.score - second.score : 1;
  const bothCandidatesHaveEvidence = Boolean(
    second && best.evidence.length >= 2 && second.evidence.length >= 2
  );
  const hasTargetConflict = Boolean(
    second &&
      bothCandidatesHaveEvidence &&
      best.score >= 0.88 &&
      second.score >= 0.86 &&
      (second.target.categorySlug === best.target.categorySlug
        ? conflictGap < 0.03
        : conflictGap < 0.05)
  );
  const hasNegativeEvidence = best.negativeEvidence.length > 0;
  const isWeakSingleSignal =
    best.evidence.length <= 1 &&
    features.significantTokens.some((token) => dangerousBroadTokens.has(token));
  const candidateSummaries = candidates.slice(0, 5).map(toCandidateSummary);

  if (hasTargetConflict || hasNegativeEvidence) {
    return {
      target: best.target,
      matchedRule: legacyResult.matchedRule,
      confidence: Math.max(0.1, Math.min(best.score, 0.84)),
      source: "blocked_conflict",
      reason: hasTargetConflict
        ? "Несколько категорий получили близкие оценки, требуется ручная проверка."
        : "Найдены отрицательные признаки для лучшего кандидата.",
      matchedSignals: toSignals(best, features),
      negativeSignals: best.negativeEvidence.map((value) => ({ kind: "negative", value })),
      needsReview: true,
      reviewReason: hasTargetConflict
        ? "Близкие кандидаты автоматической категоризации."
        : `Отрицательные признаки: ${best.negativeEvidence.join(", ")}.`,
      decisionStatus: "BLOCKED_CONFLICT",
      familyId: best.family.id,
      familyLabel: best.family.label,
      candidates: candidateSummaries,
      confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION,
      reviewReasonCode: hasTargetConflict ? "close_candidates" : "negative_evidence"
    };
  }

  const decisionStatus =
    best.score >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD &&
    best.evidence.length >= best.family.autoReadyMinEvidence &&
    !isWeakSingleSignal
      ? "AUTO_READY"
      : best.score >= 0.8 && best.family.groupable
        ? "GROUP_REVIEW"
        : "MANUAL_REVIEW";

  return {
    target: best.target,
    matchedRule: legacyResult.matchedRule,
    confidence: roundConfidence(best.score),
    source: decisionStatus === "GROUP_REVIEW" ? "weak_group_candidate" : best.source,
    reason: buildDecisionReason(best, decisionStatus),
    matchedSignals: toSignals(best, features),
    negativeSignals: [],
    needsReview: decisionStatus !== "AUTO_READY",
    reviewReason:
      decisionStatus === "AUTO_READY"
        ? null
        : decisionStatus === "GROUP_REVIEW"
          ? "Товар включён в узкую группу быстрого подтверждения."
          : "Недостаточно независимых сигналов для автоматического решения.",
    decisionStatus,
    familyId: best.family.id,
    familyLabel: best.family.label,
    candidates: candidateSummaries,
    confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION,
    reviewReasonCode:
      decisionStatus === "AUTO_READY"
        ? null
        : decisionStatus === "GROUP_REVIEW"
          ? "group_confirmation"
          : "weak_candidate"
  };
}

function evaluateFamilyCandidate(
  family: ProductFamilyDefinition,
  features: NormalizedProductName,
  context: CategorizationContext,
  legacyResult: CategorizationResult
): FamilyCandidate | null {
  const strongPhrases = (family.strongPhrases ?? []).filter((phrase) =>
    containsPhrase(features, phrase)
  );
  const requiredAnyMatched = family.requiredAny.filter((token) => hasAnyToken(features, [token]));
  const requiredAllMatched = family.requiredAll?.filter((token) => hasAnyToken(features, [token])) ?? [];
  const requiredAllOk =
    !family.requiredAll || requiredAllMatched.length === family.requiredAll.length;
  const contextMatched = family.contextAny?.filter((token) => hasAnyToken(features, [token])) ?? [];
  const contextOk = !family.contextAny || contextMatched.length > 0;
  const technicalMatched =
    family.technicalAny?.filter((token) =>
      features.technicalTokens.includes(normalizeTechnicalToken(token))
    ) ?? [];
  const optionalMatched = family.optional?.filter((token) => hasAnyToken(features, [token])) ?? [];
  const hasRequiredAny = requiredAnyMatched.length > 0;
  const phraseCanOpen = strongPhrases.length > 0;

  if ((!hasRequiredAny || !requiredAllOk || !contextOk) && !phraseCanOpen) {
    return null;
  }

  const target = resolveTarget(context, family.categorySlug, family.subcategorySlug);
  if (!target) {
    return null;
  }

  const negativeEvidence = (family.negative ?? []).filter((token) =>
    token.includes(" ") ? containsPhrase(features, token) : hasAnyToken(features, [token])
  );
  const legacyAgrees = sameTarget(legacyResult.target, target);
  const evidence = [
    ...requiredAnyMatched.map((token) => `term:${token}`),
    ...requiredAllMatched.map((token) => `context:${token}`),
    ...contextMatched.map((token) => `context:${token}`),
    ...strongPhrases.map((phrase) => `phrase:${phrase}`),
    ...technicalMatched.map((token) => `technical:${token}`),
    ...optionalMatched.map((token) => `optional:${token}`),
    ...(legacyAgrees ? [`legacy:${legacyResult.source}`] : [])
  ];
  const strongEvidenceCount =
    requiredAnyMatched.length +
    requiredAllMatched.length +
    contextMatched.length +
    strongPhrases.length * 2 +
    technicalMatched.length +
    (legacyAgrees ? 1 : 0);
  let score = family.baseConfidence;
  score += strongPhrases.length * 0.025;
  score += technicalMatched.length * 0.015;
  score += contextMatched.length * 0.012;
  score += optionalMatched.length * 0.008;
  score += legacyAgrees ? 0.025 : 0;
  score += strongEvidenceCount >= 3 ? 0.015 : 0;
  score -= negativeEvidence.length * 0.12;
  score -= features.usefulTokenCount <= 1 ? 0.04 : 0;
  score -= features.digitRatio > 0.75 ? 0.08 : 0;

  return {
    family,
    target,
    score: clamp(score),
    evidence,
    negativeEvidence,
    source: isOtherProductsTarget(family.categorySlug, family.subcategorySlug)
      ? "other_products_fallback"
      : strongPhrases.length > 0
        ? "family_rule"
        : "domain_dictionary"
  };
}

function toLegacyCandidate(
  legacyResult: CategorizationResult,
  features: NormalizedProductName
): FamilyCandidate | null {
  const target = legacyResult.target;
  if (!target || !isPublicTaxonomyTarget(target.categorySlug, target.subcategorySlug)) {
    return null;
  }

  const matchedTokenSignals = legacyResult.matchedSignals
    .filter((signal) => signal.kind === "token" || signal.kind === "pattern")
    .map((signal) => signal.value)
    .filter(Boolean);
  const family = familyDefinitions.find(
    (definition) =>
      definition.categorySlug === target.categorySlug &&
      definition.subcategorySlug === target.subcategorySlug &&
      matchedTokenSignals.some((signal) =>
        definition.requiredAny.some(
          (required) => signal.includes(required) || required.includes(signal)
        )
      )
  ) ?? {
    id: `legacy_${target.categorySlug}_${target.subcategorySlug}`,
    label: target.subcategoryName ?? target.subcategorySlug,
    categorySlug: target.categorySlug,
    subcategorySlug: target.subcategorySlug ?? "",
    requiredAny: matchedTokenSignals,
    groupable: true,
    autoReadyMinEvidence: 2,
    baseConfidence: legacyResult.confidence,
    description: legacyResult.reason
  };

  const broadPenalty = matchedTokenSignals.some((token) =>
    dangerousBroadTokens.has(token)
  )
    ? 0.06
    : 0;
  const qualityPenalty = features.usefulTokenCount <= 1 ? 0.05 : 0;
  const score = clamp(legacyResult.confidence - broadPenalty - qualityPenalty);

  return {
    family,
    target,
    score,
    evidence: matchedTokenSignals.map((token) => `legacy:${token}`),
    negativeEvidence: [],
    source: legacyResult.source
  };
}

function buildManualResult(
  legacyResult: CategorizationResult,
  features: NormalizedProductName,
  reviewReasonCode: string,
  signals: CategorizationSignal[]
): CategorizationResult {
  const doNotPublishReasonCode = getDoNotPublishReasonCode(features, reviewReasonCode);

  if (doNotPublishReasonCode) {
    return {
      ...legacyResult,
      target: null,
      confidence: Math.min(legacyResult.confidence, 0.2),
      source: "do_not_publish",
      reason: buildDoNotPublishReason(doNotPublishReasonCode),
      needsReview: true,
      reviewReason: `DO_NOT_PUBLISH: ${doNotPublishReasonCode}.`,
      decisionStatus: "DO_NOT_PUBLISH",
      matchedSignals: [
        ...legacyResult.matchedSignals,
        ...signals,
        { kind: "validation", value: doNotPublishReasonCode }
      ],
      confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION,
      reviewReasonCode: doNotPublishReasonCode
    };
  }

  return {
    ...legacyResult,
    target: legacyResult.target,
    confidence: Math.min(legacyResult.confidence, 0.78),
    needsReview: true,
    reviewReason: legacyResult.reviewReason ?? "Недостаточно данных для автоматической категоризации.",
    decisionStatus: "MANUAL_REVIEW",
    matchedSignals: [...legacyResult.matchedSignals, ...signals],
    confidenceModelVersion: CATEGORIZATION_PIPELINE_VERSION,
    reviewReasonCode
  };
}

function resolveTarget(
  context: CategorizationContext,
  categorySlug: string,
  subcategorySlug: string
): CategorizationTarget | null {
  if (!isPublicTaxonomyTarget(categorySlug, subcategorySlug)) {
    return null;
  }

  const fromRule = context.rules.find(
    (rule) => rule.categorySlug === categorySlug && rule.subcategorySlug === subcategorySlug
  );
  if (fromRule) {
    return {
      categoryId: fromRule.categoryId,
      categorySlug: fromRule.categorySlug,
      categoryName: fromRule.categoryName,
      subcategoryId: fromRule.subcategoryId,
      subcategorySlug: fromRule.subcategorySlug,
      subcategoryName: fromRule.subcategoryName
    };
  }

  const fromTargetMap = context.targetBySlug?.get(`${categorySlug}/${subcategorySlug}`);
  if (fromTargetMap) {
    return fromTargetMap;
  }

  const fallback = context.fallbackByCategorySlug.get(categorySlug);
  if (fallback?.subcategorySlug === subcategorySlug) {
    return fallback;
  }

  return {
    categorySlug,
    subcategorySlug
  };
}

function getDoNotPublishReasonCode(features: NormalizedProductName, reviewReasonCode: string) {
  const semanticTokens = features.significantTokens.filter(
    (token) => !features.codeTokens.includes(token) && !isNonSemanticToken(token)
  );
  const weakSemanticTokens = semanticTokens.filter((token) => weakGeneralTokens.has(token));
  const strongSemanticTokens = semanticTokens.filter((token) => !weakGeneralTokens.has(token));

  if (semanticTokens.length === 0 && features.measurements.length > 0) {
    return "SIZE_ONLY";
  }

  if (
    semanticTokens.length === 0 &&
    (features.codeTokens.length > 0 || features.technicalTokens.length > 0)
  ) {
    return "CODE_ONLY";
  }

  if (semanticTokens.length > 0 && strongSemanticTokens.length === 0 && weakSemanticTokens.length > 0) {
    return "GENERIC_NAME_ONLY";
  }

  if (features.digitRatio > 0.8 && strongSemanticTokens.length === 0) {
    return "CORRUPTED_NAME";
  }

  if (features.usefulTokenCount === 0 && semanticTokens.length === 0) {
    return "INSUFFICIENT_SEMANTIC_DATA";
  }

  if (
    reviewReasonCode === "no_candidate" &&
    strongSemanticTokens.length === 1 &&
    !dangerousBroadTokens.has(strongSemanticTokens[0]!)
  ) {
    return "UNKNOWN_PRODUCT_TYPE";
  }

  return null;
}

function isNonSemanticToken(token: string) {
  const normalized = normalizeProductName(token).normalized;
  return (
    /^[a-zа-я]?\d+[a-zа-я]?(?:[.*-]\d+)*(?:мм|см|м)?$/iu.test(normalized) ||
    /^din\d+$/iu.test(normalized) ||
    /^\d+$/iu.test(normalized)
  );
}

function buildDoNotPublishReason(reasonCode: string) {
  const labels: Record<string, string> = {
    EMPTY_NAME: "Название пустое.",
    CODE_ONLY: "Строка похожа только на артикул или код без понятного типа товара.",
    GENERIC_NAME_ONLY: "Название содержит только общие слова без типа товара.",
    SIZE_ONLY: "Название содержит только размер или техническую меру без типа товара.",
    CORRUPTED_NAME: "Название повреждено или состоит преимущественно из служебных символов/цифр.",
    UNKNOWN_PRODUCT_TYPE: "Тип товара не распознан по текущим данным.",
    INSUFFICIENT_SEMANTIC_DATA: "Недостаточно смысловых данных для публикации."
  };

  return `${labels[reasonCode] ?? labels.INSUFFICIENT_SEMANTIC_DATA} Товар не публикуется до ручного исправления.`;
}

function toSignals(candidate: FamilyCandidate, features: NormalizedProductName): CategorizationSignal[] {
  return [
    { kind: "family", value: candidate.family.id },
    ...candidate.evidence.map((value) => signalFromEvidence(value)),
    { kind: "validation", value: `normalizer:${features.usefulTokenCount}:useful_tokens` }
  ];
}

function signalFromEvidence(value: string): CategorizationSignal {
  const [kind, raw] = value.split(":");
  if (kind === "phrase") return { kind: "phrase", value: raw ?? value };
  if (kind === "technical") return { kind: "technical", value: raw ?? value };
  if (kind === "legacy") return { kind: "pattern", value: raw ?? value };
  if (kind === "context") return { kind: "token", value: raw ?? value };
  if (kind === "term") return { kind: "token", value: raw ?? value };
  return { kind: "validation", value };
}

function toCandidateSummary(candidate: FamilyCandidate): CategorizationCandidate {
  return {
    categorySlug: candidate.target.categorySlug,
    subcategorySlug: candidate.target.subcategorySlug ?? "",
    score: roundConfidence(candidate.score),
    source: candidate.source,
    evidence: candidate.evidence,
    negativeEvidence: candidate.negativeEvidence
  };
}

function buildDecisionReason(
  candidate: FamilyCandidate,
  decisionStatus: "AUTO_READY" | "GROUP_REVIEW" | "MANUAL_REVIEW"
) {
  const evidence = candidate.evidence.slice(0, 4).join(", ");
  if (decisionStatus === "AUTO_READY") {
    return `${candidate.family.description} Сигналы согласованы: ${evidence}.`;
  }
  if (decisionStatus === "GROUP_REVIEW") {
    return `Предложена узкая группа "${candidate.family.label}" для быстрого подтверждения: ${evidence}.`;
  }
  return `Кандидат "${candidate.family.label}" слабый: ${evidence}.`;
}

function sameTarget(
  left: CategorizationTarget | null | undefined,
  right: CategorizationTarget | null | undefined
) {
  return Boolean(
    left &&
      right &&
      left.categorySlug === right.categorySlug &&
      left.subcategorySlug === right.subcategorySlug
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(0.98, value));
}

function roundConfidence(value: number) {
  return Math.round(clamp(value) * 1000) / 1000;
}

import { searchIntentBoosts } from "@/config/search-synonyms";
import { normalizeTechnicalToken } from "@/features/categorization/normalization";
import {
  buildQueryVariants,
  compactShopCode,
  expandQueryTerms,
  normalizeSearchText,
  tokenizeSearchText
} from "./normalization";
import type { SearchProductDocument, SearchProductHit, SearchSynonymRecord } from "./types";

const technicalTokenAliases: Record<string, string[]> = {
  t10: ["t10", "w5w"],
  w5w: ["w5w", "t10"]
};

const lampSubjectTokens = new Set(["лампа", "лампы", "лампочка", "лампочки", "led"]);

export function rankSearchHits<T extends SearchProductDocument>(
  documents: T[],
  query: string,
  synonyms: SearchSynonymRecord[],
  sourceScores = new Map<string, number>()
): SearchProductHit[] {
  return documents
    .map((document) => {
      const sourceScore = sourceScores.get(document.id) ?? 0;
      return {
        ...document,
        sourceScore,
        relevanceScore: scoreSearchDocument(document, query, synonyms, sourceScore)
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.name.localeCompare(b.name, "ru"));
}

export function scoreSearchDocument(
  document: SearchProductDocument,
  query: string,
  synonyms: SearchSynonymRecord[],
  sourceScore = 0
) {
  const profile = buildSearchQueryProfile(query, synonyms);
  const {
    normalizedQuery,
    compactQuery,
    queryTerms,
    queryTokens,
    queryVariants,
    technicalTokens
  } = profile;
  const documentText = normalizeSearchText(
    `${document.shopCode} ${document.shopCodeCompact} ${document.name} ${document.categoryName} ${document.subcategoryName} ${document.searchText} ${document.synonymText} ${document.translitText} ${document.brandText}`
  );
  const semanticDocumentText = buildSemanticDocumentText(document);
  const documentTokens = new Set(tokenizeSearchText(documentText));
  const semanticDocumentTokens = new Set(tokenizeSearchText(semanticDocumentText));
  const documentTechnicalTokens = extractTechnicalTokens(semanticDocumentText);
  const normalizedName = normalizeSearchText(document.name);
  let score = sourceScore * 100;

  if (compactQuery && document.shopCodeCompact === compactQuery) {
    score += 10000;
  } else if (compactQuery && document.shopCodeCompact.startsWith(compactQuery)) {
    score += 6000;
  } else if (compactQuery && document.shopCodeCompact.includes(compactQuery)) {
    score += 3000;
  }

  if (normalizedName === normalizedQuery) {
    score += 2200;
  }

  if (normalizedQuery && phraseMatches(normalizedName, normalizedQuery)) {
    score += 950;
  }

  if (technicalTokens.length > 0) {
    if (hasAllTechnicalTokens(documentTechnicalTokens, technicalTokens)) {
      score += 700 + technicalTokens.length * 240;
    } else if (!(compactQuery && document.shopCodeCompact === compactQuery)) {
      score -= 2500;
    }

    if (technicalTokens.some(isLampTechnicalToken) && hasLampSubject(document, semanticDocumentTokens)) {
      score += profile.hasLampSubject ? 550 : 220;
    }

    if (profile.hasLampSubject && !hasLampSubject(document, semanticDocumentTokens)) {
      score -= 1600;
    }
  }

  for (const variant of queryVariants) {
    if (variant.length >= 3 && phraseMatches(documentText, variant)) {
      score += variant.includes(" ") ? 450 : 220;
    }
  }

  for (const token of queryTokens) {
    if (token.length < 2) {
      continue;
    }

    const technicalToken = normalizeTechnicalToken(token);
    if (technicalToken) {
      score += hasTechnicalToken(documentTechnicalTokens, technicalToken) ? 360 : -300;
      continue;
    }

    if (documentTokens.has(token)) {
      score += 180;
    } else if ([...documentTokens].some((documentToken) => documentToken.startsWith(token))) {
      score += 85;
    } else if (token.length >= 4 && documentText.includes(token)) {
      score += 35;
    }
  }

  score += scoreSearchIntents(document, queryTerms);
  score += scoreNameStart(document, queryTerms);
  score += scoreCompleteness(document);

  return score;
}

export function documentMatchesQuery(
  document: SearchProductDocument,
  query: string,
  synonyms: SearchSynonymRecord[]
) {
  const profile = buildSearchQueryProfile(query, synonyms);
  const { normalizedQuery, compactQuery, variants, technicalTokens } = profile;
  const documentText = normalizeSearchText(
    `${document.shopCode} ${document.shopCodeCompact} ${document.name} ${document.searchText} ${document.synonymText} ${document.translitText} ${document.brandText}`
  );
  const semanticDocumentText = buildSemanticDocumentText(document);
  const semanticDocumentTokens = new Set(tokenizeSearchText(semanticDocumentText));
  const documentTechnicalTokens = extractTechnicalTokens(semanticDocumentText);

  if (!normalizedQuery) {
    return false;
  }

  if (compactQuery && document.shopCodeCompact === compactQuery) {
    return true;
  }

  if (technicalTokens.length > 0) {
    if (!hasAllTechnicalTokens(documentTechnicalTokens, technicalTokens)) {
      return false;
    }

    if (profile.hasLampSubject && !hasLampSubject(document, semanticDocumentTokens)) {
      return false;
    }
  } else if (compactQuery && document.shopCodeCompact.includes(compactQuery)) {
    return true;
  }

  if (variants.some((variant) => variant.length >= 2 && documentText.includes(variant))) {
    return true;
  }

  const queryTokens = profile.queryTokens;
  const documentTokens = tokenizeSearchText(documentText);

  return queryTokens.every((queryToken) =>
    normalizeTechnicalToken(queryToken)
      ? hasTechnicalToken(documentTechnicalTokens, normalizeTechnicalToken(queryToken))
      : documentTokens.some(
          (documentToken) =>
            documentToken === queryToken ||
            documentToken.startsWith(queryToken) ||
            canCompareFuzzy(queryToken, documentToken)
        )
  );
}

function buildSearchQueryProfile(query: string, synonyms: SearchSynonymRecord[]) {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactShopCode(query);
  const queryTerms = expandQueryTerms(normalizedQuery, synonyms);
  const queryTokens = [...new Set(tokenizeSearchText(queryTerms.join(" ")))];
  const queryVariants = buildQueryVariants(query, synonyms);
  const technicalTokens = extractTechnicalTokens(queryTerms.join(" "));
  const hasLampSubject = queryTokens.some((token) => lampSubjectTokens.has(token));

  return {
    normalizedQuery,
    compactQuery,
    queryTerms,
    queryTokens,
    queryVariants,
    variants: queryVariants,
    technicalTokens,
    hasLampSubject
  };
}

function buildSemanticDocumentText(document: SearchProductDocument) {
  return normalizeSearchText(
    `${document.name} ${document.categoryName} ${document.subcategoryName} ${document.searchText} ${document.synonymText} ${document.translitText} ${document.brandText}`
  );
}

function extractTechnicalTokens(value: string) {
  const tokens = tokenizeSearchText(value)
    .map(normalizeTechnicalToken)
    .filter(Boolean);
  return [...new Set(tokens)];
}

function hasAllTechnicalTokens(documentTokens: string[], queryTokens: string[]) {
  return queryTokens.every((token) => hasTechnicalToken(documentTokens, token));
}

function hasTechnicalToken(documentTokens: string[], queryToken: string) {
  const aliases = technicalTokenAliases[queryToken] ?? [queryToken];
  return aliases.some((alias) => documentTokens.includes(alias));
}

function isLampTechnicalToken(token: string) {
  return token === "t10" || token === "w5w" || /^h\d{1,2}$/.test(token);
}

function hasLampSubject(document: SearchProductDocument, documentTokens: Set<string>) {
  return (
    document.categorySlug === "elektrika" &&
      document.subcategorySlug === "lampy"
  ) || [...lampSubjectTokens].some((token) => documentTokens.has(token));
}

function scoreSearchIntents(document: SearchProductDocument, queryTerms: string[]) {
  let score = 0;
  const joinedTerms = normalizeSearchText(queryTerms.join(" "));

  for (const boost of searchIntentBoosts) {
    const matchedIntent = boost.terms.some((term) => joinedTerms.includes(normalizeSearchText(term)));
    if (!matchedIntent) {
      continue;
    }

    if (boost.categorySlug && document.categorySlug !== boost.categorySlug) {
      continue;
    }

    if (boost.subcategorySlug && document.subcategorySlug !== boost.subcategorySlug) {
      continue;
    }

    score += boost.score;
  }

  return score;
}

function scoreNameStart(document: SearchProductDocument, queryTerms: string[]) {
  const normalizedName = normalizeSearchText(document.name);
  const terms = queryTerms
    .map(normalizeSearchText)
    .filter((term) => term.length >= 3)
    .sort((a, b) => b.length - a.length);

  let score = 0;
  for (const term of terms) {
    if (normalizedName.startsWith(term)) {
      score = Math.max(score, 900);
    }

    if (normalizedName.split(/\s+/).some((token) => token.startsWith(term))) {
      score = Math.max(score, 350);
    }
  }

  return score;
}

function scoreCompleteness(document: SearchProductDocument) {
  let score = 0;
  if (document.categorySlug && document.subcategorySlug) {
    score += 30;
  }
  if (document.price > 0) {
    score += 10;
  }
  return score;
}

function phraseMatches(text: string, phrase: string) {
  return text === phrase || text.includes(` ${phrase} `) || text.startsWith(`${phrase} `) || text.endsWith(` ${phrase}`);
}

function trigramSimilarity(left: string, right: string) {
  const leftTrigrams = trigrams(left);
  const rightTrigrams = trigrams(right);
  if (leftTrigrams.size === 0 || rightTrigrams.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const trigram of leftTrigrams) {
    if (rightTrigrams.has(trigram)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (leftTrigrams.size + rightTrigrams.size);
}

function canCompareFuzzy(left: string, right: string) {
  return (
    left.length >= 4 &&
    right.length >= 4 &&
    left[0] === right[0] &&
    Math.abs(left.length - right.length) <= 3 &&
    trigramSimilarity(left, right) >= 0.45
  );
}

function trigrams(value: string) {
  const padded = `  ${value} `;
  const result = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

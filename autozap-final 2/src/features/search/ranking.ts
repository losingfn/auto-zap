import { searchIntentBoosts } from "@/config/search-synonyms";
import {
  buildQueryVariants,
  compactShopCode,
  expandQueryTerms,
  normalizeSearchText,
  tokenizeSearchText
} from "./normalization";
import type { SearchProductDocument, SearchProductHit, SearchSynonymRecord } from "./types";

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
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactShopCode(query);
  const queryTerms = expandQueryTerms(normalizedQuery, synonyms);
  const queryTokens = tokenizeSearchText(queryTerms.join(" "));
  const queryVariants = buildQueryVariants(query, synonyms);
  const documentText = normalizeSearchText(
    `${document.shopCode} ${document.shopCodeCompact} ${document.name} ${document.categoryName} ${document.subcategoryName} ${document.searchText} ${document.synonymText} ${document.translitText} ${document.brandText}`
  );
  const documentTokens = new Set(tokenizeSearchText(documentText));
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

  for (const variant of queryVariants) {
    if (variant.length >= 3 && phraseMatches(documentText, variant)) {
      score += variant.includes(" ") ? 450 : 220;
    }
  }

  for (const token of queryTokens) {
    if (token.length < 2) {
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
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactShopCode(query);
  const variants = buildQueryVariants(query, synonyms);
  const documentText = normalizeSearchText(
    `${document.shopCode} ${document.shopCodeCompact} ${document.name} ${document.searchText} ${document.synonymText} ${document.translitText} ${document.brandText}`
  );

  if (!normalizedQuery) {
    return false;
  }

  if (compactQuery && document.shopCodeCompact.includes(compactQuery)) {
    return true;
  }

  if (variants.some((variant) => variant.length >= 2 && documentText.includes(variant))) {
    return true;
  }

  const queryTokens = tokenizeSearchText(expandQueryTerms(normalizedQuery, synonyms).join(" "));
  const documentTokens = tokenizeSearchText(documentText);

  return queryTokens.every((queryToken) =>
    documentTokens.some(
      (documentToken) =>
        documentToken === queryToken ||
        documentToken.startsWith(queryToken) ||
        canCompareFuzzy(queryToken, documentToken)
    )
  );
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

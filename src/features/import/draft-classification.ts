import { isPublicTaxonomyTarget } from "@/config/public-taxonomy";
import {
  categorizeProductName,
  normalizeForCategorization
} from "@/features/categorization/engine";
import { AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD } from "@/features/categorization/types";
import type {
  CategorizationContext,
  CategorizationResult,
  CategorizationTarget
} from "@/features/categorization/types";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "./types";

export type DraftClassificationObserver = {
  measureSimilarityFallback: <T>(operation: () => T) => T;
};

export type DraftClassificationRun = {
  readonly ruleCount: number;
  categorizationFor: (row: AnalyzedImportRow) => CategorizationResult | undefined;
};

export function createDraftClassificationRun({
  rows,
  categorizationContext,
  existingProducts,
  observer
}: {
  rows: AnalyzedImportRow[];
  categorizationContext: CategorizationContext;
  existingProducts: ExistingProductSnapshot[];
  observer?: DraftClassificationObserver;
}): DraftClassificationRun {
  const existingByCode = buildExistingByCode(existingProducts);
  const similarityExistingProducts = [...existingByCode.values()];
  const categorizations = new Map<AnalyzedImportRow, CategorizationResult>();

  for (const row of rows) {
    if (!isImportProductCandidate(row)) {
      continue;
    }

    categorizations.set(
      row,
      categorizeImportRow(row, categorizationContext, existingByCode, similarityExistingProducts, observer)
    );
  }

  return {
    ruleCount: categorizationContext.rules.length,
    categorizationFor(row) {
      return categorizations.get(row);
    }
  };
}

export function isImportProductCandidate(row: AnalyzedImportRow) {
  return Boolean(
    row.shopCode &&
      row.price !== null &&
      row.status !== "error" &&
      row.status !== "skipped"
  );
}

function categorizeImportRow(
  row: AnalyzedImportRow,
  categorizationContext: CategorizationContext,
  existingByCode: Map<string, ExistingProductSnapshot>,
  similarityExistingProducts: ExistingProductSnapshot[],
  observer?: DraftClassificationObserver
) {
  const existingProduct = row.shopCode ? existingByCode.get(row.shopCode) : null;
  const initialResult = categorizeProductName(buildCategorizationTitle(row), categorizationContext, {
    existingProduct
  });

  if (
    initialResult.source === "existing_product_category" ||
    (initialResult.target &&
      initialResult.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD)
  ) {
    return initialResult;
  }

  const findSimilar = () => findSimilarExistingProductTarget(row, similarityExistingProducts);
  const similarResult = observer
    ? observer.measureSimilarityFallback(findSimilar)
    : findSimilar();
  return similarResult ?? initialResult;
}

function buildExistingByCode(existingProducts: ExistingProductSnapshot[]) {
  return new Map(existingProducts.map((product) => [product.shopCode, product]));
}

const similarityStopTokens = new Set([
  "для",
  "без",
  "под",
  "над",
  "при",
  "авто",
  "ваз",
  "газ",
  "уаз",
  "шт",
  "комплект",
  "деталь"
]);

function findSimilarExistingProductTarget(
  row: AnalyzedImportRow,
  existingProducts: ExistingProductSnapshot[]
): CategorizationResult | null {
  const rowTokens = tokenizeForSimilarity(buildCategorizationTitle(row));
  if (rowTokens.length < 2) {
    return null;
  }

  const candidates = existingProducts
    .map((product) => {
      const target = existingProductToPublicTarget(product);
      if (!target) {
        return null;
      }

      const productTokens = tokenizeForSimilarity(`${product.shopCode} ${product.name}`);
      const sharedTokens = rowTokens.filter((token) => productTokens.includes(token));
      const score =
        sharedTokens.length / Math.max(new Set([...rowTokens, ...productTokens]).size, 1);

      if (sharedTokens.length < 2 || score < 0.28) {
        return null;
      }

      return { target, score, sharedTokens };
    })
    .filter((candidate) => candidate !== null);

  if (candidates.length < 3) {
    return null;
  }

  const groups = new Map<
    string,
    {
      target: CategorizationTarget;
      count: number;
      scoreSum: number;
      signals: Set<string>;
    }
  >();

  for (const candidate of candidates) {
    const key = `${candidate.target.categorySlug}/${candidate.target.subcategorySlug}`;
    const group =
      groups.get(key) ??
      {
        target: candidate.target,
        count: 0,
        scoreSum: 0,
        signals: new Set<string>()
      };
    group.count += 1;
    group.scoreSum += candidate.score;
    for (const signal of candidate.sharedTokens.slice(0, 3)) {
      group.signals.add(signal);
    }
    groups.set(key, group);
  }

  const [best, second] = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.scoreSum / b.count - a.scoreSum / a.count
  );
  if (!best) {
    return null;
  }

  const agreement = best.count / candidates.length;
  if (best.count < 3 || agreement < 0.75 || (second && second.count >= best.count * 0.4)) {
    return null;
  }

  const averageScore = best.scoreSum / best.count;
  return {
    target: best.target,
    matchedRule: null,
    confidence: Math.min(0.94, 0.92 + averageScore * 0.04),
    source: "similarity",
    reason: "Категория определена по похожим товарам активного каталога.",
    matchedSignals: [
      {
        kind: "token",
        value: [...best.signals].slice(0, 5).join(" ")
      },
      {
        kind: "validation",
        value: `similarity:${best.count}/${candidates.length}`
      }
    ],
    needsReview: false,
    reviewReason: null
  };
}

function existingProductToPublicTarget(
  product: ExistingProductSnapshot
): CategorizationTarget | null {
  if (
    product.status !== "active" ||
    !product.categoryId ||
    !product.subcategoryId ||
    !product.categorySlug ||
    !product.subcategorySlug ||
    !isPublicTaxonomyTarget(product.categorySlug, product.subcategorySlug)
  ) {
    return null;
  }

  return {
    categoryId: product.categoryId,
    categorySlug: product.categorySlug,
    categoryName: product.categoryName ?? undefined,
    subcategoryId: product.subcategoryId,
    subcategorySlug: product.subcategorySlug,
    subcategoryName: product.subcategoryName ?? undefined
  };
}

function tokenizeForSimilarity(value: string) {
  return [
    ...new Set(
      normalizeForCategorization(value)
        .split(/\s+/)
        .map((token) => token.replace(/^\d+|\d+$/g, ""))
        .filter(
          (token) =>
            token.length >= 3 &&
            !/^\d+$/.test(token) &&
            !similarityStopTokens.has(token)
        )
    )
  ];
}

function buildCategorizationTitle(row: AnalyzedImportRow) {
  return `${row.shopCode ?? ""} ${row.name || row.rawName}`.trim();
}

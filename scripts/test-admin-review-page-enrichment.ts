import assert from "node:assert/strict";
import { catalogTaxonomy } from "../src/config/catalog-taxonomy";
import { buildCategorySuggestion } from "../src/features/admin/review";
import { reuseEnrichedPageRows } from "../src/features/admin/review-page-enrichment";
import { buildDefaultCategorizationContext } from "../src/features/categorization/engine";
import type { CategorizationTarget } from "../src/features/categorization/types";

type ReviewRowFixture = {
  reviewId: string;
  shopCode: string;
  name: string;
  rawName: string;
  suggestedCategoryId: null;
  suggestedSubcategoryId: null;
  displayMarker: string;
};

type EnrichedReviewRowFixture = ReviewRowFixture & {
  suggestion: ReturnType<typeof buildCategorySuggestion>;
  groupKey: string;
  groupLabel: string;
  safeToApply: boolean;
};

const targetBySlug = new Map<string, CategorizationTarget>();
for (const category of catalogTaxonomy) {
  for (const [subcategorySlug, subcategoryName] of category.subcategories) {
    targetBySlug.set(`${category.slug}/${subcategorySlug}`, {
      categoryId: `category:${category.slug}`,
      categorySlug: category.slug,
      categoryName: category.name,
      subcategoryId: `subcategory:${category.slug}/${subcategorySlug}`,
      subcategorySlug,
      subcategoryName
    });
  }
}

const categorizationContext = {
  ...buildDefaultCategorizationContext(),
  targetBySlug
};

const groupingRows: ReviewRowFixture[] = [
  fixture("context", "ТС-1", "Болт суппорт передний"),
  fixture("exact", "W 914/2", "Фильтр масляный MANN W 914/2"),
  fixture("family", "SACHS-1", "Амортизатор передний газовый"),
  fixture("conflict", "OIL-1", "Датчик давления масла кардан"),
  fixture("cyrillic", "RU-1", "Ремкомплект тормозного суппорта"),
  fixture("latin", "BOSCH-1", "Brake caliper repair kit"),
  fixture("numbers", "DIN-933", "Болт DIN 933 M10x30"),
  fixture("symbols", "A/12-4", "Фильтр, масляный / A-12.4"),
  fixture("empty", "EMPTY-1", "", ""),
  fixture("fastener", "NUT-M10", "Гайка М10 универсальная"),
  fixture("other-products", "OTHER-1", "Неизвестный универсальный автомобильный аксессуар"),
  fixture("no-match", "NONE-1", "QZX 9911 ###")
];

const groupedEnrichedRows = groupingRows.map(enrich);
const enrichedByReviewId = new Map(groupedEnrichedRows.map((row) => [row.reviewId, row]));
const pageRows: ReviewRowFixture[] = [
  { ...groupingRows[6]!, displayMarker: "page-numbers" },
  { ...groupingRows[0]!, displayMarker: "page-context" },
  { ...groupingRows[11]!, displayMarker: "page-no-match" },
  { ...groupingRows[4]!, displayMarker: "page-cyrillic" },
  {
    ...groupingRows[1]!,
    name: "Фильтр воздушный MANN C 30 135",
    rawName: "Фильтр воздушный MANN C 30 135",
    displayMarker: "page-changed-input"
  },
  fixture("outside-first-300", "OUT-1", "Ремень генератора", "Ремень генератора", "page-outside")
];

let baselineCalls = 0;
const baseline = pageRows.map((row) => {
  baselineCalls += 1;
  return enrich(row);
});

let reusePathCalls = 0;
const metrics = {
  pageRowsReused: 0,
  pageRowsClassified: 0,
  pageRowsCacheMiss: 0
};
const reused = reuseEnrichedPageRows(
  pageRows,
  enrichedByReviewId,
  (row) => {
    reusePathCalls += 1;
    return enrich(row);
  },
  metrics
);

assert.deepEqual(reused, baseline);
assert.deepEqual(
  reused.map((row) => row.suggestion),
  baseline.map((row) => row.suggestion)
);
assert.deepEqual(reused.map((row) => row.reviewId), pageRows.map((row) => row.reviewId));
assert.equal(baselineCalls, 6);
assert.equal(reusePathCalls, 2);
assert.deepEqual(metrics, {
  pageRowsReused: 4,
  pageRowsClassified: 2,
  pageRowsCacheMiss: 2
});

console.log("ok - page enrichment reuse preserves complete ReviewSuggestion values and page order");

function fixture(
  reviewId: string,
  shopCode: string,
  name: string,
  rawName = name,
  displayMarker = reviewId
): ReviewRowFixture {
  return {
    reviewId,
    shopCode,
    name,
    rawName,
    suggestedCategoryId: null,
    suggestedSubcategoryId: null,
    displayMarker
  };
}

function enrich(row: ReviewRowFixture): EnrichedReviewRowFixture {
  const suggestion = buildCategorySuggestion(row, categorizationContext, targetBySlug);
  const groupKey = `${suggestion.categoryId ?? "manual"}:${suggestion.subcategoryId ?? "manual"}:${suggestion.rulePattern ?? ""}`;

  return {
    ...row,
    suggestion,
    groupKey,
    groupLabel: groupKey,
    safeToApply:
      suggestion.level !== "manual" &&
      Boolean(suggestion.categoryId && suggestion.subcategoryId) &&
      suggestion.conflictingSignals.length === 0
  };
}

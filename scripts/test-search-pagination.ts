import assert from "node:assert/strict";
import { SEARCH_MAX_TOTAL_HITS } from "../src/features/search/meilisearch";
import {
  getAccessibleSearchPage,
  getAccessibleTotal,
  getSearchOffset,
  getSearchPageHref,
  getSearchPageSlice,
  getSearchTotalPages,
  parseSearchPage,
  visibleSearchPages,
  SEARCH_PAGE_SIZE
} from "../src/features/search/pagination";
import { rankSearchHits } from "../src/features/search/ranking";
import type { SearchProductDocument } from "../src/features/search/types";

function run(name: string, test: () => void) {
  test();
  console.log(`ok - ${name}`);
}

run("parses only safe positive integer pages", () => {
  assert.equal(parseSearchPage(undefined), 1);
  assert.equal(parseSearchPage("1"), 1);
  assert.equal(parseSearchPage("15"), 15);
  for (const value of ["0", "-5", "abc", "1.5", "", "NaN", "Infinity", "9007199254740992"]) {
    assert.equal(parseSearchPage(value), 1);
  }
});

run("calculates offsets and accessible page counts", () => {
  assert.equal(SEARCH_PAGE_SIZE, 30);
  assert.equal(getSearchOffset(1), 0);
  assert.equal(getSearchOffset(3), 60);
  assert.equal(getSearchTotalPages(0), 0);
  assert.equal(getSearchTotalPages(1), 1);
  assert.equal(getSearchTotalPages(30), 1);
  assert.equal(getSearchTotalPages(31), 2);
  assert.equal(getSearchTotalPages(60), 2);
  assert.equal(getSearchTotalPages(61), 3);
  assert.equal(getAccessibleTotal(8613, SEARCH_MAX_TOTAL_HITS), 1000);
  assert.equal(getSearchTotalPages(getAccessibleTotal(8613, SEARCH_MAX_TOTAL_HITS)), 34);
});

run("builds encoded search links without page one", () => {
  assert.equal(getSearchPageHref("масло моторное", 1), "/search?q=%D0%BC%D0%B0%D1%81%D0%BB%D0%BE+%D0%BC%D0%BE%D1%82%D0%BE%D1%80%D0%BD%D0%BE%D0%B5");
  assert.equal(getSearchPageHref("T10 W5W&=", 2), "/search?q=T10+W5W%26%3D&page=2");
});

run("redirects only out-of-range pages and resets a new query to page one", () => {
  assert.equal(getAccessibleSearchPage(999, 13), 13);
  assert.equal(getAccessibleSearchPage(999, 1), 1);
  assert.equal(getAccessibleSearchPage(2, 13), 2);
  assert.equal(getSearchPageHref("фильтр", 1), "/search?q=%D1%84%D0%B8%D0%BB%D1%8C%D1%82%D1%80");
});

run("keeps pagination compact", () => {
  assert.deepEqual(visibleSearchPages(1, 34), [1, 2, 3, "gap", 34]);
  assert.deepEqual(visibleSearchPages(10, 34), [1, "gap", 8, 9, 10, 11, 12, "gap", 34]);
  assert.deepEqual(visibleSearchPages(34, 34), [1, "gap", 32, 33, 34]);
});

run("slices one ranked candidate set without duplicate or unstable results", () => {
  const documents = Array.from({ length: 90 }, (_, index) => createDocument(index));
  const ranked = rankSearchHits(documents, "фильтр", [], new Map(), true);
  const page1 = getSearchPageSlice(ranked, 1).map((hit) => hit.id);
  const page2 = getSearchPageSlice(ranked, 2).map((hit) => hit.id);
  const page3 = getSearchPageSlice(ranked, 3).map((hit) => hit.id);

  assert.equal(new Set([...page1, ...page2, ...page3]).size, 90);
  assert.deepEqual(getSearchPageSlice(ranked, 2).map((hit) => hit.id), page2);
});

run("measures the fixed 1,000-candidate window for each requested page", () => {
  const documents = Array.from({ length: SEARCH_MAX_TOTAL_HITS }, (_, index) => createDocument(index));

  for (const page of [1, 2, 3, 34]) {
    const startedAt = performance.now();
    const hits = getSearchPageSlice(rankSearchHits(documents, "фильтр", [], new Map(), true), page);
    const durationMs = performance.now() - startedAt;

    assert.equal(hits.length, page === 34 ? 10 : 30);
    console.log(
      `benchmark - page ${page}: candidates=${SEARCH_MAX_TOTAL_HITS} duration_ms=${durationMs.toFixed(2)}`
    );
  }
});

function createDocument(index: number): SearchProductDocument {
  const id = String(index).padStart(3, "0");
  return {
    id,
    catalogVersionId: "fixture",
    status: "active",
    shopCode: `F-${id}`,
    shopCodeNormalized: `F${id}`,
    shopCodeCompact: `F${id}`,
    name: `Фильтр ${String(SEARCH_MAX_TOTAL_HITS - index).padStart(4, "0")}`,
    slug: `filter-${id}`,
    price: index + 1,
    categorySlug: "dvigatel",
    categoryName: "Двигатель",
    subcategorySlug: "filtry",
    subcategoryName: "Фильтры",
    url: `/catalog/dvigatel/filtry/filter-${id}`,
    searchText: "фильтр",
    normalizedText: "фильтр",
    synonymText: "",
    translitText: "filter",
    brandText: ""
  };
}

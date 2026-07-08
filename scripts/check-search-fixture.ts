import path from "node:path";
import { buildDefaultCategorizationContext, categorizeProductName } from "../src/features/categorization/engine";
import { analyzeImportFile } from "../src/features/import/analyze";
import { buildSearchDocument, getStaticSubcategoryName } from "../src/features/search/documents";
import { documentMatchesQuery, rankSearchHits } from "../src/features/search/ranking";
import { getDefaultSearchSynonyms } from "../src/features/search/synonyms";
import type { SearchProductDocument } from "../src/features/search/types";

const [, , inputPath, ...queryArgs] = process.argv;

if (!inputPath) {
  console.error("Usage: pnpm search:fixture <path-to-catalog.xls|xlsx> [query...]");
  process.exit(1);
}

const queries = queryArgs.length > 0 ? queryArgs : ["масло", "акб", "дворники", "А-00002", "maslo", "акумулятор"];
const analysis = analyzeImportFile(path.resolve(inputPath));
const categorizationContext = buildDefaultCategorizationContext();
const synonyms = getDefaultSearchSynonyms();
const documents: SearchProductDocument[] = [];

for (const row of analysis.rows) {
  if (!row.shopCode || row.price === null || row.status === "error" || row.status === "skipped") {
    continue;
  }

  const categorization = categorizeProductName(
    `${row.shopCode} ${row.name || row.rawName}`,
    categorizationContext
  );

  if (!categorization.target) {
    continue;
  }

  const names = getStaticSubcategoryName(
    categorization.target.categorySlug,
    categorization.target.subcategorySlug
  );

  documents.push(
    buildSearchDocument(
      {
        id: `${row.rowNumber}-${row.shopCode}`,
        catalogVersionId: "fixture",
        shopCode: row.shopCode,
        rawName: row.rawName,
        name: row.name || row.shopCode,
        slug: row.shopCode.toLowerCase(),
        price: row.price,
        categorySlug: categorization.target.categorySlug,
        categoryName: names.categoryName ?? categorization.target.categorySlug,
        subcategorySlug: categorization.target.subcategorySlug,
        subcategoryName: names.subcategoryName ?? categorization.target.subcategorySlug
      },
      synonyms
    )
  );
}

const report = queries.map((query) => {
  const candidates = documents.filter((document) => documentMatchesQuery(document, query, synonyms));
  return {
    query,
    totalCandidates: candidates.length,
    hits: rankSearchHits(candidates, query, synonyms)
      .slice(0, 5)
      .map((hit) => ({
        shopCode: hit.shopCode,
        name: hit.name,
        category: hit.categoryName,
        subcategory: hit.subcategoryName,
        score: Math.round(hit.relevanceScore)
      }))
  };
});

console.log(
  JSON.stringify(
    {
      fileName: analysis.report.fileName,
      selectedSheetName: analysis.report.selectedSheetName,
      indexedFixtureDocuments: documents.length,
      report
    },
    null,
    2
  )
);

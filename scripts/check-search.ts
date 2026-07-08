import { searchProducts } from "../src/features/search/service";

const queries = process.argv.slice(2);

if (queries.length === 0) {
  console.error("Usage: pnpm search:check <query> [query...]");
  process.exit(1);
}

const report = [];
for (const query of queries) {
  const result = await searchProducts({ query, limit: 5 });
  report.push({
    query,
    source: result.source,
    total: result.total,
    fallbackReason: result.fallbackReason,
    hits: result.hits.map((hit) => ({
      shopCode: hit.shopCode,
      name: hit.name,
      category: hit.categoryName,
      subcategory: hit.subcategoryName,
      score: Math.round(hit.relevanceScore)
    }))
  });
}

console.log(JSON.stringify(report, null, 2));

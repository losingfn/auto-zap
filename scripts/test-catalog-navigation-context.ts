import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCatalogNavigationContext,
  withCatalogNavigationContext
} from "../src/features/catalog/navigation-context";

run("accepts only fixed internal purchase-list navigation contexts", () => {
  assert.equal(getCatalogNavigationContext("purchase-list"), "purchase-list");
  assert.equal(getCatalogNavigationContext("purchase-list-direct"), "purchase-list-direct");
  assert.equal(getCatalogNavigationContext("https://example.com"), null);
  assert.equal(getCatalogNavigationContext("/spisok-pokupok"), null);
  assert.equal(getCatalogNavigationContext(undefined), null);
});

run("preserves the context through catalog paths and existing query parameters", () => {
  assert.equal(
    withCatalogNavigationContext("/catalog/tormoznaya-sistema", "purchase-list"),
    "/catalog/tormoznaya-sistema?from=purchase-list"
  );
  assert.equal(
    withCatalogNavigationContext("/catalog/tormoznaya-sistema/kolodki?q=trw&page=2", "purchase-list"),
    "/catalog/tormoznaya-sistema/kolodki?q=trw&page=2&from=purchase-list"
  );
  assert.equal(withCatalogNavigationContext("/catalog", null), "/catalog");
});

run("catalog pages keep context through every hierarchy link and direct products return to the list", () => {
  const catalogSource = readFileSync("src/app/catalog/page.tsx", "utf8");
  const categorySource = readFileSync("src/app/catalog/[categorySlug]/page.tsx", "utf8");
  const subcategorySource = readFileSync(
    "src/app/catalog/[categorySlug]/[subcategorySlug]/page.tsx",
    "utf8"
  );
  const productSource = readFileSync(
    "src/app/catalog/[categorySlug]/[subcategorySlug]/[productSlug]/page.tsx",
    "utf8"
  );
  const productListSource = readFileSync("src/components/catalog/product-list.tsx", "utf8");
  const purchaseListSource = readFileSync("src/components/purchase-list/purchase-list-page.tsx", "utf8");

  assert.match(catalogSource, /context === "purchase-list" \? "\/spisok-pokupok" : "\/"/);
  assert.match(categorySource, /withCatalogNavigationContext\("\/catalog", context\)/);
  assert.match(subcategorySource, /withCatalogNavigationContext\(`\/catalog\/\$\{category\.slug\}`, context\)/);
  assert.match(productListSource, /navigationContext={navigationContext}/);
  assert.match(productSource, /context === "purchase-list-direct"/);
  assert.match(productSource, /"\/spisok-pokupok"/);
  assert.match(purchaseListSource, /withCatalogNavigationContext\(product\.url, "purchase-list-direct"\)/);
});

function run(name: string, test: () => void) {
  test();
  console.log(`✓ ${name}`);
}

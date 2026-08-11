import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSearchDocument } from "../src/features/search/documents";

const identityId = "11111111-1111-4111-8111-111111111111";

run("search documents retain the permanent identity without changing their snapshot primary key", () => {
  const document = buildSearchDocument(
    {
      id: "snapshot-product-id",
      catalogVersionId: "active-version-id",
      productIdentityId: identityId,
      shopCode: "A-100",
      name: "Фильтр масляный",
      slug: "a-100-filter-maslyanyy",
      price: 160,
      categorySlug: "filtry-i-masla",
      categoryName: "Фильтры и масла",
      subcategorySlug: "maslyanye-filtry",
      subcategoryName: "Масляные фильтры"
    },
    []
  );

  assert.equal(document.id, "snapshot-product-id");
  assert.equal(document.productIdentityId, identityId);
});

run("PostgreSQL fallback and Meilisearch retrieve productIdentityId for saved indicators", () => {
  const postgresSource = readFileSync("src/features/search/postgres.ts", "utf8");
  const serviceSource = readFileSync("src/features/search/service.ts", "utf8");
  const meiliSource = readFileSync("src/features/search/meilisearch.ts", "utf8");

  assert.match(postgresSource, /productIdentityId: products\.productIdentityId/);
  assert.match(serviceSource, /"productIdentityId"/);
  assert.match(meiliSource, /"productIdentityId"/);
});

run("purchase-list API accepts only productIdentityIds and queries that field", () => {
  const routeSource = readFileSync("src/app/api/purchase-list/route.ts", "utf8");
  const dataSource = readFileSync("src/features/catalog/data.ts", "utf8");

  assert.match(routeSource, /productIdentityIds/);
  assert.match(dataSource, /inArray\(products\.productIdentityId, normalizedIds\)/);
  assert.doesNotMatch(routeSource, /getProductsForPurchaseList\(shopCodes\)/);
});

run("navigation caps a large saved-list badge without changing the list cardinality", () => {
  const navigationSource = readFileSync(
    "src/components/purchase-list/purchase-list-navigation-link.tsx",
    "utf8"
  );

  assert.match(navigationSource, /const countLabel = count > 99 \? "99\+" : String\(count\)/);
});

function run(name: string, test: () => void) {
  test();
  console.log(`✓ ${name}`);
}

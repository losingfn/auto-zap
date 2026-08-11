import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { assertLocalTestDatabase } from "../src/lib/server/local-db-safety";

const { databaseUrl, databaseName } = assertLocalTestDatabase({
  requiredFlag: "ALLOW_LOCAL_DB_INTEGRATION_TESTS",
  purpose: "Purchase-list PostgreSQL integration test"
});
const sql = postgres(databaseUrl, { max: 1 });

const identityX = "11111111-1111-4111-8111-111111111111";
const identityY = "22222222-2222-4222-8222-222222222222";
const categoryId = "00000000-0000-0000-0000-00000000c001";
const subcategoryId = "00000000-0000-0000-0000-00000000d001";
const versionOneId = "00000000-0000-0000-0000-00000000a101";
const versionTwoId = "00000000-0000-0000-0000-00000000a102";
const versionThreeId = "00000000-0000-0000-0000-00000000a103";
const versionFourId = "00000000-0000-0000-0000-00000000a104";
const firstSnapshotId = "00000000-0000-0000-0000-00000000b101";
const secondSnapshotId = "00000000-0000-0000-0000-00000000b201";
const returnedSnapshotId = "00000000-0000-0000-0000-00000000b401";

async function main() {
  await reportAndVerifyTestTarget();
  await rebuildCleanSchema();
  await seedInitialActiveCatalog();

  const { POST } = await import("../src/app/api/purchase-list/route");

  await run("batch API resolves an active product by permanent identity only", async () => {
    const products = await loadProducts(POST, [identityX]);
    assert.equal(products.length, 1);
    assert.equal(products[0]?.productIdentityId, identityX);
    assert.equal(products[0]?.name, "Фильтр масляный");
    assert.equal(products[0]?.price, 140);
    assert.equal("id" in products[0]!, false);
    assert.equal("shopCode" in products[0]!, false);
  });

  await run("a new snapshot keeps identity X and returns its current price", async () => {
    await activateVersionTwo();
    const products = await loadProducts(POST, [identityX, identityX]);
    assert.equal(products.length, 1);
    assert.equal(products[0]?.productIdentityId, identityX);
    assert.equal(products[0]?.price, 160);
    assert.equal(products[0]?.name, "Фильтр масляный обновлённый");

    const snapshots = await sql<{ id: string; product_identity_id: string }[]>`
      SELECT id, product_identity_id
      FROM products
      WHERE id IN (${firstSnapshotId}, ${secondSnapshotId})
      ORDER BY id
    `;
    assert.equal(snapshots.length, 2);
    assert.notEqual(snapshots[0]?.id, snapshots[1]?.id);
    assert.ok(snapshots.every((snapshot) => snapshot.product_identity_id === identityX));
  });

  await run("an absent identity remains stored but does not resolve from archived snapshots", async () => {
    await activateVersionThreeWithoutIdentityX();
    assert.deepEqual(await loadProducts(POST, [identityX]), []);
    assert.equal((await sql`SELECT count(*)::int AS count FROM product_identities WHERE id = ${identityX}`)[0]?.count, 1);
    assert.equal((await sql`SELECT count(*)::int AS count FROM products WHERE product_identity_id = ${identityX}`)[0]?.count, 2);
    const currentProducts = await loadProducts(POST, [identityX, identityY]);
    assert.deepEqual(currentProducts.map((product) => product.productIdentityId), [identityY]);
  });

  await run("the same identity becomes resolvable again when it returns in a later active snapshot", async () => {
    await activateVersionFourWithReturnedIdentityX();
    const products = await loadProducts(POST, [identityX, identityY]);
    assert.deepEqual(products.map((product) => product.productIdentityId), [identityX]);
    assert.equal(products[0]?.price, 175);
    assert.equal(products[0]?.name, "Фильтр масляный снова в наличии");

    const [returned] = await sql<{ product_identity_id: string; id: string }[]>`
      SELECT id, product_identity_id FROM products WHERE id = ${returnedSnapshotId}
    `;
    assert.equal(returned?.product_identity_id, identityX);
    assert.notEqual(returned?.id, secondSnapshotId);
  });

  await run("the API rejects legacy shopCode payloads and validates the v2 batch shape", async () => {
    const legacyResponse = await POST(
      requestWithJson({ shopCodes: ["A-100"] })
    );
    assert.equal(legacyResponse.status, 400);

    const invalidResponse = await POST(
      requestWithJson({ productIdentityIds: "not-an-array" })
    );
    assert.equal(invalidResponse.status, 400);

    const invalidIdentityResponse = await POST(
      requestWithJson({ productIdentityIds: ["not-a-product-identity"] })
    );
    assert.equal(invalidIdentityResponse.status, 400);

    const tooLargeResponse = await POST(
      requestWithJson({ productIdentityIds: Array.from({ length: 101 }, () => identityX) })
    );
    assert.equal(tooLargeResponse.status, 400);
  });
}

async function reportAndVerifyTestTarget() {
  const [target] = await sql<{ database: string; user: string }[]>`
    SELECT current_database() AS database, current_user AS user
  `;
  console.log(`[purchase-list-postgres] current_database=${target?.database} current_user=${target?.user}`);
  assert.equal(target?.database, databaseName);
  assert.equal(target?.user, "autozap_test");
}

async function loadProducts(
  post: typeof import("../src/app/api/purchase-list/route").POST,
  productIdentityIds: string[]
) {
  const response = await post(requestWithJson({ productIdentityIds }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    products: Array<{ productIdentityId: string; name: string; price: number; url: string }>;
  };
  return body.products;
}

function requestWithJson(body: unknown) {
  return new Request("http://localhost/api/purchase-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function rebuildCleanSchema() {
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const migrationDirectory = path.join(process.cwd(), "db", "migrations");
  const migrations = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    await sql.unsafe(await readFile(path.join(migrationDirectory, migration), "utf8"));
  }
}

async function seedInitialActiveCatalog() {
  await sql`
    INSERT INTO categories (id, slug, name)
    VALUES (${categoryId}, 'filtry-i-masla', 'Фильтры и масла')
  `;
  await sql`
    INSERT INTO subcategories (id, category_id, slug, name)
    VALUES (${subcategoryId}, ${categoryId}, 'maslyanye-filtry', 'Масляные фильтры')
  `;
  await sql`
    INSERT INTO product_identities (id) VALUES (${identityX}), (${identityY})
  `;
  await sql`
    INSERT INTO catalog_versions (id, status, source_file_name, published_at)
    VALUES (${versionOneId}, 'active', 'v1.xlsx', '2026-03-01T00:00:00Z')
  `;
  await insertProduct({
    id: firstSnapshotId,
    catalogVersionId: versionOneId,
    productIdentityId: identityX,
    shopCode: "A-100",
    name: "Фильтр масляный",
    slug: "a-100-filter-maslyanyy",
    price: 140
  });
  await insertProduct({
    id: "00000000-0000-0000-0000-00000000b102",
    catalogVersionId: versionOneId,
    productIdentityId: identityY,
    shopCode: "B-200",
    name: "Колодки тормозные",
    slug: "b-200-kolodki-tormoznye",
    price: 320
  });
}

async function activateVersionTwo() {
  await archiveActiveCatalog();
  await sql`
    INSERT INTO catalog_versions (id, status, source_file_name, published_at)
    VALUES (${versionTwoId}, 'active', 'v2.xlsx', '2026-04-01T00:00:00Z')
  `;
  await insertProduct({
    id: secondSnapshotId,
    catalogVersionId: versionTwoId,
    productIdentityId: identityX,
    shopCode: "A-100",
    name: "Фильтр масляный обновлённый",
    slug: "a-100-filter-maslyanyy-obnovlennyy",
    price: 160
  });
  await insertProduct({
    id: "00000000-0000-0000-0000-00000000b202",
    catalogVersionId: versionTwoId,
    productIdentityId: identityY,
    shopCode: "B-200",
    name: "Колодки тормозные",
    slug: "b-200-kolodki-tormoznye",
    price: 330
  });
}

async function activateVersionThreeWithoutIdentityX() {
  await archiveActiveCatalog();
  await sql`
    INSERT INTO catalog_versions (id, status, source_file_name, published_at)
    VALUES (${versionThreeId}, 'active', 'v3.xlsx', '2026-05-01T00:00:00Z')
  `;
  await insertProduct({
    id: "00000000-0000-0000-0000-00000000b302",
    catalogVersionId: versionThreeId,
    productIdentityId: identityY,
    shopCode: "B-200",
    name: "Колодки тормозные",
    slug: "b-200-kolodki-tormoznye",
    price: 340
  });
}

async function activateVersionFourWithReturnedIdentityX() {
  await archiveActiveCatalog();
  await sql`
    INSERT INTO catalog_versions (id, status, source_file_name, published_at)
    VALUES (${versionFourId}, 'active', 'v4.xlsx', '2026-06-01T00:00:00Z')
  `;
  await insertProduct({
    id: returnedSnapshotId,
    catalogVersionId: versionFourId,
    productIdentityId: identityX,
    shopCode: "A-100",
    name: "Фильтр масляный снова в наличии",
    slug: "a-100-filter-maslyanyy-snova",
    price: 175
  });
}

async function archiveActiveCatalog() {
  await sql`UPDATE catalog_versions SET status = 'archived' WHERE status = 'active'`;
}

async function insertProduct(input: {
  id: string;
  catalogVersionId: string;
  productIdentityId: string;
  shopCode: string;
  name: string;
  slug: string;
  price: number;
}) {
  await sql`
    INSERT INTO products (
      id, catalog_version_id, product_identity_id, shop_code, raw_name, name, slug,
      price, category_id, subcategory_id, status, search_text
    ) VALUES (
      ${input.id}, ${input.catalogVersionId}, ${input.productIdentityId}, ${input.shopCode},
      ${`${input.shopCode} ${input.name}`}, ${input.name}, ${input.slug}, ${input.price},
      ${categoryId}, ${subcategoryId}, 'active', ${`${input.shopCode} ${input.name}`}
    )
  `;
}

async function run(name: string, test: () => Promise<void>) {
  await test();
  console.log(`✓ ${name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });

import { syncSearchIndexForActiveCatalog, syncSearchIndexForCatalogVersion } from "../src/features/search/indexing";

async function main() {
  const [, , catalogVersionId] = process.argv;

  const result = catalogVersionId
    ? await syncSearchIndexForCatalogVersion(catalogVersionId)
    : await syncSearchIndexForActiveCatalog();

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("[search:sync] failed", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});

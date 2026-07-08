import { syncSearchIndexForActiveCatalog, syncSearchIndexForCatalogVersion } from "../src/features/search/indexing";

const [, , catalogVersionId] = process.argv;

const result = catalogVersionId
  ? await syncSearchIndexForCatalogVersion(catalogVersionId)
  : await syncSearchIndexForActiveCatalog();

console.log(JSON.stringify(result, null, 2));

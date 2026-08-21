import { migrateLegacyStandaloneImportFiles } from "../src/features/import/storage";

async function main() {
  const result = await migrateLegacyStandaloneImportFiles();
  console.log(
    `[import-storage] moved ${result.moved} legacy upload file(s): ${result.legacyUploadDir} -> ${result.uploadDir}`
  );
}

main().catch((error) => {
  console.error("[import-storage] legacy migration failed", error);
  process.exitCode = 1;
});

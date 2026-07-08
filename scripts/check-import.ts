import path from "node:path";
import { analyzeImportFile } from "../src/features/import/analyze";

const [, , inputPath, selectedSheetName] = process.argv;

if (!inputPath) {
  console.error("Usage: pnpm import:check <path-to-catalog.xls|xlsx> [sheetName]");
  process.exit(1);
}

const result = analyzeImportFile(path.resolve(inputPath), { selectedSheetName });

console.log(
  JSON.stringify(
    {
      report: result.report,
      note: "This command validates and previews import only. It does not write to PostgreSQL."
    },
    null,
    2
  )
);

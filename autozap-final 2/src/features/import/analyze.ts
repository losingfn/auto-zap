import { readImportWorkbook } from "./excel-reader";
import { buildImportReport } from "./report";
import type { ExistingProductSnapshot, ImportAnalysisResult } from "./types";

export interface AnalyzeImportFileOptions {
  selectedSheetName?: string;
  existingProducts?: ExistingProductSnapshot[];
}

export function analyzeImportFile(
  filePath: string,
  options: AnalyzeImportFileOptions = {}
): ImportAnalysisResult {
  const workbook = readImportWorkbook(filePath, options.selectedSheetName);
  const report = buildImportReport({
    fileName: workbook.fileName,
    selectedSheetName: workbook.selectedSheetName,
    sheets: workbook.sheets,
    rows: workbook.rows,
    existingProducts: options.existingProducts
  });

  return {
    report,
    rows: workbook.rows
  };
}

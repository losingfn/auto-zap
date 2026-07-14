import path from "node:path";
import * as XLSX from "xlsx";
import { isBlankValue, normalizeHeader, normalizeNumber, normalizeText } from "./normalize";
import { parseProductIdentity } from "./product-parser";
import type {
  AnalyzedImportRow,
  DetectedColumns,
  ExcelCellValue,
  ExcelSheetSummary,
  ImportRowIssue,
  ImportRowStatus
} from "./types";

const SERVICE_ROW_HEADERS = new Set(["магазин", "склад", "номенклатура"]);

interface SheetRows {
  name: string;
  range: string | null;
  rows: ExcelCellValue[][];
  startRowIndex: number;
}

export interface ReadWorkbookResult {
  fileName: string;
  selectedSheetName: string;
  sheets: ExcelSheetSummary[];
  rows: AnalyzedImportRow[];
}

export function readImportWorkbook(filePath: string, selectedSheetName?: string): ReadWorkbookResult {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: true,
    WTF: false
  });

  return readWorkbook(workbook, path.basename(filePath), selectedSheetName);
}

export function readImportWorkbookFromBuffer({
  buffer,
  fileName,
  selectedSheetName
}: {
  buffer: Buffer | Uint8Array;
  fileName: string;
  selectedSheetName?: string;
}): ReadWorkbookResult {
  const workbook = XLSX.read(buffer, {
    cellDates: false,
    raw: true,
    WTF: false,
    type: "buffer"
  });

  return readWorkbook(workbook, path.basename(fileName), selectedSheetName);
}

function readWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  selectedSheetName?: string
): ReadWorkbookResult {
  if (workbook.SheetNames.length === 0) {
    throw new Error("В Excel-файле не найдено ни одного листа.");
  }

  const sheetRows = workbook.SheetNames.map((name) => readSheetRows(workbook, name));
  const summaries = sheetRows.map(summarizeSheet);
  const selected =
    (selectedSheetName && sheetRows.find((sheet) => sheet.name === selectedSheetName)) ??
    chooseMainSheet(sheetRows);

  if (!selected) {
    throw new Error("Не удалось выбрать лист для импорта.");
  }

  const selectedSummary = summaries.find((sheet) => sheet.name === selected.name);
  if (!selectedSummary) {
    throw new Error("Не удалось прочитать структуру выбранного листа.");
  }

  return {
    fileName,
    selectedSheetName: selected.name,
    sheets: summaries,
    rows: analyzeSheetRows(selected, selectedSummary.detectedColumns)
  };
}

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): SheetRows {
  const worksheet = workbook.Sheets[sheetName];
  const rangeText = worksheet["!ref"] ?? null;
  if (!rangeText) {
    return {
      name: sheetName,
      range: null,
      rows: [],
      startRowIndex: 0
    };
  }

  const range = XLSX.utils.decode_range(rangeText);
  const rows: ExcelCellValue[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: ExcelCellValue[] = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      row.push((cell?.v ?? null) as ExcelCellValue);
    }
    rows.push(row);
  }

  return {
    name: sheetName,
    range: rangeText,
    rows,
    startRowIndex: range.s.r
  };
}

function summarizeSheet(sheet: SheetRows): ExcelSheetSummary {
  const detectedColumns = detectColumns(sheet.rows);
  const nonEmptyRows = sheet.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((value) => !isBlankValue(value)));
  const columnCount = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);

  return {
    name: sheet.name,
    range: sheet.range,
    rowCount: sheet.rows.length,
    columnCount,
    firstRowNumber:
      nonEmptyRows.length > 0 ? sheet.startRowIndex + nonEmptyRows[0].index + 1 : null,
    lastRowNumber:
      nonEmptyRows.length > 0
        ? sheet.startRowIndex + nonEmptyRows[nonEmptyRows.length - 1].index + 1
        : null,
    detectedColumns,
    headerPreview: sheet.rows.slice(0, 8)
  };
}

function detectColumns(rows: ExcelCellValue[][]): DetectedColumns {
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const sampleRows = rows.slice(0, Math.min(rows.length, 20));
  const productSampleRows = rows.slice(0, Math.min(rows.length, 80));

  let rawNameColumn: number | null = null;
  let priceColumn: number | null = null;
  let stockColumn: number | null = null;
  let stockSumColumn: number | null = null;

  for (let column = 0; column < maxColumns; column += 1) {
    const headers = sampleRows.map((row) => normalizeHeader(row[column])).filter(Boolean);
    const joined = headers.join(" ");

    if (
      rawNameColumn === null &&
      (joined.includes("номенклатур") ||
        joined.includes("товар") ||
        productSampleRows.some((row) => parseProductIdentity(row[column])))
    ) {
      rawNameColumn = column;
    }

    if (priceColumn === null && joined.includes("цена")) {
      priceColumn = column;
    }

    if (stockColumn === null && joined.includes("остаток")) {
      stockColumn = column;
    }

    if (stockSumColumn === null && joined.includes("сумма")) {
      stockSumColumn = column;
    }
  }

  return {
    rawNameColumn: rawNameColumn ?? (maxColumns > 0 ? 0 : null),
    priceColumn: priceColumn ?? (maxColumns > 2 ? 2 : null),
    stockColumn,
    stockSumColumn
  };
}

function chooseMainSheet(sheets: SheetRows[]) {
  return [...sheets].sort((a, b) => countProductRows(b) - countProductRows(a))[0] ?? null;
}

function countProductRows(sheet: SheetRows) {
  const columns = detectColumns(sheet.rows);
  if (columns.rawNameColumn === null) {
    return 0;
  }

  return sheet.rows.filter((row) => parseProductIdentity(row[columns.rawNameColumn!])).length;
}

function analyzeSheetRows(sheet: SheetRows, columns: DetectedColumns): AnalyzedImportRow[] {
  const rawNameColumn = columns.rawNameColumn;
  if (rawNameColumn === null) {
    return [];
  }

  const firstProductIndex = sheet.rows.findIndex((row) =>
    parseProductIdentity(row[rawNameColumn])
  );

  const analyzedRows = sheet.rows.map((row, localIndex) => {
    const rowIndex = sheet.startRowIndex + localIndex;
    const rowNumber = rowIndex + 1;
    const rawName = normalizeText(row[rawNameColumn]);
    const isEmpty = row.every((value) => isBlankValue(value));
    const issues: ImportRowIssue[] = [];

    if (isEmpty) {
      return skippedRow(sheet.name, rowNumber, rowIndex, rawName, "empty_row", "Пустая строка.");
    }

    if (isServiceRow(rawName)) {
      return skippedRow(
        sheet.name,
        rowNumber,
        rowIndex,
        rawName,
        "technical_row",
        "Служебная строка выгрузки."
      );
    }

    if (firstProductIndex === -1 || localIndex < firstProductIndex) {
      return skippedRow(
        sheet.name,
        rowNumber,
        rowIndex,
        rawName,
        "technical_row",
        "Техническая строка до начала номенклатуры."
      );
    }

    if (normalizeHeader(rawName).startsWith("итого")) {
      return skippedRow(sheet.name, rowNumber, rowIndex, rawName, "total_row", "Итоговая строка.");
    }

    const identity = parseProductIdentity(rawName);
    const price = normalizeNumber(columns.priceColumn === null ? null : row[columns.priceColumn]);
    const stockQuantity = normalizeNumber(
      columns.stockColumn === null ? null : row[columns.stockColumn]
    );
    const stockSum = normalizeNumber(
      columns.stockSumColumn === null ? null : row[columns.stockSumColumn]
    );

    if (!identity) {
      issues.push({
        code: "missing_code",
        field: "shopCode",
        message: "Не найден внутренний код в формате ПРЕФИКС-ЦИФРЫ."
      });
    } else if (!identity.name) {
      issues.push({
        code: "missing_name",
        field: "name",
        message: "После внутреннего кода отсутствует название товара."
      });
    }

    const rawPrice = columns.priceColumn === null ? null : row[columns.priceColumn];
    if (isBlankValue(rawPrice)) {
      issues.push({
        code: "missing_price",
        field: "price",
        message: "Не заполнена цена товара."
      });
    } else if (price === null) {
      issues.push({
        code: "invalid_price",
        field: "price",
        message: "Цена товара не является числом."
      });
    } else if (price === 0) {
      issues.push({
        code: "zero_price",
        field: "price",
        message: "Цена товара равна нулю."
      });
    } else if (price < 0) {
      issues.push({
        code: "negative_price",
        field: "price",
        message: "Цена товара меньше нуля."
      });
    }

    const hasBlockingError = issues.some((issue) => issue.code !== "missing_name");
    const status: ImportRowStatus = hasBlockingError
      ? "error"
      : issues.length > 0
        ? "needs_review"
        : "valid";

    return {
      sheetName: sheet.name,
      rowNumber,
      rowIndex,
      rawName,
      stockQuantity,
      price,
      stockSum,
      shopCode: identity?.shopCode ?? null,
      name: identity?.name ?? null,
      status,
      issues
    };
  });

  return markDuplicateShopCodes(analyzedRows);
}

function markDuplicateShopCodes(rows: AnalyzedImportRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.shopCode && row.status !== "skipped") {
      counts.set(row.shopCode, (counts.get(row.shopCode) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    if (!row.shopCode || (counts.get(row.shopCode) ?? 0) <= 1) {
      return row;
    }

    return {
      ...row,
      status: "error" as const,
      issues: [
        ...row.issues,
        {
          code: "duplicate_code" as const,
          field: "shopCode" as const,
          message: `Артикул ${row.shopCode} встречается в файле несколько раз.`
        }
      ]
    };
  });
}

function isServiceRow(rawName: string) {
  return SERVICE_ROW_HEADERS.has(normalizeHeader(rawName));
}

function skippedRow(
  sheetName: string,
  rowNumber: number,
  rowIndex: number,
  rawName: string,
  code: "empty_row" | "technical_row" | "total_row",
  message: string
): AnalyzedImportRow {
  return {
    sheetName,
    rowNumber,
    rowIndex,
    rawName,
    stockQuantity: null,
    price: null,
    stockSum: null,
    shopCode: null,
    name: null,
    status: "skipped",
    issues: [{ code, field: "row", message }]
  };
}

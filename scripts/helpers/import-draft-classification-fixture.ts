import { buildDefaultCategorizationContext } from "../../src/features/categorization/engine";
import type { ExistingProductSnapshot, AnalyzedImportRow } from "../../src/features/import/types";

const similarityTarget = {
  categoryId: "category-filter",
  categorySlug: "filtry-i-masla",
  categoryName: "Фильтры и масла",
  subcategoryId: "subcategory-oil-filter",
  subcategorySlug: "maslyanye-filtry",
  subcategoryName: "Масляные фильтры",
  status: "active" as const
};

export function createImportDraftClassificationFixture() {
  const existingProducts: ExistingProductSnapshot[] = [
    {
      shopCode: "EXISTING-1",
      name: "Старый фильтр",
      price: 100,
      ...similarityTarget
    },
    ...["SIM-1", "SIM-2", "SIM-3", "SIM-4"].map((shopCode, index) => ({
      shopCode,
      name: `Квантовая муфта омега ${index + 1}`,
      price: 100,
      ...similarityTarget
    }))
  ];

  const rows: AnalyzedImportRow[] = [
    importRow({ shopCode: "EXISTING-1", name: "Новое имя для существующего товара" }),
    importRow({ rowNumber: 3, shopCode: "NEW-1", name: "Фильтр масляный" }),
    importRow({ rowNumber: 4, shopCode: "NEW-2", name: "Квантовая муфта омега" }),
    importRow({
      rowNumber: 5,
      shopCode: "NEW-3",
      name: "Неизвестный компонент",
      status: "needs_review"
    }),
    importRow({
      rowNumber: 6,
      shopCode: null,
      name: null,
      rawName: "Строка с ошибкой",
      price: null,
      status: "error"
    }),
    importRow({
      rowNumber: 7,
      shopCode: null,
      name: null,
      rawName: "Техническая строка",
      price: null,
      status: "skipped"
    })
  ];

  return {
    rows,
    existingProducts,
    categorizationContext: buildDefaultCategorizationContext()
  };
}

export function importRow(overrides: Partial<AnalyzedImportRow> = {}): AnalyzedImportRow {
  return {
    sheetName: "Sheet1",
    rowNumber: 2,
    rowIndex: 1,
    rawName: "NEW-1 Фильтр масляный",
    stockQuantity: 1,
    price: 100,
    stockSum: 100,
    shopCode: "NEW-1",
    name: "Фильтр масляный",
    status: "valid",
    issues: [],
    ...overrides
  };
}

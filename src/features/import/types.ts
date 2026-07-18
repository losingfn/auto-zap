import type {
  CategorizationDecisionStatus,
  CategorizationMatchType,
  CategorizationSignal,
  CategorizationSource
} from "@/features/categorization/types";

export type ExcelCellValue = string | number | boolean | Date | null;

export type ImportRowStatus = "valid" | "needs_review" | "error" | "skipped";

export type ImportValidationCode =
  | "empty_row"
  | "technical_row"
  | "total_row"
  | "missing_code"
  | "duplicate_code"
  | "missing_name"
  | "missing_price"
  | "invalid_price"
  | "zero_price"
  | "negative_price";

export interface ExcelSheetSummary {
  name: string;
  range: string | null;
  rowCount: number;
  columnCount: number;
  firstRowNumber: number | null;
  lastRowNumber: number | null;
  detectedColumns: DetectedColumns;
  headerPreview: ExcelCellValue[][];
}

export interface DetectedColumns {
  rawNameColumn: number | null;
  priceColumn: number | null;
  stockColumn: number | null;
  stockSumColumn: number | null;
}

export interface ParsedProductIdentity {
  shopCode: string;
  name: string;
  rawCode: string;
}

export interface ImportRowIssue {
  code: ImportValidationCode;
  field: "row" | "rawName" | "shopCode" | "name" | "price";
  message: string;
}

export interface AnalyzedImportRow {
  sheetName: string;
  rowNumber: number;
  rowIndex: number;
  rawName: string;
  stockQuantity: number | null;
  price: number | null;
  stockSum: number | null;
  shopCode: string | null;
  name: string | null;
  status: ImportRowStatus;
  issues: ImportRowIssue[];
}

export interface ExistingProductSnapshot {
  shopCode: string;
  name: string;
  price: number;
  categoryId?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  subcategoryId?: string | null;
  subcategorySlug?: string | null;
  subcategoryName?: string | null;
  status?: string | null;
}

export interface AutoCategorizationRulePreview {
  id?: string;
  pattern: string;
  matchType: CategorizationMatchType;
  categorySlug: string;
  subcategorySlug?: string;
  priority: number;
}

export interface AutoCategorizationDecisionPreview {
  rowNumber: number;
  shopCode: string;
  name: string;
  rawName: string;
  confidence: number;
  source: CategorizationSource;
  decisionStatus?: CategorizationDecisionStatus;
  reviewReasonCode?: string | null;
  reason: string;
  needsReview: boolean;
  wouldAutoPublish: boolean;
  wouldRequireReview: boolean;
  categorySlug?: string;
  categoryName?: string;
  subcategorySlug?: string;
  subcategoryName?: string;
  matchedRule: AutoCategorizationRulePreview | null;
  matchedSignals: CategorizationSignal[];
}

export interface AutoCategorizationGroupPreview {
  key: string;
  label: string;
  count: number;
  examples: string[];
}

export interface AutoCategorizationSourceSummary {
  source: CategorizationSource;
  count: number;
}

export interface AutoCategorizationPreviewReport {
  totalProducts: number;
  legacyMatched: number;
  legacyNeedsReview: number;
  existingCategoryPreserved: number;
  shadowHigh: number;
  shadowMedium: number;
  shadowLow: number;
  wouldAutoPublish: number;
  wouldRequireReview: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  needsReview: number;
  emptyName: number;
  averageConfidence: number;
  automationPotential: number;
  threshold: number;
  sources: AutoCategorizationSourceSummary[];
  topUnresolvedGroups: AutoCategorizationGroupPreview[];
  highConfidenceExamples: AutoCategorizationDecisionPreview[];
  lowConfidenceExamples: AutoCategorizationDecisionPreview[];
  dangerousGroups: AutoCategorizationGroupPreview[];
}

export interface ImportPriceChangeReport {
  existingWithPriceCount: number;
  existingPriceUpdatedCount: number;
  increasedCount: number;
  decreasedCount: number;
  unchangedCount: number;
  maxIncreaseAmount: number;
  maxIncreasePercent: number;
  maxDecreaseAmount: number;
  maxDecreasePercent: number;
  averageChangeAmount: number;
  averageChangePercent: number;
}

export type ImportSafetyCheckStatus = "passed" | "warning" | "blocked";

export interface ImportSafetyCheckResult {
  code: string;
  status: ImportSafetyCheckStatus;
  message: string;
  currentValue: number | boolean;
  threshold?: number;
}

export interface ImportSafetyReport {
  canPublish: boolean;
  blockingCount: number;
  warningCount: number;
  checks: ImportSafetyCheckResult[];
}

export interface ImportPreviewReport {
  fileName: string;
  selectedSheetName: string;
  sheets: ExcelSheetSummary[];
  totalRows: number;
  productCandidateRows: number;
  parsedRows: number;
  validRows: number;
  reviewRows: number;
  errorRows: number;
  skippedRows: number;
  addedCount: number;
  updatedCount: number;
  archivedCount: number;
  unchangedCount: number;
  issueCounts: Record<string, number>;
  priceChanges: ImportPriceChangeReport;
  safety?: ImportSafetyReport;
  examples: {
    valid: AnalyzedImportRow[];
    needsReview: AnalyzedImportRow[];
    errors: AnalyzedImportRow[];
  };
  autoCategorizationPreview?: AutoCategorizationPreviewReport;
}

export interface ImportAnalysisResult {
  report: ImportPreviewReport;
  rows: AnalyzedImportRow[];
}

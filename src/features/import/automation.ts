import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationResult
} from "@/features/categorization/types";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "./types";

export function needsProductReview(
  row: Pick<AnalyzedImportRow, "status">,
  categorization: CategorizationResult
) {
  if (categorization.source === "existing_product_category") {
    return false;
  }

  if (categorization.decisionStatus === "AUTO_READY") {
    return false;
  }

  if (
    categorization.decisionStatus === "GROUP_REVIEW" ||
    categorization.decisionStatus === "MANUAL_REVIEW" ||
    categorization.decisionStatus === "BLOCKED_CONFLICT" ||
    categorization.decisionStatus === "INVALID_INPUT"
  ) {
    return true;
  }

  if (row.status === "needs_review" || categorization.needsReview) {
    return true;
  }

  return !isHighConfidencePublishableCategorization(categorization);
}

export function resolveImportProductName(
  row: Pick<AnalyzedImportRow, "name" | "shopCode">,
  existingProduct?: Pick<ExistingProductSnapshot, "name"> | null
) {
  return row.name?.trim() || existingProduct?.name?.trim() || row.shopCode || "bez-nazvaniya";
}

function isHighConfidencePublishableCategorization(categorization: CategorizationResult) {
  return Boolean(
    categorization.target?.categoryId &&
      categorization.target.subcategoryId &&
      categorization.confidence >= AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD
  );
}

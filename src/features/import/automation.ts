import {
  AUTO_CATEGORIZATION_CONFIDENCE_THRESHOLD,
  type CategorizationResult
} from "@/features/categorization/types";
import type { AnalyzedImportRow, ExistingProductSnapshot } from "./types";

export function isDoNotPublishCategorization(categorization: CategorizationResult) {
  return categorization.decisionStatus === "DO_NOT_PUBLISH";
}

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

  if (isDoNotPublishCategorization(categorization)) {
    return true;
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

export function resolveDraftProductStatus(
  row: Pick<AnalyzedImportRow, "status">,
  categorization: CategorizationResult
) {
  if (isDoNotPublishCategorization(categorization)) {
    return "invalid" as const;
  }

  return needsProductReview(row, categorization)
    ? ("needs_review" as const)
    : ("active" as const);
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

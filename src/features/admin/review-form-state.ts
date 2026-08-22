import type { AdminReviewItem, IdentityReviewDecision } from "./review";

export type IsolatedReviewFormState = {
  reviewId: string;
  categoryId: string;
  subcategoryId: string;
  learnRule: boolean;
  identityDecision: IdentityReviewDecision | null;
};

export function createIsolatedReviewFormState(
  item: Pick<
    AdminReviewItem,
    "reviewId" | "suggestedCategoryId" | "suggestedSubcategoryId" | "currentCategoryId" | "currentSubcategoryId"
  >
): IsolatedReviewFormState {
  return {
    reviewId: item.reviewId,
    categoryId: item.suggestedCategoryId ?? item.currentCategoryId ?? "",
    subcategoryId: item.suggestedSubcategoryId ?? item.currentSubcategoryId ?? "",
    learnRule: false,
    identityDecision: null
  };
}

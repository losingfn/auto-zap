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

/**
 * Server actions can finish after a reviewer has moved on to another card.
 * Only the response for the card that is still visible may replace its data.
 */
export function shouldApplyReviewActionResponse(activeReviewId: string | null, actionReviewId: string) {
  return activeReviewId === actionReviewId;
}

/**
 * "Skip" is deliberately local to the open review session: it only prevents
 * the same card from being returned immediately and never creates a workspace
 * exclusion. Keep the list bounded because it is sent with inline actions.
 */
export function appendTemporarilySkippedReviewId(
  reviewIds: readonly string[],
  reviewId: string,
  maximum = 100
) {
  return [...reviewIds, reviewId].slice(-maximum);
}

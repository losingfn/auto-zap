import type {
  AdminReviewPrimaryData,
  AdminReviewSimilarGroup
} from "./review";

export type PrefetchedReviewAdvance =
  | {
      kind: "prefetched";
      data: AdminReviewPrimaryData;
      reviewId: string;
    }
  | { kind: "exhausted" };

/**
 * Keep the review card transition instant. Similar candidates are deliberately
 * cleared until the lightweight request for the newly active review id returns.
 */
export function advanceToPrefetchedReviewItem(data: AdminReviewPrimaryData): PrefetchedReviewAdvance {
  const item = data.prefetchedItems[0];
  if (!item) return { kind: "exhausted" };

  return {
    kind: "prefetched",
    reviewId: item.reviewId,
    data: {
      ...data,
      item,
      prefetchedItems: data.prefetchedItems.slice(1),
      similarGroup: null
    }
  };
}

/**
 * A response is useful only while it belongs to the card currently displayed.
 */
export function applySimilarGroupToCurrentReviewItem(
  data: AdminReviewPrimaryData,
  reviewId: string,
  similarGroup: AdminReviewSimilarGroup | null
) {
  return data.item?.reviewId === reviewId
    ? { ...data, similarGroup }
    : data;
}

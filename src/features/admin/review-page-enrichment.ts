export type ReviewClassificationInput = {
  reviewId: string;
  shopCode: string;
  name: string;
  rawName: string;
};

export type PageRowsReuseMetrics = {
  pageRowsReused: number;
  pageRowsClassified: number;
  pageRowsCacheMiss: number;
};

export function reuseEnrichedPageRows<
  Row extends ReviewClassificationInput,
  EnrichedRow extends Row
>(
  pageRows: readonly Row[],
  enrichedByReviewId: ReadonlyMap<string, EnrichedRow>,
  enrichRow: (row: Row) => EnrichedRow,
  metrics?: PageRowsReuseMetrics
): EnrichedRow[] {
  return pageRows.map((row) => {
    const enriched = enrichedByReviewId.get(row.reviewId);
    if (enriched && hasSameClassificationInput(enriched, row)) {
      if (metrics) {
        metrics.pageRowsReused += 1;
      }

      return { ...enriched, ...row };
    }

    if (metrics) {
      metrics.pageRowsClassified += 1;
      metrics.pageRowsCacheMiss += 1;
    }

    return enrichRow(row);
  });
}

function hasSameClassificationInput(
  left: ReviewClassificationInput,
  right: ReviewClassificationInput
) {
  return (
    left.shopCode === right.shopCode &&
    left.name === right.name &&
    left.rawName === right.rawName
  );
}

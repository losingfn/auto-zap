# Draft PR

## Why

The old production review session still showed 3297 items because PR #17 changed categorization code but did not mutate stored review proposals. Deploying code and migration `0006` correctly avoided re-importing, publishing, or changing active catalog data.

## What Changed

- Added versioned review recalculation snapshots.
- Added `/admin/review` preview, explicit confirmation, recalculation button, result summary, filters, and rollback.
- Recalculation updates only `review_queue` suggestions/reasons.
- Added hidden `other-products` and DO_NOT_PUBLISH regression coverage.
- Fixed root page social metadata with absolute OG image and Twitter card.
- Added neutral noindex metadata for `/admin/*`.
- Added social preview checker and documentation/runbooks.

## Safety

- No active catalog mutation during recalculation.
- No import batch creation.
- No product duplication.
- No publication.
- No Meilisearch sync.
- Double concurrent recalculation is blocked.
- Previous suggestions are stored for rollback/comparison.

## Tests

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm categorization:check
pnpm social:preview:check
```

## Risks

Production counts can differ from offline replay because they use current production data and rules. If individual review count barely decreases, the UI shows diagnostics and keeps the existing queue safe for manual review.

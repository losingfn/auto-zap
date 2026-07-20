# Final Review Recalculation And Social Preview

## Status

Implemented a production-safe review recalculation workflow for the current open admin review workspace and a root-page social preview metadata fix.

## Why 3297 Stayed In Review

PR #17 changed categorization rules and hidden `other-products` handling, but the existing production review queue is stored data. Deploying code and migration `0006` does not mutate old review proposals, does not re-run an import, and does not publish a catalog version. The new button recalculates those stored proposals explicitly.

## Review Recalculation

- Adds versioned snapshot tables: `review_recalculations` and `review_recalculation_items`.
- Adds a guarded POST action from `/admin/review`.
- Requires typing `ПЕРЕСЧИТАТЬ`.
- Blocks double concurrent runs with a partial unique index on running recalculations.
- Stores before/after summaries and per-row old/new suggestions for rollback.
- Updates only `review_queue.suggested_*` and `review_queue.reason`.

## Safety

The operation does not create products, import batches, catalog versions, publication records, or Meilisearch tasks. Active product rows, prices, categories, search index, and public catalog remain unchanged until the separate safe publish action is used.

## Social Preview

The root page now has explicit page-level metadata with absolute HTTPS `og:image`, image dimensions/type, canonical URL, and Twitter card. `/admin/*` has neutral noindex/nofollow metadata and clears inherited public OG images.

## Changed Files

See `draft-pr.md` for the PR-ready summary.

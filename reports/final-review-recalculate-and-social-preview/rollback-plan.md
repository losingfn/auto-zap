# Rollback Plan

## Recalculation Rollback

Use the `/admin/review` button `Откатить пересчёт`. It marks the latest completed recalculation as `rolled_back` and restores each row's previous `review_queue.suggested_category_id`, `suggested_subcategory_id`, and `reason`.

This rollback does not touch:

- active products;
- prices;
- catalog versions;
- import batches;
- Meilisearch.

## Code Rollback

Revert the merge commit and redeploy through the normal PM2/systemd flow. The new tables can remain in the database; they are additive and do not affect older code paths unless queried.

## Data Backup

Take a PostgreSQL backup before deployment. Do not remove review snapshot tables unless a separate maintenance task is approved.

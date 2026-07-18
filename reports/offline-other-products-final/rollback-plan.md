# Rollback plan

- Revert the application commit before running taxonomy sync again.
- If DB rollback is required, set `ves-assortiment/other-products` inactive or hidden and leave products non-active until reviewed.
- Do not delete imported rows; `DO_NOT_PUBLISH` rows are retained for admin correction.
- Rebuild the search index only after a confirmed active catalog version is selected.

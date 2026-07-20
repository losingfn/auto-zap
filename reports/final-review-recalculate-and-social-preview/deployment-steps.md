# Deployment Steps

1. Merge the draft PR into `main` after review.
2. Deploy code only after a fresh PostgreSQL backup.
3. Apply the new migration with `pnpm db:migrate`.
4. Reload the existing PM2/systemd service.
5. Verify `/`, `/catalog/ves-assortiment`, and `/admin/review`.
6. In `/admin/review`, inspect preview, type `ПЕРЕСЧИТАТЬ`, and run recalculation.
7. Review summary and filters before any confirmation or publish.
8. Publish only after manual review and a separate safe publish preview.

No production import, safe publish, Meilisearch sync, SSH action, PM2 reload, or deployment was run during development.

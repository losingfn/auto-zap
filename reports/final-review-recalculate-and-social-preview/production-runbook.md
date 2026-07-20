# Production Runbook

Run after the PR is merged to `main`.

```bash
ssh <production-host>
cd /var/www/autozap
pg_dump --format=custom --file="/var/backups/autozap/autozap-$(date +%F-%H%M).dump" <database-name>
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
sudo systemctl reload pm2-autozap.service
```

Health checks:

```bash
curl -I https://autozapchast-taldom.ru/
curl -I https://autozapchast-taldom.ru/catalog/ves-assortiment
curl -I https://autozapchast-taldom.ru/admin/review
```

Operator flow:

1. Open `/admin/review`.
2. Confirm preview shows current workspace id, counts, and safety badges.
3. Type `ПЕРЕСЧИТАТЬ`.
4. Click `Пересчитать предложения`.
5. Check AUTO_READY, GROUP_REVIEW, MANUAL_REVIEW, BLOCKED_CONFLICT, DO_NOT_PUBLISH, and `Прочие товары` counts.
6. Use filters to inspect `Прочие товары`, AUTO_READY, and GROUP_REVIEW.
7. Confirm groups/items manually as needed.
8. Use safe publish only after manual verification.
9. Run social preview verification.

Rollback:

```bash
cd /var/www/autozap
git log --oneline -n 5
git revert <merge-commit>
pnpm install --frozen-lockfile
pnpm build
sudo systemctl reload pm2-autozap.service
```

For recalculation-only rollback, use `/admin/review` -> `Откатить пересчёт`. This restores old review suggestions from `review_recalculation_items`; it does not change active products or search.

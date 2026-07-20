# Review Recalculation Check

Expected `/admin/review` behavior:

1. Preview shows workspace id, dates, pending review count, processing count, rules version, commit hash, and safety badges.
2. The button requires typing `ПЕРЕСЧИТАТЬ`.
3. Recalculation updates only review proposals.
4. Results show:
   - AUTO_READY;
   - GROUP_REVIEW;
   - GROUP_REVIEW group count;
   - MANUAL_REVIEW;
   - BLOCKED_CONFLICT;
   - DO_NOT_PUBLISH;
   - `Прочие товары`;
   - exact assignments;
   - processed total;
   - old/new individual review count;
   - approximate operator actions.
5. `Откатить пересчёт` restores previous proposals.
6. Publish remains a separate action.

Local checks:

```bash
pnpm test
pnpm categorization:check
pnpm typecheck
pnpm build
```

Production run must be started only by the owner from `/admin/review`.

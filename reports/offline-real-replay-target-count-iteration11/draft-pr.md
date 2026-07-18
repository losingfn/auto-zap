# Draft PR

## Title

Improve offline categorization replay and review grouping

## Summary

- Add guarded offline replay tooling for import categorization, including real existing-vs-new splitting, count-bounded replay, residual Pareto, GROUP_REVIEW group reports, precision samples, and active-label shadow evaluation.
- Tighten categorization domain rules with context-gated families and safer ambiguous hardware/fitting handling.
- Demote generic active-neighbor matches for bolts, nuts, washers, fittings, rings, clamps, studs, screws, hoses, plugs/caps, bushings, and pins from AUTO_READY to GROUP_REVIEW.
- Preserve production guards, deterministic status handling, GROUP_REVIEW `needsReview`, compressor/ressory safeguards, technical token handling, and search fixture behavior.

## Offline Metrics

Final full local replay:

- selected rows: 30,690
- existing active rows: 26,027
- new/unconfirmed rows: 4,663
- AUTO_READY: 508
- GROUP_REVIEW: 1,450
- MANUAL_REVIEW: 2,684
- BLOCKED_CONFLICT: 21
- INVALID_INPUT: 0
- fully manual: 2,705

Final count-bounded replay approximating 3,742 new products:

- selected rows: 25,004
- existing active rows: 21,262
- new/unconfirmed rows: 3,742
- AUTO_READY: 410
- GROUP_REVIEW: 1,188
- MANUAL_REVIEW: 2,127
- BLOCKED_CONFLICT: 17
- INVALID_INPUT: 0
- fully manual: 2,144

The requested 300-900 manual range was not reached. The residual audit shows a data/taxonomy limit: the largest residual families are either missing active analogs or split across many active catalog targets, especially `other`, bolts, fittings, nuts, washers, rings, caps/plugs, studs, clamps, and screws.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm search:fixture`
- Offline replay against local PostgreSQL only with `AUTOZAP_OFFLINE=1`

## Risks / Limitations

- The exact latest 25,567-row import snapshot was not available locally. Count-bounded replay reaches 3,742 new/unconfirmed products but only 21,262 existing active rows in the selected local data window.
- Active-label shadow precision is not human precision; existing active catalog labels include known historical inconsistencies, especially compressor/ressory examples.
- Some active-neighbor AUTO_READY rows still rely on strong local catalog neighbors and should be included in production preflight sampling before deployment.

# Draft PR: Finish Offline Import Categorization Residual Pass

## Problem

The import categorization pipeline left a large fully manual residual. The final pass needs to reduce only safe, context-backed cases and prove the remaining lower bound without reintroducing fasteners or unsafe public search exposure.

## Architecture

- Extends deterministic domain families with contextual `GROUP_REVIEW` decisions.
- Keeps broad fasteners and ambiguous connector/cap/ring families out of AUTO_READY.
- Adds reproducible replay artifacts for residual decomposition, taxonomy-limit proof, AUTO_READY audit, GROUP_REVIEW audit and operator workload.

## Metrics

| Metric | Baseline | Final | Delta |
| --- | ---: | ---: | ---: |
| AUTO_READY | 410 | 425 | 15 |
| GROUP_REVIEW products | 1188 | 1504 | 316 |
| GROUP_REVIEW groups | 379 | 466 | 87 |
| Fully manual | 2144 | 1813 | -331 |

## Residual Analysis

- Generic fasteners without destination: 428, reason=name_lacks_destination_context, irreducible=428. Examples: ЗЧМ-00588 Болт крышки в/очистителя 2141; К-00001 Гайка м 8 сапуна ВАЗ 01-07
- Unique low-frequency items: 187, reason=unique_singleton_or_no_active_analogs, irreducible=187. Examples: А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха
- Short/code-only names: 175, reason=technical_insufficient_data, irreducible=175. Examples: А-00703 Такси; А-00775 А-00775
- Ambiguous fittings and connectors: 155, reason=active_analogs_conflict_or_no_destination, irreducible=155. Examples: А-01725 Переходник с 220V на USB; Г-00029 Тройник КАМАЗ Евро
- Engine/transmission parts with partial context: 109, reason=potentially_automatable_future_context_rules, irreducible=109. Examples: ЗЧМ-00186 Крышка поддона Москвич; ЗЧМ-00212 Поддон картера 2140
- DIN/socket-head fasteners without public target: 86, reason=no_allowed_target_current_taxonomy, irreducible=86. Examples: К-00284 Гровер М-8; КГ-00431 DIN912 M10*11 с внутренним шестигранником
- Body/interior fragments without stable target: 64, reason=active_analogs_conflict_or_no_destination, irreducible=64. Examples: А-00369 Люк; А-00726 Бокс 2101-07 Люкс
- Mounting/installation kits without destination target: 45, reason=name_lacks_destination_context, irreducible=45. Examples: А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; К-00664 Набор крепл. продольн. верх. штанги стаб.-
- Small body/interior parts with weak context: 36, reason=active_analogs_conflict_or_no_destination, irreducible=36. Examples: А-00370 Скоба д.16; А-01774 Скоба троса 12 мм
- Body locks/handles/glass mechanisms with partial context: 34, reason=active_analogs_conflict_or_no_destination, irreducible=34. Examples: А-02202 Ручки 2106 перед. н/о, 2 шт; ИН-00421 Стекло
- Hoses and tubes without system: 31, reason=name_lacks_destination_context, irreducible=31. Examples: Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190
- Rings and seals without destination: 29, reason=active_analogs_conflict_or_no_destination, irreducible=29. Examples: ЗЧМ-00629 Кольцо гильз Москвич 1.7 (к-т 4 шт); ИН-00288 29752F [N90765301] кольцо уплотнит. сист

## Taxonomy Limit

Remaining residual is dominated by families with no allowed public target, missing destination context, conflicting active analogs, absent active analogs, and short/code-only names. See `taxonomy-limit.csv` and `manual-audit.md`.

## Search Fix

Technical-token search behavior for T10/W5W/H7/DOT4/5W-30 is preserved by tests and search fixture. Review/unconfirmed products remain excluded from public search fixture output.

## Tests

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- count-bounded offline replay
- search fixture

## Risks

- Active-label shadow precision is proxy quality, not human precision.
- Local data is a count-bounded approximation because the exact 25,567-row import snapshot is not present.
- Generic fasteners and universal fittings still need a product taxonomy decision.

## Deployment Plan

Run replay in staging/local against the exact import snapshot, review CSV samples, then enable the pipeline without changing production DB or Meilisearch directly.

## Rollback Plan

Revert the categorization commit and keep new products in manual review. Public search remains protected because only active confirmed products are indexed.

## Checklist

- [ ] Review AUTO_READY sample.
- [ ] Review largest GROUP_REVIEW groups.
- [ ] Confirm taxonomy-limit lower bound.
- [ ] Run production preflight in a safe environment.
- [ ] Do not push or create PR until owner approval.

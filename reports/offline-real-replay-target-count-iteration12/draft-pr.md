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

- Unique low-frequency items: 606, reason=unique_singleton_or_no_active_analogs, irreducible=606. Examples: А-00004 Вентилятор ALCO; А-00526 Обезьяна на присоске
- Generic fasteners without destination: 432, reason=name_lacks_destination_context, irreducible=432. Examples: ЗЧМ-00588 Болт крышки в/очистителя 2141; К-00001 Гайка м 8 сапуна ВАЗ 01-07
- Short/code-only names: 336, reason=technical_insufficient_data, irreducible=336. Examples: А-00369 Люк; А-00370 Скоба д.16
- Ambiguous fittings and connectors: 137, reason=active_analogs_conflict_or_no_destination, irreducible=137. Examples: А-01725 Переходник с 220V на USB; Г-00029 Тройник КАМАЗ Евро
- DIN/socket-head fasteners without public target: 77, reason=no_allowed_target_current_taxonomy, irreducible=77. Examples: КГ-00431 DIN912 M10*11 с внутренним шестигранником; К-00004 Гайка. М 6 самоконтрящая ВАЗ
- Small body/interior parts with weak context: 60, reason=active_analogs_conflict_or_no_destination, irreducible=60. Examples: А-00726 Бокс 2101-07 Люкс; А-01211 Накладка на воздухозаборник 2110 (краш.)
- Rings and seals without destination: 39, reason=active_analogs_conflict_or_no_destination, irreducible=39. Examples: ЗЧМ-00629 Кольцо гильз Москвич 1.7 (к-т 4 шт); ИН-00288 29752F [N90765301] кольцо уплотнит. сист
- Engine small parts with partial context: 36, reason=potentially_automatable_future_context_rules, irreducible=36. Examples: ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105
- Hoses and tubes without system: 33, reason=name_lacks_destination_context, irreducible=33. Examples: Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190
- Caps, covers and plugs without destination: 31, reason=name_lacks_destination_context, irreducible=31. Examples: ЗЧМ-00186 Крышка поддона Москвич; К-00422 Заглушка воздуховода 2110
- Personal/non-catalog accessories: 18, reason=no_allowed_target_current_taxonomy, irreducible=18. Examples: А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая
- Electrical/consumer devices without auto context: 8, reason=technical_insufficient_data, irreducible=8. Examples: А-00176 Адаптер "Samsung" USB (оригинал); А-00543 "КОТО" Разветвитель двойной 201

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

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
| AUTO_READY | 410 | 1310 | 900 |
| GROUP_REVIEW products | 1188 | 1273 | 85 |
| GROUP_REVIEW groups | 379 | 393 | 14 |
| Fully manual | 2144 | 1159 | -985 |

## Residual Analysis

- Unique low-frequency items: 185, reason=unique_singleton_or_no_active_analogs, irreducible=185. Examples: А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха
- Short/code-only names: 175, reason=technical_insufficient_data, irreducible=175. Examples: А-00703 Такси; А-00775 А-00775
- Engine/transmission parts with partial context: 71, reason=potentially_automatable_future_context_rules, irreducible=71. Examples: ЗЧМ-00186 Крышка поддона Москвич; ЗЧМ-00212 Поддон картера 2140
- Body/interior fragments without stable target: 62, reason=active_analogs_conflict_or_no_destination, irreducible=62. Examples: А-00369 Люк; А-00726 Бокс 2101-07 Люкс
- Generic fasteners without destination: 60, reason=name_lacks_destination_context, irreducible=60. Examples: КГ-00601 Шпилька приемной трубы ЗИЛ-130; ЗЧМ-00376 Хомуты приемной трубы 2141
- Ambiguous fittings and connectors: 52, reason=active_analogs_conflict_or_no_destination, irreducible=52. Examples: КГ-01086 Соединитель шлангов Г-образный метал. д.1; ИН-00171 Штуцер прокачки М6*1*29 (AUDI,BMW,SAABVW)
- DIN/socket-head fasteners without public target: 48, reason=no_allowed_target_current_taxonomy, irreducible=48. Examples: К-00284 Гровер М-8; КГ-00431 DIN912 M10*11 с внутренним шестигранником
- Small body/interior parts with weak context: 37, reason=active_analogs_conflict_or_no_destination, irreducible=37. Examples: К-00611 Набор пистонов ВАЗ-Калина 1118; КГ-00739 Скоба троса газа 402 дв.
- Hoses and tubes without system: 31, reason=name_lacks_destination_context, irreducible=31. Examples: Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190
- Body locks/handles/glass mechanisms with partial context: 29, reason=active_analogs_conflict_or_no_destination, irreducible=29. Examples: А-02202 Ручки 2106 перед. н/о, 2 шт; ИН-00421 Стекло
- Personal/non-catalog accessories: 26, reason=no_allowed_target_current_taxonomy, irreducible=26. Examples: А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая
- Driver electronics and diagnostics without stable target: 25, reason=active_analogs_conflict_or_no_destination, irreducible=25. Examples: А-01058 Рация "АЛАН-100"; А-01099 Рация "Мега-Джет" 300,100

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

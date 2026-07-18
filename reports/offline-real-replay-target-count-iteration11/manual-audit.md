# Offline Categorization Audit, Iteration 11

Date: 2026-07-18

## Scope

This audit uses only the local/offline workspace. No production database, Meilisearch, Nginx, PM2, SSL, backup, cron, or production import action was used.

The exact requested latest import snapshot was not available locally. The local database contains an active catalog version `c55e517a-e505-47dc-848b-89e6d923915e` from `catalog.xlsx` with 30,690 parsed rows, 26,027 active products, and 4,663 active review products. The closest available import file is `data/imports/uploads/1782302118029-de725b0722e1-catalog.xlsx`.

Two final offline replays were measured:

| Scenario | Selected rows | Existing active | New/unconfirmed | AUTO_READY | GROUP_REVIEW | MANUAL_REVIEW | BLOCKED_CONFLICT | INVALID_INPUT | Fully manual | Groups | Max group | Operator decisions after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full local snapshot | 30,690 | 26,027 | 4,663 | 508 | 1,450 | 2,684 | 21 | 0 | 2,705 | 432 | 26 | 3,137 |
| Count-bounded approximation | 25,004 | 21,262 | 3,742 | 410 | 1,188 | 2,127 | 17 | 0 | 2,144 | 379 | 26 | 2,523 |

The count-bounded run uses `--import-limit=25567 --target-existing=21811 --target-new=3742`. It reaches 3,742 new/unconfirmed products, but only 21,262 existing active rows are present inside the selected local data window, so it is an approximation, not the missing exact 25,567-row import.

## Iteration History

| Run | Scenario | New/unconfirmed | AUTO_READY | GROUP_REVIEW | MANUAL_REVIEW | BLOCKED | Fully manual | Groups | Max group | Operator decisions after |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| local baseline | full local | 4,663 | 375 | 1,151 | 3,129 | 8 | 3,137 | 163 | 69 | 3,300 |
| after taxonomy sync | full local | 4,663 | 512 | 1,203 | 2,940 | 8 | 2,948 | 167 | 69 | 3,115 |
| iteration 6 | full local | 4,663 | 603 | 1,236 | 2,805 | 19 | 2,824 | 281 | 28 | 3,105 |
| iteration 8 | full local | 4,663 | 602 | 1,359 | 2,682 | 20 | 2,702 | 402 | 26 | 3,104 |
| iteration 11 | full local | 4,663 | 508 | 1,450 | 2,684 | 21 | 2,705 | 432 | 26 | 3,137 |
| target iteration 6 | count-bounded | 3,742 | 503 | 973 | 2,251 | 15 | 2,266 | 245 | 27 | 2,511 |
| target iteration 8 | count-bounded | 3,742 | 502 | 1,095 | 2,129 | 16 | 2,145 | 352 | 25 | 2,497 |
| target iteration 9 | count-bounded | 3,742 | 502 | 1,096 | 2,127 | 17 | 2,144 | 352 | 25 | 2,496 |
| target iteration 11 | count-bounded | 3,742 | 410 | 1,188 | 2,127 | 17 | 2,144 | 379 | 26 | 2,523 |

The final two iterations intentionally moved risky active-neighbor matches for generic hardware/fittings from AUTO_READY to GROUP_REVIEW. That made AUTO_READY smaller, but the queue safer.

## Residual Limit

The target 300-900 fully manual range was not reached. On the count-bounded approximation, fully manual residual is 2,144, so reaching 900 would require safely classifying at least 1,244 more products.

The residual Pareto shows that this cannot be done safely with the available local data without creating new categories, reviving a broad "Крепёж" bucket, or mapping products into doubtful categories:

| Residual family | Count | Active analogs | Active catalog target distribution |
| --- | ---: | ---: | --- |
| other | 1,097 | 0 | No active analog family signal. Examples include adapters, novelty accessories, loose body/interior pieces, generic brackets. |
| bolts | 312 | 407 | Split across wheels/disks 71, engine parts 68, transmission parts 30, springs 21, body parts 15, KPP 14, generators 13, brakes 12. |
| fittings / штуцеры / переходники | 237 | 272 | Split across brakes 107, tools 32, KPP 21, oil filters 19, body 16, cooling 12, accessories 10, engine 9. |
| nuts | 89 | 111 | Split across wheels 20, hubs 20, steering tie rods 19, transmission 10, springs 7, clutch 4, bearings 4. |
| washers | 76 | 110 | Split across hubs 18, engine 16, KPP 15, oils 9, suspension 8, arms 6, transmission 5, springs 5. |
| rings | 49 | 229 | Split across engine 100, transmission 29, KPP 21, hubs 13, pumps 7, bearings 6, brake cylinders 6, cooling 5. |
| caps/plugs | 42 | 403 | Split across engine 88, cooling 37, locks/handles 33, tools 23, KPP 23, body 22, oils 19, accessories 14. |
| studs | 40 | 64 | Split across wheels 17, engine 15, KPP 8, fuel 6, hubs 5. |
| clamps | 34 | 106 | Split across exhaust 34, springs 20, transmission 15, tools 7, body 7, cooling 4. |
| screws | 34 | 4 | Too few analogs and split across tools/body/bumpers/mudguards. |

These top residual buckets alone account for 2,010 products. Several have active analogs, but the analogs are distributed across multiple target categories, so they do not provide a safe dominant category. The residual is therefore a data/taxonomy limit for the current local snapshot, not an implementation stop after `no_candidate`.

## Group Quality

GROUP_REVIEW is not used as a hidden manual bucket. Final count-bounded groups are small: 379 groups, median size 2, maximum size 26, zero groups over 100, zero groups over 300. All largest groups have homogeneity 1.0 in the generated report.

Largest checked groups:

| Group | Size | Target | Examples | Audit |
| --- | ---: | --- | --- | --- |
| active neighbor, clamps | 26 | `dvigatel-i-transmissiya/vyhlopnaya-sistema` | `Хомут 54,5мм`, `Хомут силовой 68-73 мм`, `Хомут гл. Bosal` | Narrow exhaust-clamp group; requires group confirmation because generic clamps were demoted from AUTO_READY. |
| wiper | 25 | `aksessuary/prochie-aksessuary` | `Мотор стеклоочистителя`, `Лента стеклоочистителя`, `Щётки стеклоочист.` | Homogeneous wiper/washer-accessory family in the current taxonomy. |
| exhaust gofra | 24 | `dvigatel-i-transmissiya/vyhlopnaya-sistema` | `Гофра ф22`, `Гофра ремонтная`, `Гофра 60*150` | Homogeneous exhaust flex-pipe group. |
| active neighbor, fittings | 21 | `tormoznaya-sistema/prochaya-tormoznaya-sistema` | `Быстросъем для пневм. трубок`, `Фитинг латунь ЕВРО`, `Соединитель трубок ПВХ` | Narrow fitting group, but still GROUP_REVIEW because fittings are generic and active catalog targets are mixed. |
| electrical computers | 19 | `elektrika/prochaya-elektrika` | `Компьютер Штат`, `Борт. компьютер Мультитроник` | Homogeneous electronics group. |
| tint/protection film | 18 | `aksessuary/prochie-aksessuary` | `Пленка тонирующая`, `Плёнка MTF`, `Маскировочная пленка` | Homogeneous accessory film group under current taxonomy. |
| washer reservoirs | 17 | `kuzov-i-optika/kuzovnye-detali` | `Бачок омывателя 2101`, `Бачок омывателя 2108` | Homogeneous washer reservoir group. |
| wheel caps | 17 | `aksessuary/shiny-i-diski` | `Колпаки хромированные`, `Колпаки Рено`, `Колпаки МИГ` | Homogeneous wheel cap group. |

Risk-flagged groups remain in GROUP_REVIEW and should not be auto-applied without review:

| Group | Size | Reason |
| --- | ---: | --- |
| `interior|other|накладка` | 15 | Near-threshold; contains `Накладка кулисы` as an outlier candidate. |
| `wheel_fasteners|nuts|гайка-колес` | 13 | Correctly narrow wheel-fastener family, but generic nuts stay operator-confirmed. |
| `car_fragrances|fragrances|дезодорант` | 12 | Narrow accessory family, but no strong active analog base. |
| `headlight|other|фары` | 10 | Near-threshold; examples include headlight covers/rings/fastener kits. |
| `body_glass|other|стекла` | 9 | Near-threshold; examples include glass, films, heating, locks, trim. |

## Precision Check

No human precision percentage is claimed. The script generated `precision-sample.csv` for human review, and the summary includes only active-label shadow evaluation:

| Shadow evaluation | Evaluated | Correct vs active label | Precision |
| --- | ---: | ---: | ---: |
| AUTO_READY | 13,713 | 12,776 | 0.9317 |
| GROUP_REVIEW | 11,438 | 9,887 | 0.8644 |

This is not a human audit. It treats existing active catalog labels as reference data, and those labels include known historical inconsistencies. The top shadow errors are dominated by compressor items whose active labels point to `podveska/ressory`, which is exactly why compressor/ressory handling remains conservative.

Manual spot-check of representative samples:

| Sample | Status | Proposed target | Result |
| --- | --- | --- | --- |
| `Повторитель УАЗ`, `Поворотник Волга/2108/2141` | AUTO_READY | `kuzov-i-optika/povtoriteli` | Looks correct in current taxonomy. |
| `Эмблема LADA, VESTA, PRIORA` | AUTO_READY | `kuzov-i-optika/emblemy` | Looks correct. |
| `Щётки стеклоочистителя`, `Щетка с/о бескаркасная` | AUTO_READY | `aksessuary/prochie-aksessuary` | Looks correct under current public taxonomy. |
| `Штуцер прокачки М 7*1*20 LARGUS` | AUTO_READY | `tormoznaya-sistema/tormoznye-shtucery` | Looks correct because purpose is brake bleeding, not generic fitting. |
| `Хомут патрубка выпускн.` | AUTO_READY | `dvigatel-i-transmissiya/homuty-ohlazhdeniya` | Context is specific, but neighbor target differs; keep as a sample to verify with catalog owner before production use. |
| `Гайа колеса 12х1.5`, `Быстросъем для пневм. трубок`, `Шплинт 8х80` | GROUP_REVIEW after iteration 11 | wheel/fitting/spring targets by active neighbors | Correctly demoted from AUTO_READY because they are generic hardware/fitting terms. |
| `Накладка кулисы`, `Накладка потолка`, `Накладка люка б/бака` | GROUP_REVIEW | `kuzov-i-optika/elementy-salona` | Mixed enough to require operator confirmation; not AUTO_READY. |
| compressor-related active-label shadow errors | GROUP_REVIEW/AUTO_READY mix in shadow output | `aksessuary/kompressory` or engine targets | Existing active labels are inconsistent; do not use shadow precision as final human precision. |

Remaining limitation: some active-neighbor AUTO_READY rows with detected family `other` still rely on very strong local catalog neighbors and internal code context, for example `Комплект ручек салона`, `Трос управления отопления`, or `Расширительный бачок`. They were not in the generic fastener/fitting families, but they should remain part of production preflight sampling.

## Implementation Notes

- Added an offline replay tool with production guards, local DB guard, read-only transaction, real existing-vs-new split, count-bounded mode, residual Pareto, group CSVs, precision samples, and active-label shadow evaluation.
- Merged default categorization rules with local DB context when taxonomy targets exist, so local snapshots with partially synced rule tables still replay default rules deterministically.
- Added `contextAny` support to the categorization pipeline for safer context-gated families.
- Expanded and tightened domain families for safe AUTO_READY/GROUP_REVIEW behavior without creating new categories and without restoring a broad `Крепёж` category.
- Added active-neighbor demotion for ambiguous families: bolts, nuts, washers, screws, studs, fittings, rings, clamps, bushings, hoses, caps/plugs, and pins.
- Preserved deterministic pipeline behavior, safe statuses, `needsReview=true` for GROUP_REVIEW, compressor/ressory safeguards, technical token handling, `лампа t10` search behavior, production guards, and existing tests.

## Commands Used

```bash
DATABASE_URL=<local-postgres-url> AUTOZAP_OFFLINE=1 pnpm exec tsx scripts/replay-import-categorization.ts data/imports/uploads/1782302118029-de725b0722e1-catalog.xlsx --out=reports/offline-real-replay-iteration11
DATABASE_URL=<local-postgres-url> AUTOZAP_OFFLINE=1 pnpm exec tsx scripts/replay-import-categorization.ts data/imports/uploads/1782302118029-de725b0722e1-catalog.xlsx --out=reports/offline-real-replay-target-count-iteration11 --import-limit=25567 --target-existing=21811 --target-new=3742
```

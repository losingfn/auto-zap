# Final Offline Import Categorization Report

Generated: 2026-07-18T23:13:55.704Z
Input: catalog.xls / TDSheet
Pipeline: product-normalizer-v2+domain-dictionary-v2+domain-rules-v2+confidence-model-v2

## 1. Executive Summary

The 300-900 fully manual target was not reached in the local count-bounded replay.
Final fully manual residual: 1159.
AUTO_READY products: 1310. GROUP_REVIEW products: 1273 across 393 groups.
Hidden fallback target: ves-assortiment/other-products (Прочие товары). DO_NOT_PUBLISH rows: 248.
The remaining lower bound is supported by `taxonomy-limit.csv`; it is dominated by missing destination context, no allowed public target, conflicting active analogs, short/code-only names, and low-frequency items without analogs.

## 2. Current State

Mode: target-count-bounded-local-replay
Active version: c55e517a-e505-47dc-848b-89e6d923915e (catalog.xlsx)
Read-only offline command: true. Production used: false.
Local PostgreSQL was used only for read-only catalog context. The replay did not import, publish, update active catalog rows, write Meilisearch, restart PM2, touch Nginx, backup, cron, SSL, or production environment files.

| Metric | Value |
| --- | ---: |
| Import total rows | 30703 |
| Import parsed rows | 30690 |
| Existing active rows in replay | 21262 |
| New/unconfirmed rows in replay | 3742 |
| Local active-version review count | 4663 |

The local workspace does not contain the exact 25,567-row latest import described in the task. This replay uses the available local active catalog and import upload, and reports the mismatch explicitly.

## 3. What Was Implemented Before This Run

- Deterministic categorization statuses: AUTO_READY, GROUP_REVIEW, MANUAL_REVIEW, BLOCKED_CONFLICT, DO_NOT_PUBLISH and INVALID_INPUT.
- GROUP_REVIEW stays `needsReview=true` and is not publicly published automatically.
- Offline replay with production guards, read-only DB mode, existing/new split, count-bounded scenario, Pareto outputs, shadow precision samples and search-token fixes.
- Public search fixture excludes review/unconfirmed products and preserves technical-token behavior for T10/W5W/H7/DOT4/5W-30.

## 4. What Was Done In This Run

- Added hidden technical fallback `ves-assortiment/other-products` (`Прочие товары`) under `Весь ассортимент`, while keeping the visible aggregate `ves-assortiment/vse-tovary` (`Все товары`).
- Public catalog navigation, sitemap subcategory rows and category cards exclude the hidden target; public product/search presentation displays only `Прочие товары` and routes through the visible aggregate URL.
- Added `DO_NOT_PUBLISH` for insufficient data rows (empty names, code-only rows, generic-only names, size-only rows, corrupted names and unknown product types); these rows stay out of active catalog, public counts and search documents.
- Added safe `other_products_fallback` families for universal fasteners, fittings/connectors/adapters and clamps/brackets when no exact automotive category is available.
- Added safe contextual GROUP_REVIEW families for recurring residual clusters, while keeping broad fasteners and ambiguous parts out of AUTO_READY.
- Extended residual analytics with `residual-reasons.csv`, `residual-families.csv`, `taxonomy-limit.csv`, `largest-groups.csv`, `auto-ready-audit.csv`, `group-review-audit.csv`, `manual-audit.md` and `draft-pr.md`.
- Split the previous broad residual into concrete report-only families: fasteners without destination, fittings/connectors, repair kits, engine/transmission partial context, body/interior fragments, wheel accessories, driver electronics, lighting/signal devices, novelty/non-catalog goods, code-only names and truly low-frequency items.
- Preserved safety boundaries: no new public categories, no recreated `Крепёж`, no LLM, no production writes, no push and no PR.

## 5. Baseline Iteration 11

Iteration 11 baseline: AUTO_READY=410, GROUP_REVIEW=1188, groups=379, MANUAL_REVIEW=2127, BLOCKED_CONFLICT=17, DO_NOT_PUBLISH=0, fully manual=2144.

## 6. Decomposition Other

Final unresolved low-frequency bucket: 185.
The previous broad residual is now reported as concrete families below; the remaining low-frequency bucket contains rows without a repeatable safe pattern after the listed classes are removed.

| Family | Count | Reason | Useful context | Active analogs | Top tokens | Examples |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Unique low-frequency items | 185 | unique_singleton_or_no_active_analogs | 19 | 0 | дв-:28; ин-:14; ваз:8; нива:7; к-т:6 | А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха; А-02368 Накидки Фронт "ICEBERG FRONT"черный/черный/красный 26190 |
| Short/code-only names | 175 | technical_insufficient_data | 0 | 0 | зчм-:37; ок-:29; ин-:6; кг-:6; ркп-:6 | А-00703 Такси; А-00775 А-00775; А-01370 А-01370 |
| Engine/transmission parts with partial context | 71 | potentially_automatable_future_context_rules | 27 | 1607 | зчм-:26; дв-:23; коробки:16; москвич:12; ваз:10 | ЗЧМ-00186 Крышка поддона Москвич; ЗЧМ-00212 Поддон картера 2140; ЗЧМ-00263 Набор иголок коробки Москвич |
| Body/interior fragments without stable target | 62 | active_analogs_conflict_or_no_destination | 12 | 326 | кр-:18; сиденья:10; бардачка:7; бокс:7; ваз:5 | А-00369 Люк; А-00726 Бокс 2101-07 Люкс; А-00896 Опора полки 2108 (2 шт) |
| Generic fasteners without destination | 60 | name_lacks_destination_context | 23 | 806 | саморезы:16; саморез:14; приемной:11; трубы:11; хомут:11 | КГ-00601 Шпилька приемной трубы ЗИЛ-130; ЗЧМ-00376 Хомуты приемной трубы 2141; ЗЧМ-00507 Хомут приёмной трубы (Святогор) |
| Ambiguous fittings and connectors | 52 | active_analogs_conflict_or_no_destination | 41 | 322 | кг-:44; соединитель:37; шлангов:37; метал.:17; прямой:13 | КГ-01086 Соединитель шлангов Г-образный метал. д.1; ИН-00171 Штуцер прокачки М6*1*29 (AUDI,BMW,SAABVW); ИН-00172 Штуцер прокачки М6*1*38 (AUDI,SUBARU,VW) |
| DIN/socket-head fasteners without public target | 48 | no_allowed_target_current_taxonomy | 0 | 39 | кг-:46; внутренним:39; шестигранником:39; din:39; m12*:12 | К-00284 Гровер М-8; КГ-00431 DIN912 M10*11 с внутренним шестигранником; К-00565 Гровер 5 |
| Small body/interior parts with weak context | 37 | active_analogs_conflict_or_no_destination | 11 | 761 | кг-:14; кронштейн:13; приемной:10; скоба:10; трубы:10 | К-00611 Набор пистонов ВАЗ-Калина 1118; КГ-00739 Скоба троса газа 402 дв.; ИН-00935 Планка распорная Логан 7701208112 |
| Hoses and tubes without system | 31 | name_lacks_destination_context | 31 | 1247 | дв-:15; трубка:10; трубки:9; к-т:6; кондиционера:6 | Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141 |
| Body locks/handles/glass mechanisms with partial context | 29 | active_analogs_conflict_or_no_destination | 7 | 1073 | кр-:12; ручки:8; стекло:5; б/бака:3; ваз:3 | А-02202 Ручки 2106 перед. н/о, 2 шт; ИН-00421 Стекло; О-00696 ВАЗ 2111 стекло з.д.о прав. |
| Personal/non-catalog accessories | 26 | no_allowed_target_current_taxonomy | 0 | 14 | перчатки:7; брелок:5; собака:4; зимние:2; кошелек:2 | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая) |
| Driver electronics and diagnostics without stable target | 25 | active_analogs_conflict_or_no_destination | 0 | 53 | рация:7; модулятор:4; сканер:3; алан-:2; блок:2 | А-01058 Рация "АЛАН-100"; А-01099 Рация "Мега-Джет" 300,100; А-01159 Рация "Алан-48 плюс" |
| Repair kits without destination system | 23 | name_lacks_destination_context | 6 | 458 | к-т:9; рг-:8; ремкомплект:8; кр-:7; рем.к-т:6 | ИН-01115 07003С Рем. к-т направл.; КР-00571 К-т фланцев ремонтный в сб. D45 СВД; РГ-00008 Рем.к-т подъёмника ЗИЛ 5-ти шток., силико |
| Engine small parts with partial context | 22 | potentially_automatable_future_context_rules | 10 | 620 | дв-:8; кг-:8; палец:7; втулка:5; клапан:5 | ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105; КГ-00746 Палец толкателя ГЦС |
| Wheel/tire accessories with partial context | 22 | active_analogs_conflict_or_no_destination | 15 | 408 | колес:13; дисков:5; колпачки:5; колпачок:3; зчм-:2 | А-01623 Мешки для колес 4 шт; А-02071 Колпачок для дисков VESTA, 1 шт; А-02083 Колпачки дисков VESTA 17 крашеные, 4 шт |
| Chassis mounts/supports with partial context | 20 | potentially_automatable_future_context_rules | 0 | 403 | стоек:8; кр-:6; накладки:4; подушка:4; зчм-:3 | А-02317 Упор (башмак) противооткатный AVS SM-01; ЗЧМ-00473 Чашки стоек; ЗЧМ-00495 Рем. комплект зад. балки 2141 |
| Mounting/installation kits without destination target | 20 | name_lacks_destination_context | 3 | 347 | кг-:9; шплинты:4; газ:3; к-т:3; крепл.:3 | А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; К-00664 Набор крепл. продольн. верх. штанги стаб.-; К-00665 Набор крепл. продол. ниж. штанги стаб.-ра |
| Suspension/steering parts with partial context | 19 | potentially_automatable_future_context_rules | 1 | 998 | отбойник:7; зчм-:5; тяга:5; москвич:4; кр-:3 | А-01206 Отбойник УАЗ-Патриот СА-пласт.; ЗЧМ-00151 Маятник Москвич 2140; ИН-00812 Отбойник NSHBB10RR |
| Exterior/decor body items with partial context | 18 | potentially_automatable_future_context_rules | 0 | 487 | бака:7; бак:5; дв-:4; крыла:3; накладки:3 | ДВ-00452 Бак 21073 инжектор; ДВ-00453 Бак 2104 инжектор; ЗЧМ-00496 Пыльник бака 2141 |
| Caps, covers and plugs without destination | 18 | name_lacks_destination_context | 2 | 403 | заглушка:12; веста:4; кг-:2; пробка:2; ремня:2 | К-00457 Заглушка под мовиль (пластмасса); А-01561 Заглушка-удлинитель ремня; А-02301 Заглушка-переходник ремня (с логотипом) 1 шт |
| Vehicle-model-only or legacy part without function | 17 | name_lacks_destination_context | 3 | 5154 | зчм-:10; москвич:10; газель:2; камаз:2; ок-:2 | ЗЧМ-00338 Вакуум Москвич 412; ЗЧМ-00440 Жаровня Москвич; ОК-00115 Подставка ОКА длинная |
| Fans and thermal/ventilation parts without stable target | 16 | active_analogs_conflict_or_no_destination | 0 | 147 | вентилятор:10; воздуховод:3; дв-:2; comfort:2; автомобил.:1 | А-00004 Вентилятор ALCO; А-00979 Вентилятор "Valgo"; А-01983 Подстаканник на воздуховод |
| Starter/ignition electrical parts with partial context | 15 | potentially_automatable_future_context_rules | 0 | 200 | зчм-:7; москвич:6; ин-:5; трамблера:4; бендикс:3 | ЗЧМ-00447 Бендикс Москвич 2141; ЗЧМ-00636 Втягивающее ЗАЗ; ОК-00151 Втягивающие ОКА |
| Travel/storage/covers without stable target | 15 | no_allowed_target_current_taxonomy | 0 | 95 | накидка:4; тент:4; сумка:3; кожа:2; перевозки:2 | А-00711 Покрытие пола (линолеум); А-01378 Сумка-холодильник (термо); А-01477 Сумка кожа |
| Driveline/axle/differential parts with partial context | 14 | potentially_automatable_future_context_rules | 0 | 278 | хсг-:6; ось:4; уаз:4; дифференциал:3; дифференциала:2 | ЗЧМ-00490 Комплект саттелитов 2140; ОК-00219 Подушка шарнира; Р-00015 Ось саттелитов в сборе ЗАЗ (к-т) |
| Lighting/signal devices without stable target | 14 | active_analogs_conflict_or_no_destination | 1 | 422 | сигнал:4; габаритов:2; ин-:2; кр.:2; маячок:2 | А-00573 Прожектор; А-01885 Сигнал "VOLVO"; О-00710 Габаритные огни диодные. 2 шт |
| Optics/glass parts with partial context | 14 | potentially_automatable_future_context_rules | 7 | 245 | фар:5; оптика:3; ваз:2; крепления:2; стекло:2 | О-00041 LED Рено ближ./дальн. свет; О-00547 Блок-фары прав./лев. 2110 (г. Тольятти); О-00676 Светомаскировка для грузовых авто (кт 2шт) |
| Novelty/souvenir non-catalog goods | 12 | no_allowed_target_current_taxonomy | 0 | 12 | присоске:4; большой:2; вымпел:2; большая:1; говорящий:1 | А-00526 Обезьяна на присоске; А-00718 Мячик-дезодорант (1 шт); А-00894 Рысь (большая) |
| Cleaning/wiper accessories without stable target | 11 | active_analogs_conflict_or_no_destination | 6 | 247 | омывателя:6; бачка:5; щетка:5; кр-:4; зимняя:2 | А-00121 Щётка для сметания пыли; А-00175 Щётка с губкой; А-02061 AWM Щетка зимняя |
| Cabin comfort/universal accessories without stable target | 11 | active_analogs_conflict_or_no_destination | 0 | 211 | часы:6; завод:2; ковролин:2; шторки:2; батарейке:1 | А-01338 Часы большие (на батарейке); ЗЧМ-00094 Часы 2141; А-00141 Часы 2110 (тюнинг) |
| Consumer phone/power accessories | 11 | no_allowed_target_current_taxonomy | 0 | 43 | батарейки:3; банк:2; карта:2; памяти:2; пауэр:2 | А-02247 Батарейки "REXANT" (за 1 шт); А-02276 Зарядка для i-phone 323; А-00063 Алкалиновые батарейки (за 2 шт.)GP Super high Tech Alkaline 15А АА, 24А АА |
| Car-care consumables without stable target | 10 | active_analogs_conflict_or_no_destination | 1 | 178 | бумага:5; наждачная:5; антисептик:2; аэрозоль:2; вакс:2 | А-00616 Аппликатор "Доктор ВАКС"; А-02106 DW8677 Тонкая ткань для полировки кузова; А-00167 Наждачная бумага №220,240,280,400,600,800, |
| Tools and road equipment without stable target | 9 | active_analogs_conflict_or_no_destination | 2 | 754 | лопата:4; снега:4; кг-:2; струна:2; автодело:1 | А-01292 Нож дорожный; А-02377 Струна "Автодело" 40686, 2 шт; КГ-00287 Насадка на шланг подкачки |
| Miscellaneous universal non-catalog goods | 6 | no_allowed_target_current_taxonomy | 0 | 37 | аудиоколонка:1; грызунов:1; детей:1; магнитная:1; мелочей:1 | А-00548 Тюнинг Нива-Тайга; А-00946 Мышь музыкальная; А-01613 Тарелочка магнитная для мелочей |
| Electrical/consumer devices without auto context | 5 | technical_insufficient_data | 0 | 27 | разветвитель:2; тепловентилятор:2; автомобильный:1; газовая:1; двойной:1 | А-00543 "КОТО" Разветвитель двойной 201; А-01460 Тепловентилятор автомобильный AVS Comfort ТЕ-310 12В (2 реж.) 150W; А-01522 KOTO EFB-211 Тепловентилятор |
| Tube/line mounts without system | 5 | name_lacks_destination_context | 0 | 2 | гусек:5; длинный:2; короткий:2; волга:1; распылителя:1 | Г-00064 Гусёк 31029 короткий; Г-00065 Гусёк 2410 длинный; Г-00090 Гусек короткий Волга 3110 |
| Safety/reflective/emergency goods without stable target | 4 | no_allowed_target_current_taxonomy | 0 | 30 | лента:3; светоотражающая:3; браслеты:1; желтая:1; пешеходов:1 | А-01583 Браслеты для пешеходов светоотражающие; А-00834 Светоотражающая лента; А-01922 Лента светоотражающая 1 м |
| Audio/radio/media accessories without stable target | 3 | active_analogs_conflict_or_no_destination | 0 | 73 | флешка:2; банка:1; воспроизв.:1; радио+флешка:1; usb:1 | А-01332 "Банка" радио+флешка (воспроизв.); А-01650 Флешка 8 Гб; А-01687 USB флешка 32 Гб |
| Fluids/adhesives/chemicals without stable target | 2 | active_analogs_conflict_or_no_destination | 0 | 427 | армированная:2; клейкая:2; лента:2; avs:2; мм*25мм:1 | А-00612 Лента клейкая армированная AVS 48мм * 10мм; А-02264 Лента клейкая армированная AVS 48мм*25мм |
| Fragrance/air-freshener goods without stable target | 1 | active_analogs_conflict_or_no_destination | 0 | 0 | автопарфюм:1 | А-00723 Автопарфюм 7 мл |
| Fuel/air intake parts with partial context | 1 | potentially_automatable_future_context_rules | 0 | 198 | воздухоочистителя:1; планка:1 | К-00280 Планка воздухоочистителя 2101-07 |

## 7. New Contextual Families

- Seat belts, portable 12/24V work lights, car clocks, heater electrical/cooling parts, copper brake tubes and pneumatic-line fittings were added as narrow reviewable families.
- Fuel-system, engine-valve, suspension-hardware, tow-hardware, engine-mount, brake-tube, body/interior/decor, exhaust and car-audio/product-normalization signals were expanded only with contextual evidence and negative terms.
- Universal fasteners/fittings/clamps can fall back to hidden `Прочие товары`; exact automotive contexts still override that fallback.
- Generic DIN/socket-head fasteners, nuts, washers, rings, caps, hoses and ambiguous fittings remain review/manual or DO_NOT_PUBLISH when data is insufficient or destination context is unsafe.

## 8. Taxonomy-Limit Analysis

| Family | Residual | Contextual | No context | Active analogs | Top target | Purity | Confidence gap | Conflict share | Safe auto | Safe group | Irreducible | Limit reason |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Unique low-frequency items | 185 | 19 | 166 | 0 | none | 0 | 0 | 0 | 0 | 0 | 185 | Редкие единичные товары без активных аналогов и без повторяемого паттерна. |
| Short/code-only names | 175 | 0 | 175 | 0 | none | 0 | 0 | 0 | 0 | 0 | 175 | Название состоит из кода или слишком короткой фразы, классификационных признаков недостаточно. |
| Engine/transmission parts with partial context | 71 | 27 | 44 | 1607 | dvigatel-i-transmissiya/kpp | 0.3279 | 0.0877 | 0.6721 | 0 | 0 | 71 | Есть моторный или трансмиссионный намёк, но оставшиеся названия не дают устойчивого назначения без дополнительных правил и ручной проверки активных аналогов. |
| Body/interior fragments without stable target | 62 | 12 | 50 | 326 | kuzov-i-optika/kuzovnye-detali | 0.3252 | 0.2025 | 0.6748 | 0 | 0 | 62 | Кузовной/салонный контекст есть, но текущая таксономия и активные аналоги не дают единой подкатегории для всех вариантов. |
| Generic fasteners without destination | 60 | 23 | 37 | 806 | aksessuary/shiny-i-diski | 0.1303 | 0.0025 | 0.8697 | 0 | 0 | 60 | Есть только тип крепежа/размер, без узла автомобиля и без единого безопасного target. |
| Ambiguous fittings and connectors | 52 | 41 | 11 | 322 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.3416 | 0.1615 | 0.6584 | 0 | 0 | 52 | Похожие соединители в активном каталоге распределены по нескольким системам; без назначения нельзя выбрать подкатегорию. |
| DIN/socket-head fasteners without public target | 48 | 0 | 48 | 39 | aksessuary/instrumenty | 0.8718 | 0.8205 | 0.1282 | 0 | 0 | 48 | Крепёж как самостоятельная категория запрещён, а назначения узла в названии нет. |
| Small body/interior parts with weak context | 37 | 11 | 26 | 761 | kuzov-i-optika/kuzovnye-detali | 0.2326 | 0.1551 | 0.7674 | 0 | 0 | 37 | Малые кузовные/салонные элементы имеют похожие названия, но разные targets и часто недостаточный контекст. |
| Hoses and tubes without system | 31 | 31 | 0 | 1247 | dvigatel-i-transmissiya/detali-dvigatelya | 0.3368 | 0.1371 | 0.6632 | 0 | 0 | 31 | Шланги/трубки без тормозного, топливного, охлаждающего, ГУР или выхлопного контекста нельзя безопасно развести. |
| Body locks/handles/glass mechanisms with partial context | 29 | 7 | 22 | 1073 | kuzov-i-optika/kuzovnye-detali | 0.1892 | 0.014 | 0.8108 | 0 | 0 | 29 | Кузовной механизм есть, но текущие названия не всегда отделяют замки, ручки, стекло, лючки и декоративные элементы. |
| Personal/non-catalog accessories | 26 | 0 | 26 | 14 | aksessuary/instrumenty | 0.2857 | 0.1429 | 0.7143 | 0 | 0 | 26 | Позиции не имеют точного публичного target в текущей автомобильной таксономии. |
| Driver electronics and diagnostics without stable target | 25 | 0 | 25 | 53 | aksessuary/instrumenty | 0.4151 | 0.1698 | 0.5849 | 0 | 0 | 25 | Электроника и диагностические приборы в остатке пересекаются между приборами водителя, инструментами и прочей электрикой. |
| Repair kits without destination system | 23 | 6 | 17 | 458 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.1157 | 0.0087 | 0.8843 | 0 | 0 | 23 | Ремкомплект/ремонтный набор без узла ремонта не указывает безопасную публичную подкатегорию. |
| Engine small parts with partial context | 22 | 10 | 12 | 620 | dvigatel-i-transmissiya/detali-dvigatelya | 0.2823 | 0.1919 | 0.7177 | 0 | 0 | 22 | Часть моторного контекста есть, но оставшиеся позиции требуют дополнительного правила или проверки шума активного каталога. |
| Wheel/tire accessories with partial context | 22 | 15 | 7 | 408 | aksessuary/shiny-i-diski | 0.348 | 0.2402 | 0.652 | 0 | 0 | 22 | Колёсный контекст есть, но остаток смешивает декоративные колпачки, проставки, упаковку/чехлы и крепёж дисков. |
| Chassis mounts/supports with partial context | 20 | 0 | 20 | 403 | podveska/stoyki | 0.4069 | 0.2854 | 0.5931 | 0 | 0 | 20 | Контекст стойки/балки/подушки есть, но остаток смешивает подвеску, кузов, двигатель и универсальные упоры. |
| Mounting/installation kits without destination target | 20 | 3 | 17 | 347 | dvigatel-i-transmissiya/detali-dvigatelya | 0.1037 | 0.0029 | 0.8963 | 0 | 0 | 20 | Монтажный набор или фиксатор есть, но без устойчивого узла автомобиля нельзя выбрать категорию. |
| Suspension/steering parts with partial context | 19 | 1 | 18 | 998 | podveska/rulevye-nakonechniki | 0.4269 | 0.2766 | 0.5731 | 0 | 0 | 19 | Подвеска/рулевое направление видно, но конкретная подкатегория часто конфликтует между стойками, наконечниками, рычагами и прочими деталями. |
| Exterior/decor body items with partial context | 18 | 0 | 18 | 487 | kuzov-i-optika/kuzovnye-detali | 0.4066 | 0.2546 | 0.5934 | 0 | 0 | 18 | Позиции похожи на кузовной декор или наружные детали, но часть названий не отделяет декор от кузовных деталей. |
| Caps, covers and plugs without destination | 18 | 2 | 16 | 403 | dvigatel-i-transmissiya/detali-dvigatelya | 0.2184 | 0.1266 | 0.7816 | 0 | 0 | 18 | Крышки и заглушки требуют контекст узла: радиатор, поддон, фара, бардачок, КПП и т.п. |
| Vehicle-model-only or legacy part without function | 17 | 3 | 14 | 5154 | kuzov-i-optika/kuzovnye-detali | 0.103 | 0.0318 | 0.897 | 0 | 0 | 17 | Марка/модель автомобиля помогает совместимости, но без функции детали не выбирает публичную подкатегорию. |
| Fans and thermal/ventilation parts without stable target | 16 | 0 | 16 | 147 | dvigatel-i-transmissiya/detali-dvigatelya | 0.415 | 0.2313 | 0.585 | 0 | 0 | 16 | Вентиляторы и воздуховоды встречаются в охлаждении, отопителе, салоне и универсальных аксессуарах; без назначения target конфликтует. |
| Starter/ignition electrical parts with partial context | 15 | 0 | 15 | 200 | elektrika/prochaya-elektrika | 0.78 | 0.71 | 0.22 | 0 | 0 | 15 | Электрический узел виден, но в остатке смешаны стартер, зажигание, приборка и мелкие компоненты. |
| Travel/storage/covers without stable target | 15 | 0 | 15 | 95 | aksessuary/chehly | 0.4947 | 0.2842 | 0.5053 | 0 | 0 | 15 | Часть товаров является универсальными дорожными/бытовыми аксессуарами без точного target в автомобильной таксономии. |
| Driveline/axle/differential parts with partial context | 14 | 0 | 14 | 278 | dvigatel-i-transmissiya/detali-transmissii | 0.295 | 0.1259 | 0.705 | 0 | 0 | 14 | Трансмиссионный/мостовой контекст есть, но target расходится между КПП, трансмиссией, ступицами и подвеской. |
| Lighting/signal devices without stable target | 14 | 1 | 13 | 422 | kuzov-i-optika/fonari | 0.7725 | 0.6848 | 0.2275 | 0 | 0 | 14 | Световой или сигнальный прибор виден, но без подтверждения автомобильной установки и target-подкатегории перевод небезопасен. |
| Optics/glass parts with partial context | 14 | 7 | 7 | 245 | kuzov-i-optika/fary | 0.5061 | 0.3755 | 0.4939 | 0 | 0 | 14 | Оптика/стекло видны, но остаток смешивает фары, поворотники, крепёж, стекла и комплекты без единого safe target. |
| Novelty/souvenir non-catalog goods | 12 | 0 | 12 | 12 | elektrika/prochaya-elektrika | 0.9167 | 0.8333 | 0.0833 | 0 | 0 | 12 | Сувенирные/игрушечные позиции не являются автозапчастями и не имеют допустимой публичной подкатегории. |
| Cleaning/wiper accessories without stable target | 11 | 6 | 5 | 247 | filtry-i-masla/zhidkosti | 0.3198 | 0.1336 | 0.6802 | 0 | 0 | 11 | Очистка/стеклоочистители частично автоматизированы, но оставшиеся названия смешивают расходники, аксессуары и детали узла. |
| Cabin comfort/universal accessories without stable target | 11 | 0 | 11 | 211 | aksessuary/prochie-aksessuary | 0.4882 | 0.1043 | 0.5118 | 0 | 0 | 11 | Салонные универсальные аксессуары в остатке не всегда отделяются от кузовных/салонных деталей и бытовых товаров. |
| Consumer phone/power accessories | 11 | 0 | 11 | 43 | elektrika/prochaya-elektrika | 0.7907 | 0.7209 | 0.2093 | 0 | 0 | 11 | Потребительская электроника и телефонные аксессуары не имеют подтверждённого автомобильного target. |
| Car-care consumables without stable target | 10 | 1 | 9 | 178 | aksessuary/avtohimiya | 0.4045 | 0.1573 | 0.5955 | 0 | 0 | 10 | Расходники ухода/полировки есть, но текущие активные аналоги расходятся между автохимией, инструментами и прочими аксессуарами. |
| Tools and road equipment without stable target | 9 | 2 | 7 | 754 | aksessuary/instrumenty | 0.7281 | 0.6618 | 0.2719 | 0 | 0 | 9 | Инструментальные позиции могут быть аксессуарами или специнструментом под узел автомобиля; без устойчивого назначения автоперевод небезопасен. |
| Miscellaneous universal non-catalog goods | 6 | 0 | 6 | 37 | kuzov-i-optika/fonari | 0.3784 | 0.1351 | 0.6216 | 0 | 0 | 6 | Единичные универсальные товары не являются автозапчастями или не имеют точного публичного target в текущей таксономии. |
| Electrical/consumer devices without auto context | 5 | 0 | 5 | 27 | elektrika/prochaya-elektrika | 0.3333 | 0.1111 | 0.6667 | 0 | 0 | 5 | Электрический товар есть, но автомобильное назначение не подтверждено достаточными признаками. |
| Tube/line mounts without system | 5 | 0 | 5 | 2 | dvigatel-i-transmissiya/detali-dvigatelya | 0.5 | 0 | 0.5 | 0 | 0 | 5 | Есть трубки или крепление магистралей, но без тормозного/топливного/охлаждающего назначения target остаётся неоднозначным. |
| Safety/reflective/emergency goods without stable target | 4 | 0 | 4 | 30 | aksessuary/bezopasnost | 0.6667 | 0.5333 | 0.3333 | 0 | 0 | 4 | Товары безопасности видны, но часть остатка не имеет устойчивой подкатегории или автомобильного назначения в текущей таксономии. |
| Audio/radio/media accessories without stable target | 3 | 0 | 3 | 73 | aksessuary/prochie-aksessuary | 0.8493 | 0.726 | 0.1507 | 0 | 0 | 3 | Аудио и медиа-аксессуары пересекаются между автоэлектроникой, прочей электрикой и универсальными товарами. |
| Fluids/adhesives/chemicals without stable target | 2 | 0 | 2 | 427 | filtry-i-masla/smazki | 0.3091 | 0.007 | 0.6909 | 0 | 0 | 2 | Химия и клеевые материалы распределяются между автохимией, жидкостями, смазками и прочими аксессуарами. |
| Fragrance/air-freshener goods without stable target | 1 | 0 | 1 | 0 | none | 0 | 0 | 0 | 0 | 0 | 1 | Ароматизаторы частично похожи на аксессуары/автохимию, но остаток не имеет подтвержденной подкатегории. |
| Fuel/air intake parts with partial context | 1 | 0 | 1 | 198 | dvigatel-i-transmissiya/toplivnaya-sistema | 0.6768 | 0.5606 | 0.3232 | 0 | 0 | 1 | Есть топливный/воздушный контекст, но оставшиеся позиции требуют отделить систему питания от фильтров, двигателя и универсальных деталей. |

## 9. Iteration Comparison

| Iteration | AUTO_READY | GROUP_REVIEW | Groups | MANUAL_REVIEW | BLOCKED | DO_NOT_PUBLISH | INVALID_INPUT | Fully manual | Main change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| iteration11 | 410 | 1188 | 379 | 2127 | 17 | 0 | 0 | 2144 | Baseline before final residual pass. |
| final | 1310 | 1273 | 393 | 769 | 142 | 248 | 0 | 1159 | Contextual residual families, stricter residual decomposition, final reports. |

## 10. Final Metrics

| Status | Count |
| --- | ---: |
| AUTO_READY | 1310 |
| GROUP_REVIEW | 1273 |
| MANUAL_REVIEW | 769 |
| BLOCKED_CONFLICT | 142 |
| DO_NOT_PUBLISH | 248 |
| INVALID_INPUT | 0 |
| Fully manual residual | 1159 |
| GROUP_REVIEW groups | 393 |

## 11. AUTO_READY Quality

This is not a human audit. It compares classifier output on active catalog products to their current active labels.

AUTO_READY shadow precision: 0.9111 (12373/13580)
GROUP_REVIEW shadow precision: 0.8418 (9365/11125)
No manual precision is claimed. `precision-sample.csv` and `auto-ready-audit.csv` are generated for human sampling.

Confidence calibration:

| Status | Band | Evaluated | Correct | Precision |
| --- | --- | ---: | ---: | ---: |
| AUTO_READY | 0.95-1.00 | 8803 | 8206 | 0.9322 |
| AUTO_READY | 0.90-0.95 | 4777 | 4167 | 0.8723 |
| AUTO_READY | 0.80-0.90 | 0 | 0 |  |
| AUTO_READY | 0.70-0.80 | 0 | 0 |  |
| AUTO_READY | below-0.70 | 0 | 0 |  |
| GROUP_REVIEW | 0.95-1.00 | 11 | 11 | 1 |
| GROUP_REVIEW | 0.90-0.95 | 2301 | 1667 | 0.7245 |
| GROUP_REVIEW | 0.80-0.90 | 8813 | 7687 | 0.8722 |
| GROUP_REVIEW | 0.70-0.80 | 0 | 0 |  |
| GROUP_REVIEW | below-0.70 | 0 | 0 |  |
| MANUAL_REVIEW | 0.95-1.00 | 0 | 0 |  |
| MANUAL_REVIEW | 0.90-0.95 | 0 | 0 |  |
| MANUAL_REVIEW | 0.80-0.90 | 0 | 0 |  |
| MANUAL_REVIEW | 0.70-0.80 | 289 | 284 | 0.9827 |
| MANUAL_REVIEW | below-0.70 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.95-1.00 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.90-0.95 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.80-0.90 | 755 | 412 | 0.5457 |
| BLOCKED_CONFLICT | 0.70-0.80 | 19 | 14 | 0.7368 |
| BLOCKED_CONFLICT | below-0.70 | 0 | 0 |  |
| DO_NOT_PUBLISH | 0.95-1.00 | 0 | 0 |  |
| DO_NOT_PUBLISH | 0.90-0.95 | 0 | 0 |  |
| DO_NOT_PUBLISH | 0.80-0.90 | 0 | 0 |  |
| DO_NOT_PUBLISH | 0.70-0.80 | 0 | 0 |  |
| DO_NOT_PUBLISH | below-0.70 | 0 | 0 |  |

## 12. GROUP_REVIEW Quality

| Metric | Value |
| --- | ---: |
| Groups | 393 |
| Median group size | 2 |
| Average group size | 3.2392 |
| Max group size | 38 |
| Groups > 20 | 5 |
| Groups > 50 | 0 |
| Groups > 100 | 0 |
| Risk-flagged groups | 44 |

GROUP_REVIEW rows remain `needsReview=true`; they are grouped for operator confirmation, not published automatically.

## 13. Largest Groups

| Group | Count | Target | Confidence | Homogeneity | Risk flags | Examples | Outliers |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| Прочие товары: универсальные фитинги и соединители | 38 | ves-assortiment/other-products | 0.9117 | 1 | none | ИН-00288 29752F [N90765301] кольцо уплотнит. сист; ИН-00298 12409F Кольцо уплотнительное; ИН-00880 Кольцо уплотнительное |  |
| Детали двигателя | 36 | dvigatel-i-transmissiya/detali-dvigatelya | 0.8867 | 1 | none | ДВ-00757 К-т клапанов выпускных 2108-1007012-01-Ч ЧАМЗ немагнит.; ДВ-00009 Втулки клапанные SM 2101-07; ДВ-00010 Втулки клапанные SM 2108 |  |
| Прочие товары: универсальные фитинги и соединители | 28 | ves-assortiment/other-products | 0.9114 | 1 | near_threshold_or_close_candidate | КГ-00765 Штуцер-соединитель угловой под 22 ключ; КГ-00766 Штуцер-соединитель угловой под 24 ключ; КГ-00767 Штуцер-соединитель угловой под 27 ключ | К-00861 Кольцо стопорное для вал. ф4 быстросъёмное; К-00862 Кольцо стопорное для вал. ф5 быстросъёмное; К-00864 Кольцо стопорное для вал. ф8 быстросъёмное |
| Стеклоочистители | 28 | aksessuary/prochie-aksessuary | 0.912 | 1 | none | ЗЧМ-00138 Мотор стеклоочистителя 2141; ЗЧМ-00611 Мотор стеклоочистителя 2140-412; ИН-00214 Трапеция стеклоочистителя Дэу-Нексиа |  |
| Выхлопная система | 24 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.89 | 1 | none | Г-00155 Гофра ф22; Г-00255 Гофра ремонтная; Г-00414 Гофра 40х330 |  |
| Прочие аксессуары | 18 | aksessuary/prochie-aksessuary | 0.85 | 1 | none | А-00401 Пленка тонирующая с переходом; А-01574 MTF Пленка PREMIUM 0,5м; А-01575 MTF Пленка PREMIUM 0,75м |  |
| Бачки омывателя | 17 | kuzov-i-optika/kuzovnye-detali | 0.912 | 1 | none | ДВ-00129 Бачок омывателя 2101-07; ДВ-00226 Бачок омывателя двойной пустой ВАЗ; А-00663 Бачок омывателя зад. Нива, 2104, Ока |  |
| Колпаки колес | 17 | aksessuary/shiny-i-diski | 0.9049 | 1 | none | А-01083 Колпаки декоративные малые ВАЗ (1 шт); А-00785 Колпаки хромированные д.15; А-01052 Колпаки Каррера плюс 13/14 |  |
| Пневмофитинги и соединители шлангов | 16 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.902 | 1 | none | КГ-01176 Фурнитура наружная резьба D=6 М 20*1.5 0759; КГ-01097 Фурнитура D6 М10Х1 наружная резьба; КГ-01175 Фурнитура наружная резьба D=6 М 8*1 0796 |  |
| Прочая электрика | 16 | elektrika/prochaya-elektrika | 0.85 | 1 | none | А-00161 Компьютер "Штат" 2110 (голосовой); А-00585 Компьютер 2115 (говорящий); А-00759 Компьютер 2115 |  |
| Автоэлектроника и устройства | 15 | aksessuary/prochie-aksessuary | 0.89 | 1 | none | А-00694 Автомагнитола AM Eplutus СА310, СА313; А-01270 Автомагнитола "УРАЛ" 280 24V; А-01272 Автомагнитола "SWAT" 212 |  |
| Автоэлектроника и устройства | 15 | aksessuary/prochie-aksessuary | 0.89 | 1 | none | А-01226 Видеорегистратор 2 камеры DVR; А-01451 Видеорегистратор EPLUTUS 931; А-01148 Видеорегистратор XPX P40 Pro |  |
| Элементы салона | 15 | kuzov-i-optika/elementy-salona | 0.85 | 1 | near_threshold_or_close_candidate | А-00439 Накладка кулисы 2101-07; А-00509 Накладка потолка 2105-07; ЗЧМ-00241 Накладка поводка 2141 Москвич | А-00439 Накладка кулисы 2101-07 |
| Прочие товары: универсальные фитинги и соединители | 14 | ves-assortiment/other-products | 0.91 | 1 | near_threshold_or_close_candidate | А-01893 Кольца простав. динамиков 16 см; А-01897 Кольца для динамиков 16 обшитые; РГ-00441 Кольца манжеты | ДВ-00045 Кольца Кострома Приора 82.0; ДВ-00223 Кольца ВАЗ СТК; ДВ-00235 Кольца ВАЗ MAHLE |
| Колёсные болты, гайки и шпильки | 13 | aksessuary/shiny-i-diski | 0.912 | 1 | near_threshold_or_close_candidate | ЗЧМ-00041 Гайка колес Москвич 2140; К-00108 Гайка колёс Нива; К-00408 Гайка колес Нива (удлиненная) | КГ-00650 Гайка колес УАЗ 14х1.5 ключ 19 |
| Скотч и клейкие ленты | 13 | aksessuary/prochie-aksessuary | 0.8424 | 1 | none | А-00214 Скотч "Боди" 25 мм; А-00219 Скотч "Боди" 38 мм; А-00886 Скотч 2-х сторонний "ЗМ" (9 мм) |  |
| Ароматизаторы и дезодоранты | 12 | aksessuary/prochie-aksessuary | 0.8567 | 1 | near_threshold_or_close_candidate | А-00266 Дезодорант "Кубики"; А-00773 Дезодорант гелевый (вентилятор); А-00917 Дезодорант гелевый (животные) | А-01434 Дезодорант под сиденье |
| Кузовные воздухозаборники | 12 | kuzov-i-optika/kuzovnye-detali | 0.8767 | 1 | none | А-00623 Воздухозаборник Нива; А-01290 Воздухозаборник Нива н/о хром; А-00483 Воздухозаборник ОКА |  |
| Оплетки руля | 11 | aksessuary/prochie-aksessuary | 0.9073 | 1 | none | А-02324 Оплётка для перетяжки руля "АвтоПрофи"; А-01612 Оплетка (натуральный мех); А-01823 Оплётка 48 см |  |
| Малые кузовные элементы | 10 | kuzov-i-optika/kuzovnye-detali | 0.8912 | 1 | none | КР-00348 Жабо ВАЗ 2108 (за 2 шт); ИН-01127 Жабо Рено Дастер; А-01112 Жабо 2115 |  |
| Прочая электрика | 10 | elektrika/prochaya-elektrika | 0.85 | 1 | none | ИН-00881 Переключатель; ЗЧМ-00296 Центральный переключатель света Москвич; ИН-00185 Переключатель света центр. Ланос |  |
| Рули и рулевые колеса | 10 | kuzov-i-optika/kuzovnye-detali | 0.82 | 1 | none | А-00390 Руль кожа-дерево; А-00123 Руль (кожа); А-00227 Руль Лада |  |
| Фары | 10 | kuzov-i-optika/fary | 0.9 | 1 | near_threshold_or_close_candidate | А-00472 Накладка под фары 2110 (2 шт); А-02291 Фары 2115 (тюнинг), 2 шт; ИН-00702 Фары пр.21511В7RLEMN2,лев.21511В7LLEMN2 | А-00472 Накладка под фары 2110 (2 шт); ИН-00735 Кожух крышки фары Chevrolet; О-00038 Ободок фары УАЗ |
| Выхлопная система | 9 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.89 | 1 | none | Г-00599 Пламегаситель стронгер 45*400 с перфор.-диффузором "CBD" STAL113; Г-00633 Пламегаситель коллекторный диссипативный D=57х110мм L=100мм CBD510.010; Г-00600 Пламегаситель стронгер 45*550 с перфор.-диффузором "CBD" STAL114 |  |
| Детали двигателя | 9 | dvigatel-i-transmissiya/detali-dvigatelya | 0.916 | 1 | none | ЗЧМ-00601 Крышка клапанная Таврия; ДВ-00124 Крышка клапанная 2101; ДВ-00259 Крышка клапанов 2105 |  |

## 14. Residual Manual Review

| Reason | Count | Share | Examples |
| --- | ---: | ---: | --- |
| active_analogs_conflict_or_no_destination | 304 | 0.2623 | А-00004 Вентилятор ALCO; А-00369 Люк; А-00573 Прожектор; А-00616 Аппликатор "Доктор ВАКС" |
| potentially_automatable_future_context_rules | 194 | 0.1674 | А-01206 Отбойник УАЗ-Патриот СА-пласт.; А-02317 Упор (башмак) противооткатный AVS SM-01; ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00452 Бак 21073 инжектор |
| unique_singleton_or_no_active_analogs | 185 | 0.1596 | А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха; А-02368 Накидки Фронт "ICEBERG FRONT"черный/черный/красный 26190; Б-00004 Буфер перед. н/о 3 2803010-53205 |
| technical_insufficient_data | 180 | 0.1553 | А-00543 "КОТО" Разветвитель двойной 201; А-00703 Такси; А-00775 А-00775; А-01370 А-01370 |
| name_lacks_destination_context | 174 | 0.1501 | А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141 |
| no_allowed_target_current_taxonomy | 122 | 0.1053 | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая); А-00502 Брелок |

Active analog Pareto for residual rows:

| Family | Residual | Active analogs | Top active targets |
| --- | ---: | ---: | --- |
| other | 840 | 0 |  |
| socket_head_fasteners | 40 | 37 | aksessuary/instrumenty:34; dvigatel-i-transmissiya/detali-dvigatelya:1; dvigatel-i-transmissiya/kpp:1; elektrika/datchiki:1 |
| pneumatic_fittings | 38 | 1 | kuzov-i-optika/kuzovnye-detali:1 |
| screws | 33 | 4 | aksessuary/instrumenty:2; kuzov-i-optika/bampery:1; kuzov-i-optika/podkrylki-i-bryzgoviki:1 |
| caps_plugs | 31 | 403 | dvigatel-i-transmissiya/detali-dvigatelya:88; dvigatel-i-transmissiya/ohlazhdenie:37; kuzov-i-optika/zamki-i-ruchki:33; aksessuary/instrumenty:23; dvigatel-i-transmissiya/kpp:23; kuzov-i-optika/kuzovnye-detali:22; filtry-i-masla/masla:19; aksessuary/prochie-aksessuary:14 |
| hoses | 23 | 982 | dvigatel-i-transmissiya/detali-dvigatelya:351; tormoznaya-sistema/prochaya-tormoznaya-sistema:153; dvigatel-i-transmissiya/ohlazhdenie:125; aksessuary/instrumenty:111; kuzov-i-optika/kuzovnye-detali:55; dvigatel-i-transmissiya/sceplenie:39; podveska/ressory:36; dvigatel-i-transmissiya/nasosy:30 |
| fittings | 20 | 272 | tormoznaya-sistema/prochaya-tormoznaya-sistema:107; aksessuary/instrumenty:32; dvigatel-i-transmissiya/kpp:21; filtry-i-masla/maslyanye-filtry:19; kuzov-i-optika/kuzovnye-detali:16; dvigatel-i-transmissiya/ohlazhdenie:12; aksessuary/prochie-aksessuary:10; dvigatel-i-transmissiya/detali-dvigatelya:9 |
| personal_accessories | 15 | 4 | aksessuary/chehly:2; aksessuary/instrumenty:1; elektrika/signalizatsii:1 |
| bolts | 14 | 407 | aksessuary/shiny-i-diski:71; dvigatel-i-transmissiya/detali-dvigatelya:68; dvigatel-i-transmissiya/detali-transmissii:30; podveska/ressory:21; kuzov-i-optika/kuzovnye-detali:15; dvigatel-i-transmissiya/kpp:14; elektrika/generatory:13; tormoznaya-sistema/prochaya-tormoznaya-sistema:12 |
| ventilation | 12 | 117 | dvigatel-i-transmissiya/detali-dvigatelya:61; elektrika/prochaya-elektrika:26; aksessuary/instrumenty:6; dvigatel-i-transmissiya/remni:6; dvigatel-i-transmissiya/ohlazhdenie:4; elektrika/datchiki:4; elektrika/provodka:3; kuzov-i-optika/kuzovnye-detali:2 |
| body_clips | 11 | 39 | kuzov-i-optika/kuzovnye-detali:23; aksessuary/instrumenty:4; aksessuary/prochie-aksessuary:3; kuzov-i-optika/podkrylki-i-bryzgoviki:3; kuzov-i-optika/bampery:2; kuzov-i-optika/moldingi:2; tormoznaya-sistema/prochaya-tormoznaya-sistema:2 |
| bushings | 11 | 129 | podveska/prochaya-podveska:32; dvigatel-i-transmissiya/detali-dvigatelya:18; podveska/amortizatory:14; dvigatel-i-transmissiya/detali-transmissii:11; podveska/ressory:8; dvigatel-i-transmissiya/kpp:6; podveska/rychagi:6; dvigatel-i-transmissiya/sceplenie:5 |
| seat_parts | 9 | 19 | kuzov-i-optika/kuzovnye-detali:8; elektrika/prochaya-elektrika:5; aksessuary/chehly:4; aksessuary/kovriki:1; aksessuary/prochie-aksessuary:1 |
| conditioner_parts | 8 | 40 | filtry-i-masla/zhidkosti:12; dvigatel-i-transmissiya/ohlazhdenie:8; dvigatel-i-transmissiya/remni:7; elektrika/generatory:3; podveska/podshipniki:3; dvigatel-i-transmissiya/detali-dvigatelya:2; elektrika/prochaya-elektrika:2; dvigatel-i-transmissiya/kpp:1 |
| nuts | 8 | 111 | aksessuary/shiny-i-diski:20; podveska/stupicy:20; podveska/rulevye-nakonechniki:19; dvigatel-i-transmissiya/detali-transmissii:10; podveska/ressory:7; dvigatel-i-transmissiya/sceplenie:4; podveska/podshipniki:4; dvigatel-i-transmissiya/detali-dvigatelya:3 |
| driver_electronics | 7 | 6 | elektrika/prochaya-elektrika:6 |
| tow_hardware | 7 | 0 |  |
| electrical_consumer | 6 | 24 | elektrika/prochaya-elektrika:9; aksessuary/instrumenty:4; aksessuary/prochie-aksessuary:4; elektrika/provodka:4; dvigatel-i-transmissiya/detali-dvigatelya:2; podveska/rulevye-nakonechniki:1 |
| ignition_distributor | 5 | 63 | elektrika/prochaya-elektrika:45; dvigatel-i-transmissiya/detali-dvigatelya:7; podveska/podshipniki:4; dvigatel-i-transmissiya/prokladki:3; aksessuary/instrumenty:2; dvigatel-i-transmissiya/kpp:1; filtry-i-masla/masla:1 |
| studs | 5 | 64 | aksessuary/shiny-i-diski:17; dvigatel-i-transmissiya/detali-dvigatelya:15; dvigatel-i-transmissiya/kpp:8; dvigatel-i-transmissiya/toplivnaya-sistema:6; podveska/stupicy:5; aksessuary/instrumenty:2; dvigatel-i-transmissiya/detali-transmissii:2; dvigatel-i-transmissiya/nasosy:2 |

## 15. Operator Workload

Initial individual decisions: 3742.
Final individual decisions plus group confirmations: 1552.
Group confirmations required: 393.
Estimated action reduction: 2190 (0.5852).
Median reviewed examples per group: 2.

## 16. Search Results

Search regression is run separately with `pnpm search:fixture` and saved as `search-regression-results.json` in this directory. The fixture excludes GROUP_REVIEW/manual/unconfirmed products from public-search candidates.

## 17. Tests

Command results are recorded after the replay: typecheck, lint, test, build, categorization check, search fixture and safe import dry-run where available.

## 18. Performance

Elapsed: 191692 ms.
Peak memory: 507 MB.

## 19. Risks

- Active-label shadow precision is a proxy, not a human audit.
- Risk-flagged GROUP_REVIEW clusters require operator sampling before enablement.
- Broad destination-free fasteners, fittings, caps, rings and hoses remain manual to avoid unsafe category assignment.

## 20. Known Limitations

- The exact requested 25,567-row production import snapshot is not present locally; this is a count-bounded replay using the available local upload and active catalog.
- Remaining generic fasteners, universal fittings, code-only rows, vehicle-model-only names and non-catalog accessories require taxonomy or source-data decisions before further safe automation.
- No manual precision audit was performed by the replay command.

## 21. Safe Deployment Plan

1. Review `auto-ready-audit.csv`, `group-review-audit.csv`, and the largest groups before enabling the pipeline.
2. Run the same replay against the exact target import snapshot in a local or staging database.
3. Publish only after operator sampling confirms the group targets and search fixture remains green.

## 22. Rollback Plan

Keep the previous categorization code and search index active until replay and sampling pass. If quality drops, revert the local commit and keep all new products in manual review.

## 23. Next Recommended Product/Taxonomy Decision

Decide whether generic fasteners, universal pneumatic fittings, code-only legacy parts and non-catalog accessories deserve explicit public taxonomy targets or source-data enrichment. Without that product/taxonomy decision, the lower bound remains dominated by items with no allowed destination or insufficient product context.

## Appendix. Residual Examples

- А-00004 Вентилятор ALCO (no_candidate; neighbors: none 0)
- А-00246 Смайлики силикон, 4 шт (no_candidate; neighbors: none 0)
- А-00278 Собака маленькая (no_candidate; neighbors: none 0)
- А-00369 Люк (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-00404 Собака (очень большая) (no_candidate; neighbors: none 0)
- А-00502 Брелок (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-00511 Перчатки (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-00526 Обезьяна на присоске (no_candidate; neighbors: none 0)
- А-00543 "КОТО" Разветвитель двойной 201 (no_candidate; neighbors: none 0)
- А-00548 Тюнинг Нива-Тайга (no_candidate; neighbors: none 0)
- А-00573 Прожектор (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-00616 Аппликатор "Доктор ВАКС" (no_candidate; neighbors: none 0)
- А-00703 Такси (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-00711 Покрытие пола (линолеум) (no_candidate; neighbors: none 0)
- А-00718 Мячик-дезодорант (1 шт) (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-00723 Автопарфюм 7 мл (no_candidate; neighbors: none 0)
- А-00726 Бокс 2101-07 Люкс (no_candidate; neighbors: none 0)
- А-00775 А-00775 (CODE_ONLY; neighbors: none 0)
- А-00894 Рысь (большая) (no_candidate; neighbors: none 0)
- А-00896 Опора полки 2108 (2 шт) (no_candidate; neighbors: none 0)
- А-00918 Поросенок (большой) (no_candidate; neighbors: none 0)
- А-00936 Стакан (нержавейка) (no_candidate; neighbors: none 0)
- А-00946 Мышь музыкальная (no_candidate; neighbors: none 0)
- А-00979 Вентилятор "Valgo" (no_candidate; neighbors: none 0)
- А-00986 Подарочный набор (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-01033 Игрушка-корова на присоске (no_candidate; neighbors: none 0)
- А-01036 Брелок (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-01050 "Леопард" хромир. (no_candidate; neighbors: none 0)
- А-01058 Рация "АЛАН-100" (UNKNOWN_PRODUCT_TYPE; neighbors: none 0)
- А-01099 Рация "Мега-Джет" 300,100 (no_candidate; neighbors: none 0)
- А-01159 Рация "Алан-48 плюс" (no_candidate; neighbors: none 0)
- А-01206 Отбойник УАЗ-Патриот СА-пласт. (no_candidate; neighbors: none 0)
- А-01211 Накладка на воздухозаборник 2110 (краш.) (close_candidates; neighbors: none 0)
- А-01280 Перчатки зимние п/шерсть черные с ПВХ (no_candidate; neighbors: none 0)
- А-01287 Бумажник водителя BLACK натур. кожа (no_candidate; neighbors: none 0)
- А-01292 Нож дорожный (no_candidate; neighbors: none 0)
- А-01332 "Банка" радио+флешка (воспроизв.) (no_candidate; neighbors: none 0)
- А-01338 Часы большие (на батарейке) (no_candidate; neighbors: none 0)
- А-01370 А-01370 (CODE_ONLY; neighbors: none 0)
- А-01378 Сумка-холодильник (термо) (no_candidate; neighbors: none 0)

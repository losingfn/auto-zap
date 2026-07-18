# Real Import Categorization Replay

Generated: 2026-07-18T20:58:42.976Z
Input: 1782302118029-de725b0722e1-catalog.xlsx / TDSheet
Pipeline: product-normalizer-v2+domain-dictionary-v2+domain-rules-v2+confidence-model-v2

## Safety

- Read-only offline command.
- Local PostgreSQL only; production-like DATABASE_URL values are rejected.
- No import, publish, active catalog update, Meilisearch write, PM2, Nginx, backup or cron action is performed.

## Scenario

Mode: target-count-bounded-local-replay
Active version: c55e517a-e505-47dc-848b-89e6d923915e (catalog.xlsx)

| Metric | Value |
| --- | ---: |
| Import total rows | 30703 |
| Import parsed rows | 30690 |
| Existing active rows in replay | 21262 |
| New/unconfirmed rows in replay | 3742 |
| Local active-version review count | 4663 |

The local workspace does not contain the exact 25,567-row latest import described in the task. This replay uses the available local active catalog and import upload, and reports the mismatch explicitly.

## New / Unconfirmed Product Metrics

| Status | Count |
| --- | ---: |
| AUTO_READY | 425 |
| GROUP_REVIEW | 1504 |
| MANUAL_REVIEW | 1798 |
| BLOCKED_CONFLICT | 15 |
| INVALID_INPUT | 0 |
| Fully manual residual | 1813 |
| GROUP_REVIEW groups | 466 |

## Iteration Comparison

| Iteration | AUTO_READY | GROUP_REVIEW | Groups | MANUAL_REVIEW | BLOCKED | Fully manual | Main change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| iteration11 | 410 | 1188 | 379 | 2127 | 17 | 2144 | Baseline before final residual pass. |
| iteration12 | 425 | 1504 | 466 | 1798 | 15 | 1813 | Contextual residual families, stricter residual decomposition, final reports. |

## Operator Decisions

| Metric | Value |
| --- | ---: |
| Before | 3742 |
| After | 2279 |
| Reduction | 1463 |
| Reduction share | 0.391 |

## Largest Groups

| Group | Count | Target | Confidence | Homogeneity | Risk flags | Examples | Outliers |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| Пневмофитинги и соединители шлангов | 38 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.92 | 1 | near_threshold_or_close_candidate | КГ-01086 Соединитель шлангов Г-образный метал. д.1; КГ-00675 Соединитель шлангов метал 14х14; КГ-01075 Соединитель шлангов прямой метал. д.14 | КГ-01330 Соединитель шлангов угол 16х16 ключ 19 |
| Детали двигателя | 36 | dvigatel-i-transmissiya/detali-dvigatelya | 0.8867 | 1 | none | ДВ-00757 К-т клапанов выпускных 2108-1007012-01-Ч ЧАМЗ немагнит.; ДВ-00009 Втулки клапанные SM 2101-07; ДВ-00010 Втулки клапанные SM 2108 |  |
| Стеклоочистители | 28 | aksessuary/prochie-aksessuary | 0.912 | 1 | none | ЗЧМ-00138 Мотор стеклоочистителя 2141; ЗЧМ-00611 Мотор стеклоочистителя 2140-412; ИН-00214 Трапеция стеклоочистителя Дэу-Нексиа |  |
| Похожие активные товары | 26 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.94 | 1 | none | ИН-00307 107 219 685 Хомут 54,5мм; ИН-00310 107 222 685 Хомут 59, 5 мм; ИН-00306 102 754 685 Хомут 54,5 мм |  |
| Выхлопная система | 24 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.89 | 1 | none | Г-00155 Гофра ф22; Г-00255 Гофра ремонтная; Г-00414 Гофра 40х330 |  |
| Пневмофитинги и соединители шлангов | 21 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.8646 | 1 | none | ДВ-00723 Соединитель воздушных шлангов 2107 инж.; ДВ-00724 Соединитель воздушных шлангов 21214 инж.; ИН-00689 06.301AL Труба соединительная DAEWOO NE |  |
| Похожие активные товары | 21 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.94 | 1 | none | КГ-00647 Быстросъем для пневм. трубок Ф6; КГ-00412 Соединитель трубок ПВХ М8/м10/м12; КГ-00563 Фитинг соединитель прям. Ф-15 мм |  |
| Метизы и хомуты выхлопной системы | 18 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.912 | 1 | none | ОК-00061 Прижим приемной трубы; РГ-00127 Ремкомплект приемной трубы ГАЗ-53; РГ-00274 Рем.к-т приемной трубы УАЗ-469 |  |
| Прочие аксессуары | 18 | aksessuary/prochie-aksessuary | 0.85 | 1 | none | А-00401 Пленка тонирующая с переходом; А-01574 MTF Пленка PREMIUM 0,5м; А-01575 MTF Пленка PREMIUM 0,75м |  |
| Бачки омывателя | 17 | kuzov-i-optika/kuzovnye-detali | 0.912 | 1 | none | ДВ-00129 Бачок омывателя 2101-07; ДВ-00226 Бачок омывателя двойной пустой ВАЗ; А-00663 Бачок омывателя зад. Нива, 2104, Ока |  |
| Колпаки колес | 17 | aksessuary/shiny-i-diski | 0.9049 | 1 | none | А-01083 Колпаки декоративные малые ВАЗ (1 шт); А-00785 Колпаки хромированные д.15; А-01052 Колпаки Каррера плюс 13/14 |  |
| Пневмофитинги и соединители шлангов | 16 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.902 | 1 | none | КГ-01176 Фурнитура наружная резьба D=6 М 20*1.5 0759; КГ-01097 Фурнитура D6 М10Х1 наружная резьба; КГ-01175 Фурнитура наружная резьба D=6 М 8*1 0796 |  |
| Прочая электрика | 16 | elektrika/prochaya-elektrika | 0.85 | 1 | none | А-00161 Компьютер "Штат" 2110 (голосовой); А-00585 Компьютер 2115 (говорящий); А-00759 Компьютер 2115 |  |
| Автоэлектроника и устройства | 15 | aksessuary/prochie-aksessuary | 0.89 | 1 | none | А-00694 Автомагнитола AM Eplutus СА310, СА313; А-01270 Автомагнитола "УРАЛ" 280 24V; А-01272 Автомагнитола "SWAT" 212 |  |
| Автоэлектроника и устройства | 15 | aksessuary/prochie-aksessuary | 0.89 | 1 | none | А-01226 Видеорегистратор 2 камеры DVR; А-01451 Видеорегистратор EPLUTUS 931; А-01148 Видеорегистратор XPX P40 Pro |  |
| Элементы салона | 15 | kuzov-i-optika/elementy-salona | 0.85 | 1 | near_threshold_or_close_candidate | А-00439 Накладка кулисы 2101-07; А-00509 Накладка потолка 2105-07; ЗЧМ-00241 Накладка поводка 2141 Москвич | А-00439 Накладка кулисы 2101-07 |
| Похожие активные товары | 14 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.9391 | 1 | none | КГ-00927 Фитинг 22х12 с наружной резьбой; КГ-00926 Фитинг 22х10 с наружной резьбой; КГ-00928 Фитинг 22х8 с наружной резьбой |  |
| Колёсные болты, гайки и шпильки | 13 | aksessuary/shiny-i-diski | 0.912 | 1 | near_threshold_or_close_candidate | ЗЧМ-00041 Гайка колес Москвич 2140; К-00108 Гайка колёс Нива; К-00408 Гайка колес Нива (удлиненная) | КГ-00650 Гайка колес УАЗ 14х1.5 ключ 19 |
| Скотч и клейкие ленты | 13 | aksessuary/prochie-aksessuary | 0.8424 | 1 | none | А-00214 Скотч "Боди" 25 мм; А-00219 Скотч "Боди" 38 мм; А-00886 Скотч 2-х сторонний "ЗМ" (9 мм) |  |
| Ароматизаторы и дезодоранты | 12 | aksessuary/prochie-aksessuary | 0.8567 | 1 | near_threshold_or_close_candidate | А-00266 Дезодорант "Кубики"; А-00773 Дезодорант гелевый (вентилятор); А-00917 Дезодорант гелевый (животные) | А-01434 Дезодорант под сиденье |
| Кузовные воздухозаборники | 12 | kuzov-i-optika/kuzovnye-detali | 0.8767 | 1 | none | А-00623 Воздухозаборник Нива; А-01290 Воздухозаборник Нива н/о хром; А-00483 Воздухозаборник ОКА |  |
| Оплетки руля | 11 | aksessuary/prochie-aksessuary | 0.9073 | 1 | none | А-02324 Оплётка для перетяжки руля "АвтоПрофи"; А-01612 Оплетка (натуральный мех); А-01823 Оплётка 48 см |  |
| Малые кузовные элементы | 10 | kuzov-i-optika/kuzovnye-detali | 0.8912 | 1 | none | КР-00348 Жабо ВАЗ 2108 (за 2 шт); ИН-01127 Жабо Рено Дастер; А-01112 Жабо 2115 |  |
| Метизы и хомуты выхлопной системы | 10 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.872 | 1 | none | КГ-00598 Шпилька коллектора ЗИЛ-130 короткая; КГ-00599 Шпилька коллектора ЗИЛ-130 длин.; ЗЧМ-00373 Шпилька коллектора Москвич 8 шаг 1.0 |  |
| Прочая электрика | 10 | elektrika/prochaya-elektrika | 0.85 | 1 | none | ИН-00881 Переключатель; ЗЧМ-00296 Центральный переключатель света Москвич; ИН-00185 Переключатель света центр. Ланос |  |

## Residual Reasons

| Reason | Count |
| --- | ---: |
| no_candidate | 1798 |
| negative_evidence | 9 |
| close_candidates | 6 |

## Residual Decomposition

| Family | Count | Reason | Useful context | Active analogs | Top active targets | Irreducible | Examples |
| --- | ---: | --- | ---: | ---: | --- | ---: | --- |
| Unique low-frequency items | 606 | unique_singleton_or_no_active_analogs | 92 | 0 |  | 606 | А-00004 Вентилятор ALCO; А-00526 Обезьяна на присоске; А-00548 Тюнинг Нива-Тайга |
| Generic fasteners without destination | 432 | name_lacks_destination_context | 22 | 806 | aksessuary/shiny-i-diski:105; dvigatel-i-transmissiya/detali-dvigatelya:103; dvigatel-i-transmissiya/detali-transmissii:65; podveska/stupicy:49 | 432 | ЗЧМ-00588 Болт крышки в/очистителя 2141; К-00001 Гайка м 8 сапуна ВАЗ 01-07; К-00151 Болт М 5 малый крест |
| Short/code-only names | 336 | technical_insufficient_data | 1 | 0 |  | 336 | А-00369 Люк; А-00370 Скоба д.16; А-00502 Брелок |
| Ambiguous fittings and connectors | 137 | active_analogs_conflict_or_no_destination | 17 | 271 | tormoznaya-sistema/prochaya-tormoznaya-sistema:106; aksessuary/instrumenty:32; dvigatel-i-transmissiya/kpp:21; filtry-i-masla/maslyanye-filtry:19 | 137 | А-01725 Переходник с 220V на USB; Г-00029 Тройник КАМАЗ Евро; ЗЧМ-00062 Тройник патрубков Москвич |
| DIN/socket-head fasteners without public target | 77 | no_allowed_target_current_taxonomy | 0 | 39 | aksessuary/instrumenty:34; dvigatel-i-transmissiya/toplivnaya-sistema:2; dvigatel-i-transmissiya/detali-dvigatelya:1; dvigatel-i-transmissiya/kpp:1 | 77 | КГ-00431 DIN912 M10*11 с внутренним шестигранником; К-00004 Гайка. М 6 самоконтрящая ВАЗ; К-00005 Гайка. М 8 самоконтрящая ВАЗ |
| Small body/interior parts with weak context | 60 | active_analogs_conflict_or_no_destination | 5 | 761 | kuzov-i-optika/kuzovnye-detali:177; dvigatel-i-transmissiya/detali-dvigatelya:59; kuzov-i-optika/bampery:51; elektrika/generatory:44 | 60 | А-00726 Бокс 2101-07 Люкс; А-01211 Накладка на воздухозаборник 2110 (краш.); А-01774 Скоба троса 12 мм |
| Rings and seals without destination | 39 | active_analogs_conflict_or_no_destination | 0 | 508 | dvigatel-i-transmissiya/detali-dvigatelya:296; podveska/stupicy:49; dvigatel-i-transmissiya/kpp:45; dvigatel-i-transmissiya/detali-transmissii:29 | 39 | ЗЧМ-00629 Кольцо гильз Москвич 1.7 (к-т 4 шт); ИН-00288 29752F [N90765301] кольцо уплотнит. сист; ОК-00284 Кольцо грязезащитное внутреннее ОКА |
| Engine small parts with partial context | 36 | potentially_automatable_future_context_rules | 13 | 570 | dvigatel-i-transmissiya/detali-dvigatelya:160; dvigatel-i-transmissiya/prokladki:56; podveska/prochaya-podveska:49; aksessuary/instrumenty:46 | 36 | ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105; КГ-00746 Палец толкателя ГЦС |
| Hoses and tubes without system | 33 | name_lacks_destination_context | 33 | 1247 | dvigatel-i-transmissiya/detali-dvigatelya:420; dvigatel-i-transmissiya/ohlazhdenie:249; tormoznaya-sistema/prochaya-tormoznaya-sistema:202; aksessuary/instrumenty:115 | 33 | Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141 |
| Caps, covers and plugs without destination | 31 | name_lacks_destination_context | 10 | 403 | dvigatel-i-transmissiya/detali-dvigatelya:88; dvigatel-i-transmissiya/ohlazhdenie:37; kuzov-i-optika/zamki-i-ruchki:33; aksessuary/instrumenty:23 | 31 | ЗЧМ-00186 Крышка поддона Москвич; К-00422 Заглушка воздуховода 2110; К-00457 Заглушка под мовиль (пластмасса) |
| Personal/non-catalog accessories | 18 | no_allowed_target_current_taxonomy | 0 | 14 | aksessuary/instrumenty:4; aksessuary/chehly:2; dvigatel-i-transmissiya/nasosy:2; podveska/podshipniki:2 | 18 | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая) |
| Electrical/consumer devices without auto context | 8 | technical_insufficient_data | 0 | 27 | elektrika/prochaya-elektrika:9; aksessuary/prochie-aksessuary:6; aksessuary/instrumenty:5; elektrika/provodka:4 | 8 | А-00176 Адаптер "Samsung" USB (оригинал); А-00543 "КОТО" Разветвитель двойной 201; А-01460 Тепловентилятор автомобильный AVS Comfort ТЕ-310 12В (2 реж.) 150W |

## Taxonomy Limit

| Family | Residual | Contextual | No context | Active analogs | Top target | Purity | Safe auto | Safe group | Irreducible | Limit reason |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| Unique low-frequency items | 606 | 92 | 514 | 0 | none | 0 | 0 | 0 | 606 | Редкие единичные товары без активных аналогов и без повторяемого паттерна. |
| Generic fasteners without destination | 432 | 22 | 410 | 806 | aksessuary/shiny-i-diski | 0.1303 | 0 | 0 | 432 | Есть только тип крепежа/размер, без узла автомобиля и без единого безопасного target. |
| Short/code-only names | 336 | 1 | 335 | 0 | none | 0 | 0 | 0 | 336 | Название состоит из кода или слишком короткой фразы, классификационных признаков недостаточно. |
| Ambiguous fittings and connectors | 137 | 17 | 120 | 271 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.3911 | 0 | 0 | 137 | Похожие соединители в активном каталоге распределены по нескольким системам; без назначения нельзя выбрать подкатегорию. |
| DIN/socket-head fasteners without public target | 77 | 0 | 77 | 39 | aksessuary/instrumenty | 0.8718 | 0 | 0 | 77 | Крепёж как самостоятельная категория запрещён, а назначения узла в названии нет. |
| Small body/interior parts with weak context | 60 | 5 | 55 | 761 | kuzov-i-optika/kuzovnye-detali | 0.2326 | 0 | 0 | 60 | Малые кузовные/салонные элементы имеют похожие названия, но разные targets и часто недостаточный контекст. |
| Rings and seals without destination | 39 | 0 | 39 | 508 | dvigatel-i-transmissiya/detali-dvigatelya | 0.5827 | 0 | 0 | 39 | Кольца и уплотнения встречаются в двигателе, КПП, ступицах, тормозах и выхлопе. |
| Engine small parts with partial context | 36 | 13 | 23 | 570 | dvigatel-i-transmissiya/detali-dvigatelya | 0.2807 | 0 | 0 | 36 | Часть моторного контекста есть, но оставшиеся позиции требуют дополнительного правила или проверки шума активного каталога. |
| Hoses and tubes without system | 33 | 33 | 0 | 1247 | dvigatel-i-transmissiya/detali-dvigatelya | 0.3368 | 0 | 0 | 33 | Шланги/трубки без тормозного, топливного, охлаждающего, ГУР или выхлопного контекста нельзя безопасно развести. |
| Caps, covers and plugs without destination | 31 | 10 | 21 | 403 | dvigatel-i-transmissiya/detali-dvigatelya | 0.2184 | 0 | 0 | 31 | Крышки и заглушки требуют контекст узла: радиатор, поддон, фара, бардачок, КПП и т.п. |
| Personal/non-catalog accessories | 18 | 0 | 18 | 14 | aksessuary/instrumenty | 0.2857 | 0 | 0 | 18 | Позиции не имеют точного публичного target в текущей автомобильной таксономии. |
| Electrical/consumer devices without auto context | 8 | 0 | 8 | 27 | elektrika/prochaya-elektrika | 0.3333 | 0 | 0 | 8 | Электрический товар есть, но автомобильное назначение не подтверждено достаточными признаками. |

## Residual Active Analogs

| Family | Residual | Active analogs | Top active targets |
| --- | ---: | ---: | --- |
| other | 884 | 0 |  |
| bolts | 256 | 407 | aksessuary/shiny-i-diski:71; dvigatel-i-transmissiya/detali-dvigatelya:68; dvigatel-i-transmissiya/detali-transmissii:30; podveska/ressory:21; kuzov-i-optika/kuzovnye-detali:15; dvigatel-i-transmissiya/kpp:14; elektrika/generatory:13; tormoznaya-sistema/prochaya-tormoznaya-sistema:12 |
| fittings | 151 | 272 | tormoznaya-sistema/prochaya-tormoznaya-sistema:107; aksessuary/instrumenty:32; dvigatel-i-transmissiya/kpp:21; filtry-i-masla/maslyanye-filtry:19; kuzov-i-optika/kuzovnye-detali:16; dvigatel-i-transmissiya/ohlazhdenie:12; aksessuary/prochie-aksessuary:10; dvigatel-i-transmissiya/detali-dvigatelya:9 |
| nuts | 87 | 111 | aksessuary/shiny-i-diski:20; podveska/stupicy:20; podveska/rulevye-nakonechniki:19; dvigatel-i-transmissiya/detali-transmissii:10; podveska/ressory:7; dvigatel-i-transmissiya/sceplenie:4; podveska/podshipniki:4; dvigatel-i-transmissiya/detali-dvigatelya:3 |
| washers | 66 | 110 | podveska/stupicy:18; dvigatel-i-transmissiya/detali-dvigatelya:16; dvigatel-i-transmissiya/kpp:15; filtry-i-masla/masla:9; podveska/prochaya-podveska:8; podveska/rychagi:6; dvigatel-i-transmissiya/detali-transmissii:5; podveska/ressory:5 |
| socket_head_fasteners | 64 | 37 | aksessuary/instrumenty:34; dvigatel-i-transmissiya/detali-dvigatelya:1; dvigatel-i-transmissiya/kpp:1; elektrika/datchiki:1 |
| rings | 41 | 229 | dvigatel-i-transmissiya/detali-dvigatelya:100; dvigatel-i-transmissiya/detali-transmissii:29; dvigatel-i-transmissiya/kpp:21; podveska/stupicy:13; dvigatel-i-transmissiya/nasosy:7; podveska/podshipniki:6; tormoznaya-sistema/cilindry:6; dvigatel-i-transmissiya/ohlazhdenie:5 |
| studs | 40 | 64 | aksessuary/shiny-i-diski:17; dvigatel-i-transmissiya/detali-dvigatelya:15; dvigatel-i-transmissiya/kpp:8; dvigatel-i-transmissiya/toplivnaya-sistema:6; podveska/stupicy:5; aksessuary/instrumenty:2; dvigatel-i-transmissiya/detali-transmissii:2; dvigatel-i-transmissiya/nasosy:2 |
| clamps | 34 | 106 | dvigatel-i-transmissiya/vyhlopnaya-sistema:34; podveska/pruzhiny:20; dvigatel-i-transmissiya/detali-transmissii:15; aksessuary/instrumenty:7; kuzov-i-optika/kuzovnye-detali:7; dvigatel-i-transmissiya/ohlazhdenie:4; podveska/rulevye-nakonechniki:4; dvigatel-i-transmissiya/toplivnaya-sistema:3 |
| screws | 34 | 4 | aksessuary/instrumenty:2; kuzov-i-optika/bampery:1; kuzov-i-optika/podkrylki-i-bryzgoviki:1 |
| caps_plugs | 31 | 403 | dvigatel-i-transmissiya/detali-dvigatelya:88; dvigatel-i-transmissiya/ohlazhdenie:37; kuzov-i-optika/zamki-i-ruchki:33; aksessuary/instrumenty:23; dvigatel-i-transmissiya/kpp:23; kuzov-i-optika/kuzovnye-detali:22; filtry-i-masla/masla:19; aksessuary/prochie-aksessuary:14 |
| hoses | 23 | 982 | dvigatel-i-transmissiya/detali-dvigatelya:351; tormoznaya-sistema/prochaya-tormoznaya-sistema:153; dvigatel-i-transmissiya/ohlazhdenie:125; aksessuary/instrumenty:111; kuzov-i-optika/kuzovnye-detali:55; dvigatel-i-transmissiya/sceplenie:39; podveska/ressory:36; dvigatel-i-transmissiya/nasosy:30 |
| personal_accessories | 15 | 4 | aksessuary/chehly:2; aksessuary/instrumenty:1; elektrika/signalizatsii:1 |
| bushings | 13 | 129 | podveska/prochaya-podveska:32; dvigatel-i-transmissiya/detali-dvigatelya:18; podveska/amortizatory:14; dvigatel-i-transmissiya/detali-transmissii:11; podveska/ressory:8; dvigatel-i-transmissiya/kpp:6; podveska/rychagi:6; dvigatel-i-transmissiya/sceplenie:5 |
| ventilation | 13 | 117 | dvigatel-i-transmissiya/detali-dvigatelya:61; elektrika/prochaya-elektrika:26; aksessuary/instrumenty:6; dvigatel-i-transmissiya/remni:6; dvigatel-i-transmissiya/ohlazhdenie:4; elektrika/datchiki:4; elektrika/provodka:3; kuzov-i-optika/kuzovnye-detali:2 |
| body_clips | 11 | 39 | kuzov-i-optika/kuzovnye-detali:23; aksessuary/instrumenty:4; aksessuary/prochie-aksessuary:3; kuzov-i-optika/podkrylki-i-bryzgoviki:3; kuzov-i-optika/bampery:2; kuzov-i-optika/moldingi:2; tormoznaya-sistema/prochaya-tormoznaya-sistema:2 |
| conditioner_parts | 9 | 40 | filtry-i-masla/zhidkosti:12; dvigatel-i-transmissiya/ohlazhdenie:8; dvigatel-i-transmissiya/remni:7; elektrika/generatory:3; podveska/podshipniki:3; dvigatel-i-transmissiya/detali-dvigatelya:2; elektrika/prochaya-elektrika:2; dvigatel-i-transmissiya/kpp:1 |
| seat_parts | 9 | 19 | kuzov-i-optika/kuzovnye-detali:8; elektrika/prochaya-elektrika:5; aksessuary/chehly:4; aksessuary/kovriki:1; aksessuary/prochie-aksessuary:1 |
| driver_electronics | 7 | 6 | elektrika/prochaya-elektrika:6 |
| electrical_consumer | 7 | 24 | elektrika/prochaya-elektrika:9; aksessuary/instrumenty:4; aksessuary/prochie-aksessuary:4; elektrika/provodka:4; dvigatel-i-transmissiya/detali-dvigatelya:2; podveska/rulevye-nakonechniki:1 |

## Active-Label Shadow Precision

This is not a human audit. It compares classifier output on active catalog products to their current active labels.

AUTO_READY shadow precision: 0.9334 (12700/13606)
GROUP_REVIEW shadow precision: 0.854 (9820/11499)

## Confidence Calibration

| Status | Band | Evaluated | Correct | Precision |
| --- | --- | ---: | ---: | ---: |
| AUTO_READY | 0.95-1.00 | 8823 | 8425 | 0.9549 |
| AUTO_READY | 0.90-0.95 | 4783 | 4275 | 0.8938 |
| AUTO_READY | 0.80-0.90 | 0 | 0 |  |
| AUTO_READY | 0.70-0.80 | 0 | 0 |  |
| AUTO_READY | below-0.70 | 0 | 0 |  |
| GROUP_REVIEW | 0.95-1.00 | 11 | 11 | 1 |
| GROUP_REVIEW | 0.90-0.95 | 2251 | 1746 | 0.7757 |
| GROUP_REVIEW | 0.80-0.90 | 9237 | 8063 | 0.8729 |
| GROUP_REVIEW | 0.70-0.80 | 0 | 0 |  |
| GROUP_REVIEW | below-0.70 | 0 | 0 |  |
| MANUAL_REVIEW | 0.95-1.00 | 0 | 0 |  |
| MANUAL_REVIEW | 0.90-0.95 | 0 | 0 |  |
| MANUAL_REVIEW | 0.80-0.90 | 0 | 0 |  |
| MANUAL_REVIEW | 0.70-0.80 | 328 | 323 | 0.9848 |
| MANUAL_REVIEW | below-0.70 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.95-1.00 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.90-0.95 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.80-0.90 | 280 | 199 | 0.7107 |
| BLOCKED_CONFLICT | 0.70-0.80 | 17 | 14 | 0.8235 |
| BLOCKED_CONFLICT | below-0.70 | 0 | 0 |  |

## Precision Samples

`precision-sample.csv` and `manual-sample.csv` were generated for human review. Their empty correctness fields are intentional; no manual precision is invented.

## Operator Workload

Initial individual decisions: 3742.
Final individual decisions plus group confirmations: 2279.
Group confirmations required: 466.
Estimated action reduction: 1463 (0.391).

## Performance

Elapsed: 172113 ms.
Peak memory: 530 MB.

## Tests

Test command results are recorded in the final task response after the commands are run. This replay report records data outputs only.

## Risks And Limitations

- Active-label shadow precision is a proxy, not a human audit.
- The local workspace does not contain the exact requested 25,567-row production import snapshot.
- Remaining generic fasteners, fittings, caps, rings, hoses and code-only names require taxonomy or source-data decisions before further safe automation.

## Safe Deployment Plan

1. Review `auto-ready-audit.csv`, `group-review-audit.csv`, and the largest groups before enabling the pipeline.
2. Run the same replay against the exact target import snapshot in a local or staging database.
3. Publish only after operator sampling confirms the group targets and search fixture remains green.

## Rollback Plan

Keep the previous categorization code and search index active until replay and sampling pass. If quality drops, revert the local commit and keep all new products in manual review.

## Next Product Decision

Decide whether generic fasteners and universal pneumatic fittings deserve explicit public taxonomy targets. Without that product/taxonomy decision, the lower bound remains dominated by items with no allowed destination.

## Residual Examples

- А-00004 Вентилятор ALCO (no_candidate; neighbors: none 0)
- А-00176 Адаптер "Samsung" USB (оригинал) (no_candidate; neighbors: none 0)
- А-00246 Смайлики силикон, 4 шт (no_candidate; neighbors: none 0)
- А-00278 Собака маленькая (no_candidate; neighbors: none 0)
- А-00369 Люк (no_candidate; neighbors: none 0)
- А-00370 Скоба д.16 (no_candidate; neighbors: none 0)
- А-00404 Собака (очень большая) (no_candidate; neighbors: none 0)
- А-00502 Брелок (no_candidate; neighbors: none 0)
- А-00511 Перчатки (no_candidate; neighbors: none 0)
- А-00526 Обезьяна на присоске (no_candidate; neighbors: none 0)
- А-00543 "КОТО" Разветвитель двойной 201 (no_candidate; neighbors: none 0)
- А-00548 Тюнинг Нива-Тайга (no_candidate; neighbors: none 0)
- А-00573 Прожектор (no_candidate; neighbors: none 0)
- А-00616 Аппликатор "Доктор ВАКС" (no_candidate; neighbors: none 0)
- А-00703 Такси (no_candidate; neighbors: none 0)
- А-00711 Покрытие пола (линолеум) (no_candidate; neighbors: none 0)
- А-00718 Мячик-дезодорант (1 шт) (no_candidate; neighbors: none 0)
- А-00723 Автопарфюм 7 мл (no_candidate; neighbors: none 0)
- А-00726 Бокс 2101-07 Люкс (no_candidate; neighbors: none 0)
- А-00775 А-00775 (no_candidate; neighbors: none 0)
- А-00894 Рысь (большая) (no_candidate; neighbors: none 0)
- А-00896 Опора полки 2108 (2 шт) (no_candidate; neighbors: none 0)
- А-00918 Поросенок (большой) (no_candidate; neighbors: none 0)
- А-00936 Стакан (нержавейка) (no_candidate; neighbors: none 0)
- А-00946 Мышь музыкальная (no_candidate; neighbors: none 0)
- А-00979 Вентилятор "Valgo" (no_candidate; neighbors: none 0)
- А-00986 Подарочный набор (no_candidate; neighbors: none 0)
- А-01033 Игрушка-корова на присоске (no_candidate; neighbors: none 0)
- А-01036 Брелок (no_candidate; neighbors: none 0)
- А-01050 "Леопард" хромир. (no_candidate; neighbors: none 0)
- А-01058 Рация "АЛАН-100" (no_candidate; neighbors: none 0)
- А-01099 Рация "Мега-Джет" 300,100 (no_candidate; neighbors: none 0)
- А-01159 Рация "Алан-48 плюс" (no_candidate; neighbors: none 0)
- А-01206 Отбойник УАЗ-Патриот СА-пласт. (no_candidate; neighbors: none 0)
- А-01211 Накладка на воздухозаборник 2110 (краш.) (close_candidates; neighbors: none 0)
- А-01280 Перчатки зимние п/шерсть черные с ПВХ (no_candidate; neighbors: none 0)
- А-01287 Бумажник водителя BLACK натур. кожа (no_candidate; neighbors: none 0)
- А-01292 Нож дорожный (no_candidate; neighbors: none 0)
- А-01332 "Банка" радио+флешка (воспроизв.) (no_candidate; neighbors: none 0)
- А-01338 Часы большие (на батарейке) (no_candidate; neighbors: none 0)

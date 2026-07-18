# Real Import Categorization Replay

Generated: 2026-07-18T13:19:13.148Z
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
| AUTO_READY | 410 |
| GROUP_REVIEW | 1188 |
| MANUAL_REVIEW | 2127 |
| BLOCKED_CONFLICT | 17 |
| INVALID_INPUT | 0 |
| Fully manual residual | 2144 |
| GROUP_REVIEW groups | 379 |

## Operator Decisions

| Metric | Value |
| --- | ---: |
| Before | 3742 |
| After | 2523 |
| Reduction | 1219 |
| Reduction share | 0.3258 |

## Largest Groups

| Group | Count | Target | Confidence | Homogeneity | Risk flags | Examples | Outliers |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| Похожие активные товары | 26 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.94 | 1 | none | ИН-00307 107 219 685 Хомут 54,5мм; ИН-00310 107 222 685 Хомут 59, 5 мм; ИН-00306 102 754 685 Хомут 54,5 мм |  |
| Стеклоочистители | 25 | aksessuary/prochie-aksessuary | 0.912 | 1 | none | ЗЧМ-00138 Мотор стеклоочистителя 2141; ЗЧМ-00611 Мотор стеклоочистителя 2140-412; ИН-00214 Трапеция стеклоочистителя Дэу-Нексиа |  |
| Выхлопная система | 24 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.89 | 1 | none | Г-00155 Гофра ф22; Г-00255 Гофра ремонтная; Г-00414 Гофра 40х330 |  |
| Похожие активные товары | 21 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.94 | 1 | none | КГ-00647 Быстросъем для пневм. трубок Ф6; КГ-00412 Соединитель трубок ПВХ М8/м10/м12; КГ-00563 Фитинг соединитель прям. Ф-15 мм |  |
| Прочая электрика | 19 | elektrika/prochaya-elektrika | 0.85 | 1 | none | А-00161 Компьютер "Штат" 2110 (голосовой); А-00585 Компьютер 2115 (говорящий); А-00759 Компьютер 2115 |  |
| Прочие аксессуары | 18 | aksessuary/prochie-aksessuary | 0.85 | 1 | none | А-00401 Пленка тонирующая с переходом; А-01574 MTF Пленка PREMIUM 0,5м; А-01575 MTF Пленка PREMIUM 0,75м |  |
| Бачки омывателя | 17 | kuzov-i-optika/kuzovnye-detali | 0.912 | 1 | none | ДВ-00129 Бачок омывателя 2101-07; ДВ-00226 Бачок омывателя двойной пустой ВАЗ; А-00663 Бачок омывателя зад. Нива, 2104, Ока |  |
| Колпаки колес | 17 | aksessuary/shiny-i-diski | 0.9049 | 1 | none | А-01083 Колпаки декоративные малые ВАЗ (1 шт); А-00785 Колпаки хромированные д.15; А-01052 Колпаки Каррера плюс 13/14 |  |
| Автоэлектроника и устройства | 15 | aksessuary/prochie-aksessuary | 0.89 | 1 | none | А-00694 Автомагнитола AM Eplutus СА310, СА313; А-01270 Автомагнитола "УРАЛ" 280 24V; А-01272 Автомагнитола "SWAT" 212 |  |
| Автоэлектроника и устройства | 15 | aksessuary/prochie-aksessuary | 0.89 | 1 | none | А-01226 Видеорегистратор 2 камеры DVR; А-01451 Видеорегистратор EPLUTUS 931; А-01148 Видеорегистратор XPX P40 Pro |  |
| Элементы салона | 15 | kuzov-i-optika/elementy-salona | 0.85 | 1 | near_threshold_or_close_candidate | А-00439 Накладка кулисы 2101-07; А-00509 Накладка потолка 2105-07; ЗЧМ-00241 Накладка поводка 2141 Москвич | А-00439 Накладка кулисы 2101-07 |
| Похожие активные товары | 14 | tormoznaya-sistema/prochaya-tormoznaya-sistema | 0.9391 | 1 | none | КГ-00927 Фитинг 22х12 с наружной резьбой; КГ-00926 Фитинг 22х10 с наружной резьбой; КГ-00928 Фитинг 22х8 с наружной резьбой |  |
| Колёсные болты, гайки и шпильки | 13 | aksessuary/shiny-i-diski | 0.912 | 1 | near_threshold_or_close_candidate | ЗЧМ-00041 Гайка колес Москвич 2140; К-00108 Гайка колёс Нива; К-00408 Гайка колес Нива (удлиненная) | КГ-00650 Гайка колес УАЗ 14х1.5 ключ 19 |
| Скотч и клейкие ленты | 13 | aksessuary/prochie-aksessuary | 0.8424 | 1 | none | А-00214 Скотч "Боди" 25 мм; А-00219 Скотч "Боди" 38 мм; А-00886 Скотч 2-х сторонний "ЗМ" (9 мм) |  |
| Ароматизаторы и дезодоранты | 12 | aksessuary/prochie-aksessuary | 0.8567 | 1 | near_threshold_or_close_candidate | А-00266 Дезодорант "Кубики"; А-00773 Дезодорант гелевый (вентилятор); А-00917 Дезодорант гелевый (животные) | А-01434 Дезодорант под сиденье |
| Кузовные воздухозаборники | 12 | kuzov-i-optika/kuzovnye-detali | 0.8767 | 1 | none | А-00623 Воздухозаборник Нива; А-01290 Воздухозаборник Нива н/о хром; А-00483 Воздухозаборник ОКА |  |
| Прочая электрика | 12 | elektrika/prochaya-elektrika | 0.85 | 1 | none | ИН-00881 Переключатель; ЗЧМ-00296 Центральный переключатель света Москвич; ИН-00185 Переключатель света центр. Ланос |  |
| Детали двигателя | 11 | dvigatel-i-transmissiya/detali-dvigatelya | 0.8534 | 1 | none | ДВ-00757 К-т клапанов выпускных 2108-1007012-01-Ч ЧАМЗ немагнит.; ДВ-00009 Втулки клапанные SM 2101-07; ДВ-00010 Втулки клапанные SM 2108 |  |
| Оплетки руля | 11 | aksessuary/prochie-aksessuary | 0.9073 | 1 | none | А-02324 Оплётка для перетяжки руля "АвтоПрофи"; А-01612 Оплетка (натуральный мех); А-01823 Оплётка 48 см |  |
| Малые кузовные элементы | 10 | kuzov-i-optika/kuzovnye-detali | 0.8912 | 1 | none | КР-00348 Жабо ВАЗ 2108 (за 2 шт); ИН-01127 Жабо Рено Дастер; А-01112 Жабо 2115 |  |
| Метизы и хомуты выхлопной системы | 10 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.872 | 1 | none | КГ-00598 Шпилька коллектора ЗИЛ-130 короткая; КГ-00599 Шпилька коллектора ЗИЛ-130 длин.; ЗЧМ-00373 Шпилька коллектора Москвич 8 шаг 1.0 |  |
| Метизы и хомуты выхлопной системы | 10 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.872 | 1 | none | КГ-00096 Кронштейн приёмной трубы Г-2217,3302 (дв.; КГ-00111 Кронштейн приемной трубы ГАЗ; КГ-00218 Кронштейн приемной трубы УАЗ 3741 409 дв. |  |
| Рули и рулевые колеса | 10 | kuzov-i-optika/kuzovnye-detali | 0.82 | 1 | none | А-00390 Руль кожа-дерево; А-00123 Руль (кожа); А-00227 Руль Лада |  |
| Фары | 10 | kuzov-i-optika/fary | 0.9 | 1 | near_threshold_or_close_candidate | А-00472 Накладка под фары 2110 (2 шт); А-02291 Фары 2115 (тюнинг), 2 шт; ИН-00702 Фары пр.21511В7RLEMN2,лев.21511В7LLEMN2 | А-00472 Накладка под фары 2110 (2 шт); О-00038 Ободок фары УАЗ |
| Выхлопная система | 9 | dvigatel-i-transmissiya/vyhlopnaya-sistema | 0.89 | 1 | none | Г-00599 Пламегаситель стронгер 45*400 с перфор.-диффузором "CBD" STAL113; Г-00633 Пламегаситель коллекторный диссипативный D=57х110мм L=100мм CBD510.010; Г-00600 Пламегаситель стронгер 45*550 с перфор.-диффузором "CBD" STAL114 |  |

## Residual Reasons

| Reason | Count |
| --- | ---: |
| no_candidate | 2127 |
| negative_evidence | 14 |
| close_candidates | 3 |

## Residual Active Analogs

| Family | Residual | Active analogs | Top active targets |
| --- | ---: | ---: | --- |
| other | 1097 | 0 |  |
| bolts | 312 | 407 | aksessuary/shiny-i-diski:71; dvigatel-i-transmissiya/detali-dvigatelya:68; dvigatel-i-transmissiya/detali-transmissii:30; podveska/ressory:21; kuzov-i-optika/kuzovnye-detali:15; dvigatel-i-transmissiya/kpp:14; elektrika/generatory:13; tormoznaya-sistema/prochaya-tormoznaya-sistema:12 |
| fittings | 237 | 272 | tormoznaya-sistema/prochaya-tormoznaya-sistema:107; aksessuary/instrumenty:32; dvigatel-i-transmissiya/kpp:21; filtry-i-masla/maslyanye-filtry:19; kuzov-i-optika/kuzovnye-detali:16; dvigatel-i-transmissiya/ohlazhdenie:12; aksessuary/prochie-aksessuary:10; dvigatel-i-transmissiya/detali-dvigatelya:9 |
| nuts | 89 | 111 | aksessuary/shiny-i-diski:20; podveska/stupicy:20; podveska/rulevye-nakonechniki:19; dvigatel-i-transmissiya/detali-transmissii:10; podveska/ressory:7; dvigatel-i-transmissiya/sceplenie:4; podveska/podshipniki:4; dvigatel-i-transmissiya/detali-dvigatelya:3 |
| washers | 76 | 110 | podveska/stupicy:18; dvigatel-i-transmissiya/detali-dvigatelya:16; dvigatel-i-transmissiya/kpp:15; filtry-i-masla/masla:9; podveska/prochaya-podveska:8; podveska/rychagi:6; dvigatel-i-transmissiya/detali-transmissii:5; podveska/ressory:5 |
| rings | 49 | 229 | dvigatel-i-transmissiya/detali-dvigatelya:100; dvigatel-i-transmissiya/detali-transmissii:29; dvigatel-i-transmissiya/kpp:21; podveska/stupicy:13; dvigatel-i-transmissiya/nasosy:7; podveska/podshipniki:6; tormoznaya-sistema/cilindry:6; dvigatel-i-transmissiya/ohlazhdenie:5 |
| caps_plugs | 42 | 403 | dvigatel-i-transmissiya/detali-dvigatelya:88; dvigatel-i-transmissiya/ohlazhdenie:37; kuzov-i-optika/zamki-i-ruchki:33; aksessuary/instrumenty:23; dvigatel-i-transmissiya/kpp:23; kuzov-i-optika/kuzovnye-detali:22; filtry-i-masla/masla:19; aksessuary/prochie-aksessuary:14 |
| studs | 40 | 64 | aksessuary/shiny-i-diski:17; dvigatel-i-transmissiya/detali-dvigatelya:15; dvigatel-i-transmissiya/kpp:8; dvigatel-i-transmissiya/toplivnaya-sistema:6; podveska/stupicy:5; aksessuary/instrumenty:2; dvigatel-i-transmissiya/detali-transmissii:2; dvigatel-i-transmissiya/nasosy:2 |
| clamps | 34 | 106 | dvigatel-i-transmissiya/vyhlopnaya-sistema:34; podveska/pruzhiny:20; dvigatel-i-transmissiya/detali-transmissii:15; aksessuary/instrumenty:7; kuzov-i-optika/kuzovnye-detali:7; dvigatel-i-transmissiya/ohlazhdenie:4; podveska/rulevye-nakonechniki:4; dvigatel-i-transmissiya/toplivnaya-sistema:3 |
| screws | 34 | 4 | aksessuary/instrumenty:2; kuzov-i-optika/bampery:1; kuzov-i-optika/podkrylki-i-bryzgoviki:1 |
| heater_parts | 27 | 277 | dvigatel-i-transmissiya/ohlazhdenie:105; elektrika/prochaya-elektrika:101; kuzov-i-optika/kuzovnye-detali:26; aksessuary/instrumenty:18; dvigatel-i-transmissiya/detali-dvigatelya:11; dvigatel-i-transmissiya/prokladki:3; dvigatel-i-transmissiya/kpp:2; dvigatel-i-transmissiya/nasosy:2 |
| hoses | 27 | 982 | dvigatel-i-transmissiya/detali-dvigatelya:351; tormoznaya-sistema/prochaya-tormoznaya-sistema:153; dvigatel-i-transmissiya/ohlazhdenie:125; aksessuary/instrumenty:111; kuzov-i-optika/kuzovnye-detali:55; dvigatel-i-transmissiya/sceplenie:39; podveska/ressory:36; dvigatel-i-transmissiya/nasosy:30 |
| bushings | 13 | 129 | podveska/prochaya-podveska:32; dvigatel-i-transmissiya/detali-dvigatelya:18; podveska/amortizatory:14; dvigatel-i-transmissiya/detali-transmissii:11; podveska/ressory:8; dvigatel-i-transmissiya/kpp:6; podveska/rychagi:6; dvigatel-i-transmissiya/sceplenie:5 |
| ventilation | 13 | 117 | dvigatel-i-transmissiya/detali-dvigatelya:61; elektrika/prochaya-elektrika:26; aksessuary/instrumenty:6; dvigatel-i-transmissiya/remni:6; dvigatel-i-transmissiya/ohlazhdenie:4; elektrika/datchiki:4; elektrika/provodka:3; kuzov-i-optika/kuzovnye-detali:2 |
| body_clips | 11 | 39 | kuzov-i-optika/kuzovnye-detali:23; aksessuary/instrumenty:4; aksessuary/prochie-aksessuary:3; kuzov-i-optika/podkrylki-i-bryzgoviki:3; kuzov-i-optika/bampery:2; kuzov-i-optika/moldingi:2; tormoznaya-sistema/prochaya-tormoznaya-sistema:2 |
| conditioner_parts | 9 | 40 | filtry-i-masla/zhidkosti:12; dvigatel-i-transmissiya/ohlazhdenie:8; dvigatel-i-transmissiya/remni:7; elektrika/generatory:3; podveska/podshipniki:3; dvigatel-i-transmissiya/detali-dvigatelya:2; elektrika/prochaya-elektrika:2; dvigatel-i-transmissiya/kpp:1 |
| seat_parts | 9 | 19 | kuzov-i-optika/kuzovnye-detali:8; elektrika/prochaya-elektrika:5; aksessuary/chehly:4; aksessuary/kovriki:1; aksessuary/prochie-aksessuary:1 |
| driver_electronics | 7 | 6 | elektrika/prochaya-elektrika:6 |
| ignition_distributor | 7 | 63 | elektrika/prochaya-elektrika:45; dvigatel-i-transmissiya/detali-dvigatelya:7; podveska/podshipniki:4; dvigatel-i-transmissiya/prokladki:3; aksessuary/instrumenty:2; dvigatel-i-transmissiya/kpp:1; filtry-i-masla/masla:1 |
| pins | 4 | 8 | podveska/pruzhiny:6; podveska/rulevye-nakonechniki:1; tormoznaya-sistema/supporty:1 |

## Active-Label Shadow Precision

This is not a human audit. It compares classifier output on active catalog products to their current active labels.

AUTO_READY shadow precision: 0.9317 (12776/13713)
GROUP_REVIEW shadow precision: 0.8644 (9887/11438)

## Confidence Calibration

| Status | Band | Evaluated | Correct | Precision |
| --- | --- | ---: | ---: | ---: |
| AUTO_READY | 0.95-1.00 | 8833 | 8436 | 0.9551 |
| AUTO_READY | 0.90-0.95 | 4880 | 4340 | 0.8893 |
| AUTO_READY | 0.80-0.90 | 0 | 0 |  |
| AUTO_READY | 0.70-0.80 | 0 | 0 |  |
| AUTO_READY | below-0.70 | 0 | 0 |  |
| GROUP_REVIEW | 0.95-1.00 | 9 | 9 | 1 |
| GROUP_REVIEW | 0.90-0.95 | 2085 | 1647 | 0.7899 |
| GROUP_REVIEW | 0.80-0.90 | 9344 | 8231 | 0.8809 |
| GROUP_REVIEW | 0.70-0.80 | 0 | 0 |  |
| GROUP_REVIEW | below-0.70 | 0 | 0 |  |
| MANUAL_REVIEW | 0.95-1.00 | 0 | 0 |  |
| MANUAL_REVIEW | 0.90-0.95 | 0 | 0 |  |
| MANUAL_REVIEW | 0.80-0.90 | 0 | 0 |  |
| MANUAL_REVIEW | 0.70-0.80 | 332 | 327 | 0.9849 |
| MANUAL_REVIEW | below-0.70 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.95-1.00 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.90-0.95 | 0 | 0 |  |
| BLOCKED_CONFLICT | 0.80-0.90 | 199 | 138 | 0.6935 |
| BLOCKED_CONFLICT | 0.70-0.80 | 17 | 14 | 0.8235 |
| BLOCKED_CONFLICT | below-0.70 | 0 | 0 |  |

## Precision Samples

`precision-sample.csv` and `manual-sample.csv` were generated for human review. Their empty correctness fields are intentional; no manual precision is invented.

## Residual Examples

- А-00004 Вентилятор ALCO (no_candidate; neighbors: none 0)
- А-00176 Адаптер "Samsung" USB (оригинал) (no_candidate; neighbors: none 0)
- А-00246 Смайлики силикон, 4 шт (no_candidate; neighbors: none 0)
- А-00278 Собака маленькая (no_candidate; neighbors: none 0)
- А-00369 Люк (no_candidate; neighbors: none 0)
- А-00370 Скоба д.16 (no_candidate; neighbors: none 0)
- А-00404 Собака (очень большая) (no_candidate; neighbors: none 0)
- А-00419 Реснички боковых стекол 2106 (no_candidate; neighbors: none 0.6667)
- А-00502 Брелок (no_candidate; neighbors: none 0)
- А-00511 Перчатки (no_candidate; neighbors: none 0)
- А-00526 Обезьяна на присоске (no_candidate; neighbors: none 0)
- А-00543 "КОТО" Разветвитель двойной 201 (no_candidate; neighbors: none 0)
- А-00548 Тюнинг Нива-Тайга (no_candidate; neighbors: none 0)
- А-00573 Прожектор (no_candidate; neighbors: none 0)
- А-00616 Аппликатор "Доктор ВАКС" (no_candidate; neighbors: none 0)
- А-00673 Переноска галогеновая (no_candidate; neighbors: none 0)
- А-00703 Такси (no_candidate; neighbors: none 0)
- А-00711 Покрытие пола (линолеум) (no_candidate; neighbors: none 0)
- А-00714 Водосток 2110-2112 (no_candidate; neighbors: none 0)
- А-00718 Мячик-дезодорант (1 шт) (no_candidate; neighbors: none 0)
- А-00723 Автопарфюм 7 мл (no_candidate; neighbors: none 0)
- А-00726 Бокс 2101-07 Люкс (no_candidate; neighbors: none 0)
- А-00735 Арки колёс 2109 пластмассовые (4 шт) (no_candidate; neighbors: none 0)
- А-00747 Полировочная машина (220 V) (no_candidate; neighbors: none 0)
- А-00775 А-00775 (no_candidate; neighbors: none 0)
- А-00792 Наждачный круг (на липучке) (no_candidate; neighbors: none 0)
- А-00814 Сопло обдува салона 2110 (центр.) (no_candidate; neighbors: none 0)
- А-00817 Ремни безопасности 2101-07 (2 шт) (negative_evidence; neighbors: none 0)
- А-00825 Арки крыла 2141 декоративные (4 шт) (no_candidate; neighbors: none 0)
- А-00842 "Bremax" WB-6055 РТ Щетки с/о 60+55 Volvo (no_candidate; neighbors: none 0)
- А-00894 Рысь (большая) (no_candidate; neighbors: none 0)
- А-00896 Опора полки 2108 (2 шт) (no_candidate; neighbors: none 0)
- А-00918 Поросенок (большой) (no_candidate; neighbors: none 0)
- А-00922 Часы на стекло (no_candidate; neighbors: none 0)
- А-00929 "Bremax" WB-6040 PBN Щетки с/о 60+40 VW Po (no_candidate; neighbors: none 0)
- А-00936 Стакан (нержавейка) (no_candidate; neighbors: none 0)
- А-00938 Часы 2106 с синей подсветкой (no_candidate; neighbors: none 0)
- А-00946 Мышь музыкальная (no_candidate; neighbors: none 0)
- А-00976 Перчатка полировочная (no_candidate; neighbors: none 0)
- А-00979 Вентилятор "Valgo" (no_candidate; neighbors: none 0)

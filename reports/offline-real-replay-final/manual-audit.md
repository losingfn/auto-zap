# Manual Audit

Generated: 2026-07-18T21:55:23.064Z

## Summary

Fully manual residual: 1813.
GROUP_REVIEW products: 1504.
GROUP_REVIEW groups: 466.
Largest group size: 38.

## Residual Reasons

| Reason | Count | Share | Examples |
| --- | ---: | ---: | --- |
| name_lacks_destination_context | 577 | 0.3183 | А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141 |
| active_analogs_conflict_or_no_destination | 445 | 0.2454 | А-00004 Вентилятор ALCO; А-00369 Люк; А-00370 Скоба д.16; А-00573 Прожектор |
| potentially_automatable_future_context_rules | 262 | 0.1445 | А-01206 Отбойник УАЗ-Патриот СА-пласт.; А-02317 Упор (башмак) противооткатный AVS SM-01; ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00452 Бак 21073 инжектор |
| unique_singleton_or_no_active_analogs | 187 | 0.1031 | А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха; А-02368 Накидки Фронт "ICEBERG FRONT"черный/черный/красный 26190; Б-00004 Буфер перед. н/о 3 2803010-53205 |
| technical_insufficient_data | 180 | 0.0993 | А-00543 "КОТО" Разветвитель двойной 201; А-00703 Такси; А-00775 А-00775; А-01370 А-01370 |
| no_allowed_target_current_taxonomy | 162 | 0.0894 | А-00176 Адаптер "Samsung" USB (оригинал); А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая) |

## Residual Families

| Family | Count | Useful context | Active analogs | Irreducible | Reason | Examples |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Generic fasteners without destination | 428 | 5 | 806 | 428 | name_lacks_destination_context | ЗЧМ-00588 Болт крышки в/очистителя 2141; К-00001 Гайка м 8 сапуна ВАЗ 01-07; К-00151 Болт М 5 малый крест; К-00620 Хомут норма 170*190 |
| Unique low-frequency items | 187 | 19 | 0 | 187 | unique_singleton_or_no_active_analogs | А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха; А-02368 Накидки Фронт "ICEBERG FRONT"черный/черный/красный 26190; Б-00004 Буфер перед. н/о 3 2803010-53205 |
| Short/code-only names | 175 | 0 | 0 | 175 | technical_insufficient_data | А-00703 Такси; А-00775 А-00775; А-01370 А-01370; А-01393 А-01393 |
| Ambiguous fittings and connectors | 155 | 18 | 322 | 155 | active_analogs_conflict_or_no_destination | А-01725 Переходник с 220V на USB; Г-00029 Тройник КАМАЗ Евро; ЗЧМ-00062 Тройник патрубков Москвич; ЗЧМ-00109 Тройник головки Москвич |
| Engine/transmission parts with partial context | 109 | 34 | 1607 | 109 | potentially_automatable_future_context_rules | ЗЧМ-00186 Крышка поддона Москвич; ЗЧМ-00212 Поддон картера 2140; ЗЧМ-00263 Набор иголок коробки Москвич; ЗЧМ-00276 Синхронизатор в сборе 2141 |
| DIN/socket-head fasteners without public target | 86 | 0 | 39 | 86 | no_allowed_target_current_taxonomy | К-00284 Гровер М-8; КГ-00431 DIN912 M10*11 с внутренним шестигранником; К-00004 Гайка. М 6 самоконтрящая ВАЗ; К-00005 Гайка. М 8 самоконтрящая ВАЗ |
| Body/interior fragments without stable target | 64 | 12 | 326 | 64 | active_analogs_conflict_or_no_destination | А-00369 Люк; А-00726 Бокс 2101-07 Люкс; А-00896 Опора полки 2108 (2 шт); А-01211 Накладка на воздухозаборник 2110 (краш.) |
| Mounting/installation kits without destination target | 45 | 4 | 347 | 45 | name_lacks_destination_context | А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; К-00664 Набор крепл. продольн. верх. штанги стаб.-; К-00665 Набор крепл. продол. ниж. штанги стаб.-ра; КГ-00076 Болт крепления чашек ГАЗ |
| Small body/interior parts with weak context | 36 | 1 | 761 | 36 | active_analogs_conflict_or_no_destination | А-00370 Скоба д.16; А-01774 Скоба троса 12 мм; А-01775 Скоба троса 15 мм; ИН-00448 Фиксатор |
| Body locks/handles/glass mechanisms with partial context | 34 | 8 | 1073 | 34 | active_analogs_conflict_or_no_destination | А-02202 Ручки 2106 перед. н/о, 2 шт; ИН-00421 Стекло; О-00696 ВАЗ 2111 стекло з.д.о прав.; РДГ-00065 Тройник ручки УАЗ |
| Hoses and tubes without system | 31 | 31 | 1247 | 31 | name_lacks_destination_context | Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141; Р-00043 Шланги воздушные прицепа |
| Rings and seals without destination | 29 | 0 | 508 | 29 | active_analogs_conflict_or_no_destination | ЗЧМ-00629 Кольцо гильз Москвич 1.7 (к-т 4 шт); ИН-00288 29752F [N90765301] кольцо уплотнит. сист; ОК-00284 Кольцо грязезащитное внутреннее ОКА; РГ-00207 Кольцо резиновое д. 80 |
| Suspension/steering parts with partial context | 28 | 1 | 998 | 28 | potentially_automatable_future_context_rules | А-01206 Отбойник УАЗ-Патриот СА-пласт.; ЗЧМ-00151 Маятник Москвич 2140; ИН-00812 Отбойник NSHBB10RR; КР-00140 Кронштейн руля ВАЗ |
| Chassis mounts/supports with partial context | 27 | 0 | 403 | 27 | potentially_automatable_future_context_rules | А-02317 Упор (башмак) противооткатный AVS SM-01; ЗЧМ-00473 Чашки стоек; ЗЧМ-00495 Рем. комплект зад. балки 2141; ИН-00557 Подушка двиг.NMN16RH,NM B15F |
| Personal/non-catalog accessories | 26 | 0 | 14 | 26 | no_allowed_target_current_taxonomy | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая); А-00502 Брелок |
| Driver electronics and diagnostics without stable target | 25 | 0 | 53 | 25 | active_analogs_conflict_or_no_destination | А-01058 Рация "АЛАН-100"; А-01099 Рация "Мега-Джет" 300,100; А-01159 Рация "Алан-48 плюс"; А-01437 Рация OPTIM 270 |
| Repair kits without destination system | 25 | 6 | 458 | 25 | name_lacks_destination_context | ИН-01115 07003С Рем. к-т направл.; КР-00571 К-т фланцев ремонтный в сб. D45 СВД; РГ-00008 Рем.к-т подъёмника ЗИЛ 5-ти шток., силико; РГ-00092 Ремкомплект гидроподъёмника ЗИЛ |
| Engine small parts with partial context | 24 | 10 | 620 | 24 | potentially_automatable_future_context_rules | ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105; КГ-00746 Палец толкателя ГЦС; ОК-00109 Втулка скобы |
| Wheel/tire accessories with partial context | 24 | 15 | 408 | 24 | active_analogs_conflict_or_no_destination | А-01623 Мешки для колес 4 шт; А-02071 Колпачок для дисков VESTA, 1 шт; А-02083 Колпачки дисков VESTA 17 крашеные, 4 шт; А-02323 Литиевая дисковая батарейка GP Lithium CR2025, за 1 шт |
| Starter/ignition electrical parts with partial context | 21 | 0 | 200 | 21 | potentially_automatable_future_context_rules | ЗЧМ-00447 Бендикс Москвич 2141; ЗЧМ-00636 Втягивающее ЗАЗ; ОК-00151 Втягивающие ОКА; ДВ-00040 Втулка грибка трамблера |
| Exterior/decor body items with partial context | 19 | 0 | 487 | 19 | potentially_automatable_future_context_rules | ДВ-00452 Бак 21073 инжектор; ДВ-00453 Бак 2104 инжектор; ЗЧМ-00496 Пыльник бака 2141; А-00040 Закат крыла |
| Caps, covers and plugs without destination | 18 | 2 | 403 | 18 | name_lacks_destination_context | К-00457 Заглушка под мовиль (пластмасса); А-01561 Заглушка-удлинитель ремня; А-02301 Заглушка-переходник ремня (с логотипом) 1 шт; ДВ-00432 Заглушка вместо трамб. 2108 |
| Driveline/axle/differential parts with partial context | 18 | 0 | 278 | 18 | potentially_automatable_future_context_rules | ЗЧМ-00490 Комплект саттелитов 2140; ОК-00219 Подушка шарнира; Р-00015 Ось саттелитов в сборе ЗАЗ (к-т); Р-00023 Пыльник торсиона ЗАЗ (за 1 шт) |
| Fans and thermal/ventilation parts without stable target | 18 | 0 | 147 | 18 | active_analogs_conflict_or_no_destination | А-00004 Вентилятор ALCO; А-00979 Вентилятор "Valgo"; А-01983 Подстаканник на воздуховод; К-00422 Заглушка воздуховода 2110 |
| Vehicle-model-only or legacy part without function | 17 | 3 | 5154 | 17 | name_lacks_destination_context | ЗЧМ-00338 Вакуум Москвич 412; ЗЧМ-00440 Жаровня Москвич; ОК-00115 Подставка ОКА длинная; ОК-00317 Бархотки стекол ОКА |
| Travel/storage/covers without stable target | 16 | 0 | 95 | 16 | no_allowed_target_current_taxonomy | А-00711 Покрытие пола (линолеум); А-01378 Сумка-холодильник (термо); А-01477 Сумка кожа; А-01591 Тент SEEP большой |
| Lighting/signal devices without stable target | 14 | 1 | 422 | 14 | active_analogs_conflict_or_no_destination | А-00573 Прожектор; А-01885 Сигнал "VOLVO"; О-00710 Габаритные огни диодные. 2 шт; А-00282 Сигналы "GMP" нов. обр. |
| Optics/glass parts with partial context | 14 | 7 | 245 | 14 | potentially_automatable_future_context_rules | О-00041 LED Рено ближ./дальн. свет; О-00547 Блок-фары прав./лев. 2110 (г. Тольятти); О-00676 Светомаскировка для грузовых авто (кт 2шт); О-00706 К-т ходовых огней Ларгус |
| Tube/line mounts without system | 13 | 8 | 2 | 13 | name_lacks_destination_context | Г-00064 Гусёк 31029 короткий; Г-00065 Гусёк 2410 длинный; Г-00090 Гусек короткий Волга 3110; Г-00094 Гусек 3102 длинный |
| Consumer phone/power accessories | 12 | 0 | 43 | 12 | no_allowed_target_current_taxonomy | А-00176 Адаптер "Samsung" USB (оригинал); А-02247 Батарейки "REXANT" (за 1 шт); А-02276 Зарядка для i-phone 323; А-00063 Алкалиновые батарейки (за 2 шт.)GP Super high Tech Alkaline 15А АА, 24А АА |
| Novelty/souvenir non-catalog goods | 12 | 0 | 12 | 12 | no_allowed_target_current_taxonomy | А-00526 Обезьяна на присоске; А-00718 Мячик-дезодорант (1 шт); А-00894 Рысь (большая); А-00918 Поросенок (большой) |
| Cleaning/wiper accessories without stable target | 11 | 6 | 247 | 11 | active_analogs_conflict_or_no_destination | А-00121 Щётка для сметания пыли; А-00175 Щётка с губкой; А-02061 AWM Щетка зимняя; А-02074 Щетка зимняя AWM 55см, 61см |
| Cabin comfort/universal accessories without stable target | 11 | 0 | 211 | 11 | active_analogs_conflict_or_no_destination | А-01338 Часы большие (на батарейке); ЗЧМ-00094 Часы 2141; А-00141 Часы 2110 (тюнинг); А-00151 Шторки |
| Car-care consumables without stable target | 10 | 1 | 178 | 10 | active_analogs_conflict_or_no_destination | А-00616 Аппликатор "Доктор ВАКС"; А-02106 DW8677 Тонкая ткань для полировки кузова; А-00167 Наждачная бумага №220,240,280,400,600,800,; А-00168 Наждачная бумага N 2000 |
| Tools and road equipment without stable target | 8 | 1 | 754 | 8 | active_analogs_conflict_or_no_destination | А-01292 Нож дорожный; А-02377 Струна "Автодело" 40686, 2 шт; КГ-00287 Насадка на шланг подкачки; А-01146 Лопата для снега (малая) |
| Miscellaneous universal non-catalog goods | 6 | 0 | 37 | 6 | no_allowed_target_current_taxonomy | А-00548 Тюнинг Нива-Тайга; А-00946 Мышь музыкальная; А-01613 Тарелочка магнитная для мелочей; А-01791 Отпугиватель грызунов 2206 |
| Electrical/consumer devices without auto context | 5 | 0 | 27 | 5 | technical_insufficient_data | А-00543 "КОТО" Разветвитель двойной 201; А-01460 Тепловентилятор автомобильный AVS Comfort ТЕ-310 12В (2 реж.) 150W; А-01522 KOTO EFB-211 Тепловентилятор; А-01560 Плитка газовая (маленькая) |
| Safety/reflective/emergency goods without stable target | 4 | 0 | 30 | 4 | no_allowed_target_current_taxonomy | А-01583 Браслеты для пешеходов светоотражающие; А-00834 Светоотражающая лента; А-01922 Лента светоотражающая 1 м; А-01949 Лента светоотражающая жёлтая (1 м) |
| Audio/radio/media accessories without stable target | 3 | 0 | 73 | 3 | active_analogs_conflict_or_no_destination | А-01332 "Банка" радио+флешка (воспроизв.); А-01650 Флешка 8 Гб; А-01687 USB флешка 32 Гб |
| Fluids/adhesives/chemicals without stable target | 2 | 0 | 427 | 2 | active_analogs_conflict_or_no_destination | А-00612 Лента клейкая армированная AVS 48мм * 10мм; А-02264 Лента клейкая армированная AVS 48мм*25мм |

## Group Review QA

Risky groups: 23.
Groups over 20 products: 7.
Groups over 50 products: 0.
Groups over 100 products: 0.

Operator should confirm each group target, inspect outliers listed in `group-review-audit.csv`, and split or reject any group with non-empty risk flags.

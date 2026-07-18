# Manual Audit

Generated: 2026-07-18T23:13:55.704Z

## Summary

Fully manual residual: 1159.
GROUP_REVIEW products: 1273.
GROUP_REVIEW groups: 393.
Largest group size: 38.

## Residual Reasons

| Reason | Count | Share | Examples |
| --- | ---: | ---: | --- |
| active_analogs_conflict_or_no_destination | 304 | 0.2623 | А-00004 Вентилятор ALCO; А-00369 Люк; А-00573 Прожектор; А-00616 Аппликатор "Доктор ВАКС" |
| potentially_automatable_future_context_rules | 194 | 0.1674 | А-01206 Отбойник УАЗ-Патриот СА-пласт.; А-02317 Упор (башмак) противооткатный AVS SM-01; ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00452 Бак 21073 инжектор |
| unique_singleton_or_no_active_analogs | 185 | 0.1596 | А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха; А-02368 Накидки Фронт "ICEBERG FRONT"черный/черный/красный 26190; Б-00004 Буфер перед. н/о 3 2803010-53205 |
| technical_insufficient_data | 180 | 0.1553 | А-00543 "КОТО" Разветвитель двойной 201; А-00703 Такси; А-00775 А-00775; А-01370 А-01370 |
| name_lacks_destination_context | 174 | 0.1501 | А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141 |
| no_allowed_target_current_taxonomy | 122 | 0.1053 | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая); А-00502 Брелок |

## Residual Families

| Family | Count | Useful context | Active analogs | Irreducible | Reason | Examples |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Unique low-frequency items | 185 | 19 | 0 | 185 | unique_singleton_or_no_active_analogs | А-01896 Проставки 6х9 с накладкой; А-02230 Груша для откачки воздуха; А-02368 Накидки Фронт "ICEBERG FRONT"черный/черный/красный 26190; Б-00004 Буфер перед. н/о 3 2803010-53205 |
| Short/code-only names | 175 | 0 | 0 | 175 | technical_insufficient_data | А-00703 Такси; А-00775 А-00775; А-01370 А-01370; А-01393 А-01393 |
| Engine/transmission parts with partial context | 71 | 27 | 1607 | 71 | potentially_automatable_future_context_rules | ЗЧМ-00186 Крышка поддона Москвич; ЗЧМ-00212 Поддон картера 2140; ЗЧМ-00263 Набор иголок коробки Москвич; ЗЧМ-00276 Синхронизатор в сборе 2141 |
| Body/interior fragments without stable target | 62 | 12 | 326 | 62 | active_analogs_conflict_or_no_destination | А-00369 Люк; А-00726 Бокс 2101-07 Люкс; А-00896 Опора полки 2108 (2 шт); А-01211 Накладка на воздухозаборник 2110 (краш.) |
| Generic fasteners without destination | 60 | 23 | 806 | 60 | name_lacks_destination_context | КГ-00601 Шпилька приемной трубы ЗИЛ-130; ЗЧМ-00376 Хомуты приемной трубы 2141; ЗЧМ-00507 Хомут приёмной трубы (Святогор); К-00015 Гайка М 8 д. приёмной трубы ВАЗ 01-08 |
| Ambiguous fittings and connectors | 52 | 41 | 322 | 52 | active_analogs_conflict_or_no_destination | КГ-01086 Соединитель шлангов Г-образный метал. д.1; ИН-00171 Штуцер прокачки М6*1*29 (AUDI,BMW,SAABVW); ИН-00172 Штуцер прокачки М6*1*38 (AUDI,SUBARU,VW); ИН-00173 Штуцер прокачки М8*1*32 (FORD,MAZDA) |
| DIN/socket-head fasteners without public target | 48 | 0 | 39 | 48 | no_allowed_target_current_taxonomy | К-00284 Гровер М-8; КГ-00431 DIN912 M10*11 с внутренним шестигранником; К-00565 Гровер 5; КГ-00272 Гровер М 14 |
| Small body/interior parts with weak context | 37 | 11 | 761 | 37 | active_analogs_conflict_or_no_destination | К-00611 Набор пистонов ВАЗ-Калина 1118; КГ-00739 Скоба троса газа 402 дв.; ИН-00935 Планка распорная Логан 7701208112; К-00189 Пистоны |
| Hoses and tubes without system | 31 | 31 | 1247 | 31 | name_lacks_destination_context | Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141; Р-00043 Шланги воздушные прицепа |
| Body locks/handles/glass mechanisms with partial context | 29 | 7 | 1073 | 29 | active_analogs_conflict_or_no_destination | А-02202 Ручки 2106 перед. н/о, 2 шт; ИН-00421 Стекло; О-00696 ВАЗ 2111 стекло з.д.о прав.; РДГ-00065 Тройник ручки УАЗ |
| Personal/non-catalog accessories | 26 | 0 | 14 | 26 | no_allowed_target_current_taxonomy | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая); А-00502 Брелок |
| Driver electronics and diagnostics without stable target | 25 | 0 | 53 | 25 | active_analogs_conflict_or_no_destination | А-01058 Рация "АЛАН-100"; А-01099 Рация "Мега-Джет" 300,100; А-01159 Рация "Алан-48 плюс"; А-01437 Рация OPTIM 270 |
| Repair kits without destination system | 23 | 6 | 458 | 23 | name_lacks_destination_context | ИН-01115 07003С Рем. к-т направл.; КР-00571 К-т фланцев ремонтный в сб. D45 СВД; РГ-00008 Рем.к-т подъёмника ЗИЛ 5-ти шток., силико; РГ-00092 Ремкомплект гидроподъёмника ЗИЛ |
| Engine small parts with partial context | 22 | 10 | 620 | 22 | potentially_automatable_future_context_rules | ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105; КГ-00746 Палец толкателя ГЦС; ОК-00181 Втулка верхней опоры Ока |
| Wheel/tire accessories with partial context | 22 | 15 | 408 | 22 | active_analogs_conflict_or_no_destination | А-01623 Мешки для колес 4 шт; А-02071 Колпачок для дисков VESTA, 1 шт; А-02083 Колпачки дисков VESTA 17 крашеные, 4 шт; А-02323 Литиевая дисковая батарейка GP Lithium CR2025, за 1 шт |
| Chassis mounts/supports with partial context | 20 | 0 | 403 | 20 | potentially_automatable_future_context_rules | А-02317 Упор (башмак) противооткатный AVS SM-01; ЗЧМ-00473 Чашки стоек; ЗЧМ-00495 Рем. комплект зад. балки 2141; ИН-00557 Подушка двиг.NMN16RH,NM B15F |
| Mounting/installation kits without destination target | 20 | 3 | 347 | 20 | name_lacks_destination_context | А-02289 Стяжка 8 мм х 60 см (2 шт) AVS TL-05; К-00664 Набор крепл. продольн. верх. штанги стаб.-; К-00665 Набор крепл. продол. ниж. штанги стаб.-ра; А-01829 Секретки для номеров |
| Suspension/steering parts with partial context | 19 | 1 | 998 | 19 | potentially_automatable_future_context_rules | А-01206 Отбойник УАЗ-Патриот СА-пласт.; ЗЧМ-00151 Маятник Москвич 2140; ИН-00812 Отбойник NSHBB10RR; ХСГ-00564 Гидроусилитель руля УАЗ-469 в сборе |
| Exterior/decor body items with partial context | 18 | 0 | 487 | 18 | potentially_automatable_future_context_rules | ДВ-00452 Бак 21073 инжектор; ДВ-00453 Бак 2104 инжектор; ЗЧМ-00496 Пыльник бака 2141; А-00040 Закат крыла |
| Caps, covers and plugs without destination | 18 | 2 | 403 | 18 | name_lacks_destination_context | К-00457 Заглушка под мовиль (пластмасса); А-01561 Заглушка-удлинитель ремня; А-02301 Заглушка-переходник ремня (с логотипом) 1 шт; ДВ-00432 Заглушка вместо трамб. 2108 |
| Vehicle-model-only or legacy part without function | 17 | 3 | 5154 | 17 | name_lacks_destination_context | ЗЧМ-00338 Вакуум Москвич 412; ЗЧМ-00440 Жаровня Москвич; ОК-00115 Подставка ОКА длинная; ОК-00317 Бархотки стекол ОКА |
| Fans and thermal/ventilation parts without stable target | 16 | 0 | 147 | 16 | active_analogs_conflict_or_no_destination | А-00004 Вентилятор ALCO; А-00979 Вентилятор "Valgo"; А-01983 Подстаканник на воздуховод; К-00422 Заглушка воздуховода 2110 |
| Starter/ignition electrical parts with partial context | 15 | 0 | 200 | 15 | potentially_automatable_future_context_rules | ЗЧМ-00447 Бендикс Москвич 2141; ЗЧМ-00636 Втягивающее ЗАЗ; ОК-00151 Втягивающие ОКА; ДВ-00040 Втулка грибка трамблера |
| Travel/storage/covers without stable target | 15 | 0 | 95 | 15 | no_allowed_target_current_taxonomy | А-00711 Покрытие пола (линолеум); А-01378 Сумка-холодильник (термо); А-01477 Сумка кожа; А-01591 Тент SEEP большой |
| Driveline/axle/differential parts with partial context | 14 | 0 | 278 | 14 | potentially_automatable_future_context_rules | ЗЧМ-00490 Комплект саттелитов 2140; ОК-00219 Подушка шарнира; Р-00015 Ось саттелитов в сборе ЗАЗ (к-т); Р-00023 Пыльник торсиона ЗАЗ (за 1 шт) |
| Lighting/signal devices without stable target | 14 | 1 | 422 | 14 | active_analogs_conflict_or_no_destination | А-00573 Прожектор; А-01885 Сигнал "VOLVO"; О-00710 Габаритные огни диодные. 2 шт; А-00282 Сигналы "GMP" нов. обр. |
| Optics/glass parts with partial context | 14 | 7 | 245 | 14 | potentially_automatable_future_context_rules | О-00041 LED Рено ближ./дальн. свет; О-00547 Блок-фары прав./лев. 2110 (г. Тольятти); О-00676 Светомаскировка для грузовых авто (кт 2шт); О-00706 К-т ходовых огней Ларгус |
| Novelty/souvenir non-catalog goods | 12 | 0 | 12 | 12 | no_allowed_target_current_taxonomy | А-00526 Обезьяна на присоске; А-00718 Мячик-дезодорант (1 шт); А-00894 Рысь (большая); А-00918 Поросенок (большой) |
| Cleaning/wiper accessories without stable target | 11 | 6 | 247 | 11 | active_analogs_conflict_or_no_destination | А-00121 Щётка для сметания пыли; А-00175 Щётка с губкой; А-02061 AWM Щетка зимняя; А-02074 Щетка зимняя AWM 55см, 61см |
| Cabin comfort/universal accessories without stable target | 11 | 0 | 211 | 11 | active_analogs_conflict_or_no_destination | А-01338 Часы большие (на батарейке); ЗЧМ-00094 Часы 2141; А-00141 Часы 2110 (тюнинг); А-00151 Шторки |
| Consumer phone/power accessories | 11 | 0 | 43 | 11 | no_allowed_target_current_taxonomy | А-02247 Батарейки "REXANT" (за 1 шт); А-02276 Зарядка для i-phone 323; А-00063 Алкалиновые батарейки (за 2 шт.)GP Super high Tech Alkaline 15А АА, 24А АА; А-01724 Пауэр Банк МВ 209 |
| Car-care consumables without stable target | 10 | 1 | 178 | 10 | active_analogs_conflict_or_no_destination | А-00616 Аппликатор "Доктор ВАКС"; А-02106 DW8677 Тонкая ткань для полировки кузова; А-00167 Наждачная бумага №220,240,280,400,600,800,; А-00168 Наждачная бумага N 2000 |
| Tools and road equipment without stable target | 9 | 2 | 754 | 9 | active_analogs_conflict_or_no_destination | А-01292 Нож дорожный; А-02377 Струна "Автодело" 40686, 2 шт; КГ-00287 Насадка на шланг подкачки; А-01146 Лопата для снега (малая) |
| Miscellaneous universal non-catalog goods | 6 | 0 | 37 | 6 | no_allowed_target_current_taxonomy | А-00548 Тюнинг Нива-Тайга; А-00946 Мышь музыкальная; А-01613 Тарелочка магнитная для мелочей; А-01791 Отпугиватель грызунов 2206 |
| Electrical/consumer devices without auto context | 5 | 0 | 27 | 5 | technical_insufficient_data | А-00543 "КОТО" Разветвитель двойной 201; А-01460 Тепловентилятор автомобильный AVS Comfort ТЕ-310 12В (2 реж.) 150W; А-01522 KOTO EFB-211 Тепловентилятор; А-01560 Плитка газовая (маленькая) |
| Tube/line mounts without system | 5 | 0 | 2 | 5 | name_lacks_destination_context | Г-00064 Гусёк 31029 короткий; Г-00065 Гусёк 2410 длинный; Г-00090 Гусек короткий Волга 3110; Г-00094 Гусек 3102 длинный |
| Safety/reflective/emergency goods without stable target | 4 | 0 | 30 | 4 | no_allowed_target_current_taxonomy | А-01583 Браслеты для пешеходов светоотражающие; А-00834 Светоотражающая лента; А-01922 Лента светоотражающая 1 м; А-01949 Лента светоотражающая жёлтая (1 м) |
| Audio/radio/media accessories without stable target | 3 | 0 | 73 | 3 | active_analogs_conflict_or_no_destination | А-01332 "Банка" радио+флешка (воспроизв.); А-01650 Флешка 8 Гб; А-01687 USB флешка 32 Гб |
| Fluids/adhesives/chemicals without stable target | 2 | 0 | 427 | 2 | active_analogs_conflict_or_no_destination | А-00612 Лента клейкая армированная AVS 48мм * 10мм; А-02264 Лента клейкая армированная AVS 48мм*25мм |
| Fragrance/air-freshener goods without stable target | 1 | 0 | 0 | 1 | active_analogs_conflict_or_no_destination | А-00723 Автопарфюм 7 мл |

## Group Review QA

Risky groups: 44.
Groups over 20 products: 5.
Groups over 50 products: 0.
Groups over 100 products: 0.

Operator should confirm each group target, inspect outliers listed in `group-review-audit.csv`, and split or reject any group with non-empty risk flags.

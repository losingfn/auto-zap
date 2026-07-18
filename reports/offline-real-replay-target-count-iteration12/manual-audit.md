# Manual Audit

Generated: 2026-07-18T20:58:42.976Z

## Summary

Fully manual residual: 1813.
GROUP_REVIEW products: 1504.
GROUP_REVIEW groups: 466.
Largest group size: 38.

## Residual Reasons

| Reason | Count | Share | Examples |
| --- | ---: | ---: | --- |
| unique_singleton_or_no_active_analogs | 606 | 0.3343 | А-00004 Вентилятор ALCO; А-00526 Обезьяна на присоске; А-00548 Тюнинг Нива-Тайга; А-00616 Аппликатор "Доктор ВАКС" |
| name_lacks_destination_context | 496 | 0.2736 | Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00186 Крышка поддона Москвич; ЗЧМ-00235 Трубки магистр. 2141 |
| technical_insufficient_data | 344 | 0.1897 | А-00176 Адаптер "Samsung" USB (оригинал); А-00369 Люк; А-00370 Скоба д.16; А-00502 Брелок |
| active_analogs_conflict_or_no_destination | 236 | 0.1302 | А-00726 Бокс 2101-07 Люкс; А-01211 Накладка на воздухозаборник 2110 (краш.); А-01725 Переходник с 220V на USB; А-01774 Скоба троса 12 мм |
| no_allowed_target_current_taxonomy | 95 | 0.0524 | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая); А-00936 Стакан (нержавейка) |
| potentially_automatable_future_context_rules | 36 | 0.0199 | ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105; КГ-00746 Палец толкателя ГЦС; ОК-00109 Втулка скобы |

## Residual Families

| Family | Count | Useful context | Active analogs | Irreducible | Reason | Examples |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Unique low-frequency items | 606 | 92 | 0 | 606 | unique_singleton_or_no_active_analogs | А-00004 Вентилятор ALCO; А-00526 Обезьяна на присоске; А-00548 Тюнинг Нива-Тайга; А-00616 Аппликатор "Доктор ВАКС" |
| Generic fasteners without destination | 432 | 22 | 806 | 432 | name_lacks_destination_context | ЗЧМ-00588 Болт крышки в/очистителя 2141; К-00001 Гайка м 8 сапуна ВАЗ 01-07; К-00151 Болт М 5 малый крест; К-00341 Болт салазки сиденья 2110 |
| Short/code-only names | 336 | 1 | 0 | 336 | technical_insufficient_data | А-00369 Люк; А-00370 Скоба д.16; А-00502 Брелок; А-00511 Перчатки |
| Ambiguous fittings and connectors | 137 | 17 | 271 | 137 | active_analogs_conflict_or_no_destination | А-01725 Переходник с 220V на USB; Г-00029 Тройник КАМАЗ Евро; ЗЧМ-00062 Тройник патрубков Москвич; ЗЧМ-00109 Тройник головки Москвич |
| DIN/socket-head fasteners without public target | 77 | 0 | 39 | 77 | no_allowed_target_current_taxonomy | КГ-00431 DIN912 M10*11 с внутренним шестигранником; К-00004 Гайка. М 6 самоконтрящая ВАЗ; К-00005 Гайка. М 8 самоконтрящая ВАЗ; К-00019 Гайка М 10 д. шаг 1.25 самоконтр. |
| Small body/interior parts with weak context | 60 | 5 | 761 | 60 | active_analogs_conflict_or_no_destination | А-00726 Бокс 2101-07 Люкс; А-01211 Накладка на воздухозаборник 2110 (краш.); А-01774 Скоба троса 12 мм; А-01775 Скоба троса 15 мм |
| Rings and seals without destination | 39 | 0 | 508 | 39 | active_analogs_conflict_or_no_destination | ЗЧМ-00629 Кольцо гильз Москвич 1.7 (к-т 4 шт); ИН-00288 29752F [N90765301] кольцо уплотнит. сист; ОК-00284 Кольцо грязезащитное внутреннее ОКА; РГ-00207 Кольцо резиновое д. 80 |
| Engine small parts with partial context | 36 | 13 | 570 | 36 | potentially_automatable_future_context_rules | ДВ-00106 Клапан рециркуляции Нива в сборе; ДВ-00503 Клапан обратки 2105; КГ-00746 Палец толкателя ГЦС; ОК-00109 Втулка скобы |
| Hoses and tubes without system | 33 | 33 | 1247 | 33 | name_lacks_destination_context | Г-00595 Патрубок КАМАЗ-ЕВРО прием. ТКР корот. пр. (завод); ДВ-00603 Трубка пластмассовая Лада-Гранта 2190; ЗЧМ-00235 Трубки магистр. 2141; КГ-00287 Насадка на шланг подкачки |
| Caps, covers and plugs without destination | 31 | 10 | 403 | 31 | name_lacks_destination_context | ЗЧМ-00186 Крышка поддона Москвич; К-00422 Заглушка воздуховода 2110; К-00457 Заглушка под мовиль (пластмасса); А-00460 Заглушка бокса 2107 нижняя |
| Personal/non-catalog accessories | 18 | 0 | 14 | 18 | no_allowed_target_current_taxonomy | А-00246 Смайлики силикон, 4 шт; А-00278 Собака маленькая; А-00404 Собака (очень большая); А-00936 Стакан (нержавейка) |
| Electrical/consumer devices without auto context | 8 | 0 | 27 | 8 | technical_insufficient_data | А-00176 Адаптер "Samsung" USB (оригинал); А-00543 "КОТО" Разветвитель двойной 201; А-01460 Тепловентилятор автомобильный AVS Comfort ТЕ-310 12В (2 реж.) 150W; А-01522 KOTO EFB-211 Тепловентилятор |

## Group Review QA

Risky groups: 23.
Groups over 20 products: 7.
Groups over 50 products: 0.
Groups over 100 products: 0.

Operator should confirm each group target, inspect outliers listed in `group-review-audit.csv`, and split or reject any group with non-empty risk flags.

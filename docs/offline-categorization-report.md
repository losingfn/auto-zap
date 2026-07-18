# Offline categorization report

Дата финального локального прогона: 2026-07-18.

Проверка выполнена только offline по `data/import-samples/catalog.xls`, лист `TDSheet`. Production-БД, production Meilisearch, импорт, деплой и конфиги не использовались. Локальная PostgreSQL по `postgres://autozap:autozap@localhost:5432/autozap` недоступна (`ECONNREFUSED`), поэтому fixture измерен как all-as-new без вычитания уже существующих активных товаров.

## Что изменено

- Добавлен нормализатор названий и технических токенов: `T10`, `W5W`, `H7`, `12V`, `DOT4`, `5W-30`, сокращения `рем.к-т`, `масл.`, `торм.`, `б/датчика`.
- Добавлен версионированный доменный словарь и deterministic pipeline с решениями `AUTO_READY`, `GROUP_REVIEW`, `MANUAL_REVIEW`, `BLOCKED_CONFLICT`, `INVALID_INPUT`.
- Исправлено опасное substring-сопоставление: например, `компрессор` больше не матчится как `рессор`.
- `GROUP_REVIEW` остаётся `needsReview=true` и не автопубликуется.
- Search ranking для технических токенов требует точного match: `T10` больше не совпадает с артикулом `T1001`; `лампа t10` требует ламповый предметный сигнал.
- Offline-отчёт генерирует CSV/JSON артефакты для ревью и калибровки.

## Метрики

| Метрика | Baseline | После |
| --- | ---: | ---: |
| Product candidates | 30690 | 30690 |
| AUTO_READY / would auto publish | 8306 | 13464 |
| GROUP_REVIEW products | - | 13163 |
| GROUP_REVIEW groups | - | 260 |
| Fully manual residual | 22384 | 4063 |
| BLOCKED_CONFLICT | - | 53 |
| Manual reduction share | - | 86.76% |
| Average confidence | - | 0.799 |
| Peak RSS | - | 412 MB |

Baseline взят из первого локального `import:check`/`categorization:check` по тому же fixture. После изменения старые diagnostic-счётчики `wouldAutoPublish` считают только `needsReview=false`, чтобы не смешивать автопубликацию и групповое подтверждение.

## Acceptance status

Целевой диапазон `fully manual 300-900` на доступном fixture не достигнут: финальное значение `4063`.

Причина не в конфликтной логике: `BLOCKED_CONFLICT` снижен до `53`. Остаток почти полностью состоит из строк без безопасного target в текущей публичной таксономии:

| Причина | Кол-во |
| --- | ---: |
| no_candidate | 3650 |
| weak_candidate | 360 |
| close_candidates | 35 |
| negative_evidence | 18 |

Топ residual-токены: `болт`, `гайка`, `кольцо`, `фитинг`, `шайба`, `штуцер`, `шпилька`, `хомут`, `ремкомплект`, `заглушка`. Для них нет новой категории и намеренно не добавлен `Крепёж`; назначение в случайные публичные разделы ухудшило бы качество каталога.

## Search regression

Локальный fixture после изменений:

- `лампа t10`: 5 кандидатов, все top-5 в `Электрика / Лампы`, первые результаты `Лампа диодная Т10` и `Лампа ... T10 ... W5W`.
- `t10`: шина `T1001` исключена; top-2 — лампы T10, инструмент TORX ниже.
- `лампа w5w`: top-5 — лампы.

## Артефакты

- `reports/offline-categorization/after-summary.json`
- `reports/offline-categorization/report.md`
- `reports/offline-categorization/group-proposals.csv`
- `reports/offline-categorization/manual-sample.csv`
- `reports/offline-categorization/residual-review.json`
- `reports/offline-categorization/category-conflicts.csv`
- `reports/offline-categorization/confidence-calibration.csv`

## PR notes

Draft PR summary:

- deterministic categorization pipeline with explainable statuses and domain families;
- safe review grouping without auto-publishing group candidates;
- exact technical-token search regression for `T10/W5W`;
- offline reporting script and regression tests;
- no production config, DB, Meilisearch, import, deploy, backup, cron or SSL changes.

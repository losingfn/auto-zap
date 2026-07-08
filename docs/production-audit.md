# Production audit

Дата аудита: 2026-07-04.

## 1. Критические ошибки

Критических ошибок, требующих изменения бизнес-логики, не обнаружено.

Исправлено в рамках production-подготовки:

- добавлен `src/app/error.tsx`;
- добавлен `src/app/global-error.tsx`;
- добавлены базовые security headers в `next.config.mjs`;
- подготовлен PM2 ecosystem config;
- подготовлен Nginx-шаблон;
- подготовлена инструкция backup и восстановления;
- добавлен `scripts/with-env.sh`, чтобы CLI-команды надёжно читали `.env` на сервере.

## 2. Средние проблемы

### Нет явного production error boundary

До аудита в `src/app` не было `error.tsx` и `global-error.tsx`. При runtime error пользователь мог увидеть стандартную ошибку Next.js. Добавлены аккуратные fallback-страницы.

### Production-деплой был описан преимущественно через Docker

В проекте уже есть Dockerfile и docker-compose, но целевой стек для VPS указан как PM2 + Nginx. Добавлены:

- `ecosystem.config.cjs`;
- `deploy/nginx/autozap.conf`;
- обновлённый `docs/deployment.md`;
- `DEPLOY_CHECKLIST.md`.

### Backup был недостаточно формализован

Добавлены:

- `deploy/scripts/backup-postgres.sh`;
- `docs/production-backup.md`;
- cron-пример;
- инструкция восстановления через `pg_restore`.

## 3. Мелкие улучшения

- `.env.example` приведён к production-шаблону без реальных секретов.
- Добавлен `pnpm start:prod`.
- `pnpm lint` переведён с устаревшего `next lint` на `eslint .`.
- `eslint-config-next` удалён из dev-зависимостей: вместо него используется прямой flat config на `@eslint/js`, `@next/eslint-plugin-next` и `@typescript-eslint/*`, чтобы избежать runtime-сбоя `@rushstack/eslint-patch` с ESLint 9.
- Добавлены security headers:
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy`;
  - `X-Frame-Options: SAMEORIGIN`.
- CSP намеренно не добавлен, чтобы не сломать Яндекс.Карту, внешние map URL и админские загрузки без отдельного этапа тестирования.

## 4. Проверенные зоны риска

### Runtime fallback

Главная использует fallback-контент при ошибке БД. Каталог использует timeout/fallback для публичных списков. Sitemap ловит ошибку БД и возвращает базовый список.

### Админ-сессии

Cookie:

- `httpOnly`;
- `sameSite: lax`;
- `secure` в production;
- подпись через HMAC;
- production требует `SESSION_SECRET` длиной не менее 32 символов.

### Listeners и lightbox

Клиентские listeners в lightbox удаляются в cleanup. Фасадный lightbox сохраняет позицию прокрутки и восстанавливает `body overflow`.

### Поиск

Главный поиск использует `encodeURIComponent` и обрабатывает пустой запрос без reload. Публичный поиск имеет fallback на PostgreSQL при проблемах с Meilisearch.

### Импорт Excel

Импорт использует предварительный анализ, draft-версию и ручную публикацию. Проверка `pnpm import:check data/import-samples/catalog.xls` остаётся обязательной перед релизом.

## 5. Что ещё желательно сделать после покупки VPS

1. Настроить внешний мониторинг uptime.
2. Настроить offsite backup: S3-compatible storage, Яндекс Object Storage или отдельный сервер.
3. Проверить Lighthouse уже на реальном HTTPS-домене.
4. При необходимости добавить CSP отдельным этапом после теста Яндекс.Карты и админки.
5. Проверить восстановление backup на тестовой БД.
6. Настроить alerts по заполнению диска.
7. Ограничить SSH по ключам и отключить password login.

## 6. Ограничения аудита

- Полноценный Lighthouse и нагрузочный тест требуют запущенного production-домена или отдельного staging.
- CSP не включён автоматически, потому что карта и внешние маршруты требуют аккуратной политики.
- Docker не выбран основным production-путём, но существующая поддержка Docker сохранена.

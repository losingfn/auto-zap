# Автозапчасти на Салтыкова-Щедрина

Production-ready сайт-каталог магазина автозапчастей в Талдоме.

Проект включает публичную главную страницу, каталог `Главная -> Категория -> Подкатегория -> Товар`, поиск, Excel-импорт прайс-листа, защищенную админ-панель, управление контентом, карту, вакансии, SEO, sitemap и robots.

## Стек

- Next.js 15
- TypeScript
- Tailwind CSS
- PostgreSQL
- Meilisearch
- Node.js 22 LTS
- pnpm

Production-рекомендация для VPS: Ubuntu 24.04 LTS, PostgreSQL и Meilisearch как системные сервисы или локальные сервисы, Next.js через PM2, Nginx reverse proxy, SSL через Let's Encrypt.

Docker Compose в проекте есть и подходит для локального окружения или контейнерного деплоя, но основной сценарий production описан через PM2 + Nginx: так проще обслуживать сайт на небольшом VPS и отдельно контролировать PostgreSQL backup.

## Быстрый локальный запуск

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres meilisearch
pnpm db:migrate
pnpm db:seed
pnpm admin:create -- --email admin@example.ru --password "StrongPassword123" --name "Администратор" --role owner
pnpm dev
```

Сайт: `http://localhost:3000`

Админка: `http://localhost:3000/admin/login`

## Переменные окружения

Создайте `.env` вручную на основе `.env.example`.

Минимум для production:

- `APP_URL=https://autozapchast-taldom.ru`;
- `NODE_ENV=production`;
- `DATABASE_URL` для PostgreSQL базы `autozap`;
- `IMPORT_STORAGE_ROOT=/var/www/autozap` для shared persistent-хранилища Excel-импортов;
- `MEILI_HOST=http://127.0.0.1:7700` или фактический локальный адрес Meilisearch;
- `MEILI_MASTER_KEY`;
- `SESSION_SECRET`;
- `YANDEX_MAPS_API_KEY`, если используется.

Важное:

- не храните реальные пароли в `.env.example`;
- `SESSION_SECRET` должен быть не короче 32 случайных символов;
- `MEILI_MASTER_KEY` должен быть длинным случайным ключом;
- `APP_URL` нужен для Open Graph, sitemap и абсолютных URL;
- `YANDEX_MAPS_API_KEY` можно оставить пустым: сайт покажет fallback-карту с кнопками маршрута.
- значения в `.env` должны быть shell-safe; если в секрете есть пробелы или спецсимволы, оберните значение в одинарные кавычки.

## Команды

```bash
pnpm dev                         # локальный dev-сервер
pnpm lint                        # ESLint
pnpm typecheck                   # проверка TypeScript
pnpm build                       # production build
pnpm start                       # standalone Next.js server
pnpm start:prod                  # standalone server на 127.0.0.1:3000
pnpm db:migrate                  # применить SQL-миграции
pnpm db:seed                     # заполнить категории, правила и синонимы
pnpm admin:create -- --email ... # создать или обновить администратора
pnpm import:check data/import-samples/catalog.xls
pnpm search:sync                 # пересобрать Meilisearch индекс
```

`pnpm start` и `pnpm start:prod` запускают standalone-сервер вручную и полезны для
локальной проверки. Production не запускается вручную через `pnpm start`:
production всегда работает через PM2 с `ecosystem.config.cjs`. Полный регламент
находится в `docs/deployment.md`.

Для автоматических серверных скриптов без TTY можно запускать команды как `CI=true pnpm build`.

## Production

Полная production-инструкция находится в `docs/deployment.md`.

Критично: проект использует Next.js `output: "standalone"`. Production PM2 должен
запускать `scripts/with-env.sh` с единственным Node entrypoint:

```bash
node .next/standalone/server.js
```

через `ecosystem.config.cjs`, чтобы standalone-сервер получил runtime-переменные из `.env`.

`next start` в production запрещён. `pnpm build` нельзя запускать при работающем PM2
в том же каталоге `/var/www/autozap`, потому что build меняет `.next` и может
временно оставить пользователей без CSS, JS, изображений или с ошибкой
`Failed to find Server Action`.

Логи PM2:

- `/var/www/autozap/logs/pm2/out.log`
- `/var/www/autozap/logs/pm2/error.log`

## Nginx

Шаблон находится в `deploy/nginx/autozap.conf`.

В production Nginx должен использовать реальные домены
`autozapchast-taldom.ru` и `www.autozapchast-taldom.ru`. Полная инструкция
настройки находится в `docs/deployment.md`.

Базовые проверки после правки server block:

```bash
sudo cp deploy/nginx/autozap.conf /etc/nginx/sites-available/autozap
sudo ln -s /etc/nginx/sites-available/autozap /etc/nginx/sites-enabled/autozap
sudo nginx -t
sudo systemctl reload nginx
```

В шаблоне уже учтены:

- reverse proxy на `127.0.0.1:3000`;
- `client_max_body_size 35m` для Excel-загрузок;
- gzip;
- cache headers для `_next/static` и `/assets`;
- заголовки `X-Forwarded-*`.

## SSL

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d autozapchast-taldom.ru -d www.autozapchast-taldom.ru
sudo certbot renew --dry-run
```

## PostgreSQL

Пример создания БД:

```bash
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql
```

```sql
CREATE USER autozap_user;
\password autozap_user
CREATE DATABASE autozap OWNER autozap_user;
\q
```

Проверка выполняется с `DATABASE_URL` из production `.env`:

```bash
scripts/with-env.sh psql "$DATABASE_URL" -c "select 1;"
```

## Meilisearch

Meilisearch должен быть доступен приложению по `MEILI_HOST`.

Не открывайте порт `7700` наружу. Держите его на `127.0.0.1` или в приватной сети.

После импорта каталог синхронизируется автоматически. Вручную:

```bash
pnpm search:sync
```

## Backup

Основная инструкция: `docs/production-backup.md`.

Готовый скрипт:

```bash
deploy/scripts/backup-postgres.sh
```

Минимальная cron-задача:

```cron
15 3 * * * cd /var/www/autozap && /usr/bin/env bash deploy/scripts/backup-postgres.sh >> /var/log/autozap-backup.log 2>&1
```

## Обновление сайта

Не используйте короткий deploy из нескольких команд. Для этого проекта безопасный
регламент включает backup, проверку PM2 entrypoint, остановку PM2 до `pnpm build`,
запуск через `ecosystem.config.cjs`, строгие health checks и только затем `pm2 save`.

Полный порядок: `docs/deployment.md`.

## Документация

- `docs/deployment.md` — полная инструкция VPS-развёртывания.
- `docs/production-backup.md` — backup и восстановление.
- `DEPLOY_CHECKLIST.md` — чеклист запуска.
- `docs/operations.md` — эксплуатация админ-панели.
- `docs/local-development.md` — локальная разработка.
- `docs/database-schema.md` — структура базы.
- `docs/excel-import.md` — Excel-импорт.
- `docs/categorization-and-catalog.md` — каталог и категоризация.
- `docs/production-audit.md` — результаты production-аудита.

## Частые проблемы

### Build пишет про недоступную БД, но завершается успешно

В sandbox или локальной среде PostgreSQL может быть недоступен во время статической генерации. Проект использует fallback-контент, поэтому build может завершиться успешно. На production перед build БД должна быть доступна.

### `/admin` перенаправляет на login

Это штатное поведение без сессии администратора. Создайте администратора командой `pnpm admin:create`.

### Meilisearch не отвечает

Проверьте:

```bash
curl http://localhost:7700/health
```

Затем пересоберите индекс:

```bash
pnpm search:sync
```

### Яндекс Карта не отображается

Проверьте `YANDEX_MAPS_API_KEY`. Если ключ пустой или API недоступен, сайт показывает fallback-карту с адресом и кнопками маршрута.

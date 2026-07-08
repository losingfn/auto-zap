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

```env
APP_URL=https://example.ru
NODE_ENV=production
DATABASE_URL=postgresql://autozap_user:CHANGE_ME@localhost:5432/autozap
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=CHANGE_ME_LONG_RANDOM_MEILI_MASTER_KEY
MEILI_SEARCH_KEY=
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_SESSION_SECRET_AT_LEAST_32_CHARS
YANDEX_MAPS_API_KEY=
```

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
pnpm start                       # next start
pnpm start:prod                  # next start на 127.0.0.1:3000
pnpm db:migrate                  # применить SQL-миграции
pnpm db:seed                     # заполнить категории, правила и синонимы
pnpm admin:create -- --email ... # создать или обновить администратора
pnpm import:check data/import-samples/catalog.xls
pnpm search:sync                 # пересобрать Meilisearch индекс
```

Для автоматических серверных скриптов без TTY можно запускать команды как `CI=true pnpm build`.

## Production build

Перед `pnpm build` на сервере должны быть готовы:

1. `.env`;
2. PostgreSQL;
3. Meilisearch;
4. миграции БД;
5. seed-данные;
6. администратор.

Базовый порядок:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm admin:create -- --email admin@example.ru --password "CHANGE_ME_STRONG_PASSWORD" --name "Администратор" --role owner
pnpm build
```

## Production start через PM2

Файл `ecosystem.config.cjs` запускает Next.js напрямую:

```bash
mkdir -p /var/www/autozap/logs/pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

Полезные команды:

```bash
pm2 status
pm2 logs autozap
pm2 restart autozap
pm2 stop autozap
pm2 flush autozap
```

Логи пишутся в:

- `/var/www/autozap/logs/pm2/out.log`
- `/var/www/autozap/logs/pm2/error.log`

## Nginx

Шаблон находится в `deploy/nginx/autozap.conf`.

Замените `example.ru` и `www.example.ru` на реальный домен, затем:

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
sudo certbot --nginx -d example.ru -d www.example.ru
sudo certbot renew --dry-run
```

`example.ru` замените на реальный домен.

## PostgreSQL

Пример создания БД:

```bash
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql
```

```sql
CREATE USER autozap_user WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE autozap OWNER autozap_user;
\q
```

Проверка:

```bash
psql "postgresql://autozap_user:CHANGE_ME@localhost:5432/autozap" -c "select 1;"
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

```bash
cd /var/www/autozap
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pm2 restart autozap
pm2 status
```

После обновления проверьте:

- `/`
- `/catalog`
- `/search?q=масло`
- `/admin`
- `/robots.txt`
- `/sitemap.xml`

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

# Локальный запуск

## Требования

- Node.js 22+
- pnpm
- Docker и Docker Compose
- PostgreSQL 16 через Docker Compose
- Meilisearch через Docker Compose

## Переменные окружения

```bash
cp .env.example .env
```

Минимально проверьте значения:

```bash
APP_URL=http://localhost:3000
DATABASE_URL=postgres://autozap:autozap@localhost:5432/autozap
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=replace-with-a-secure-32-byte-key
SESSION_SECRET=replace-with-a-secure-session-secret
YANDEX_MAPS_API_KEY=
```

`SESSION_SECRET` должен быть не короче 32 символов. `MEILI_MASTER_KEY` должен быть длинным случайным ключом; не используйте пример из файла на сервере.

## Установка и инфраструктура

```bash
pnpm install
docker compose up -d postgres meilisearch
pnpm db:migrate
pnpm db:seed
```

Если на компьютере нет `psql`, миграции можно применить через контейнер PostgreSQL:

```bash
for file in db/migrations/*.sql; do docker compose exec -T postgres psql -U autozap -d autozap < "$file"; done
docker compose exec -T postgres psql -U autozap -d autozap < db/seeds/001_categories.sql
docker compose exec -T postgres psql -U autozap -d autozap < db/seeds/002_taxonomy_rules.sql
docker compose exec -T postgres psql -U autozap -d autozap < db/seeds/003_search_synonyms.sql
```

## Первый администратор

```bash
pnpm admin:create -- --email admin@example.ru --password "StrongPassword123" --name "Администратор" --role owner
```

Пароль хранится только как Argon2-хэш. После входа создается серверная сессия и `httpOnly` cookie.

## Запуск приложения

```bash
pnpm dev
```

Адреса:

- сайт: `http://localhost:3000`
- админка: `http://localhost:3000/admin/login`
- Meilisearch: `http://localhost:7700`
- PostgreSQL: `127.0.0.1:5432`

## Проверочные команды

```bash
pnpm typecheck
pnpm build
pnpm import:check data/import-samples/catalog.xls
pnpm categorization:check data/import-samples/catalog.xls
pnpm search:fixture data/import-samples/catalog.xls масло акб дворники А-00002 maslo акумулятор
```

После публикации каталога можно пересобрать поиск:

```bash
pnpm search:sync
```

## Полный запуск через Docker Compose

```bash
docker compose up -d --build
```

Контейнер приложения сохраняет загруженные изображения в volume `app_uploads`, а Excel-файлы импорта в `import_uploads`.

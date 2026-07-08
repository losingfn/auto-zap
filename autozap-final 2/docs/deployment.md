# Подготовка к запуску на сервере

## Переменные окружения

Создайте `.env` на сервере:

```bash
APP_URL=https://example.ru
DATABASE_URL=postgres://autozap:autozap@localhost:5432/autozap
MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=long-random-master-key-at-least-16-chars
MEILI_SEARCH_KEY=
SESSION_SECRET=long-random-session-secret-at-least-32-chars
YANDEX_MAPS_API_KEY=
```

`APP_URL` нужен для sitemap, Open Graph и абсолютных ссылок. `SESSION_SECRET` и `MEILI_MASTER_KEY` должны быть уникальными для production.

В `docker-compose.yml` приложение получает внутренние адреса `postgres` и `meilisearch` через `environment`. Значение `DATABASE_URL` в `.env` удобно держать с `localhost`, чтобы host-команды `pnpm db:migrate`, `pnpm admin:create` и `pnpm search:sync` работали с опубликованным локальным портом PostgreSQL.

## Meilisearch на VPS

В Docker Compose Meilisearch уже описан:

```bash
docker compose up -d meilisearch
```

Сервис слушает `127.0.0.1:7700` на хосте и `http://meilisearch:7700` внутри Docker-сети. Не открывайте порт Meilisearch наружу без отдельной защиты. Для приложения используйте:

```bash
MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=long-random-master-key-at-least-16-chars
```

После публикации каталога индекс пересобирается автоматически. Вручную:

```bash
MEILI_HOST=http://localhost:7700 pnpm search:sync
```

## Яндекс Карта

Укажите ключ:

```bash
YANDEX_MAPS_API_KEY=your-yandex-maps-api-key
```

Если ключ пустой или карта не загрузилась, главная показывает fallback-блок с адресом и кнопками `Как добраться` и `Открыть в Яндекс Картах`.

## Production-запуск через Docker Compose

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres meilisearch
```

Примените миграции и seed. Если на сервере есть `psql`:

```bash
DATABASE_URL=postgres://autozap:autozap@localhost:5432/autozap pnpm db:migrate
DATABASE_URL=postgres://autozap:autozap@localhost:5432/autozap pnpm db:seed
```

Если `psql` есть только в контейнере PostgreSQL:

```bash
for file in db/migrations/*.sql; do docker compose exec -T postgres psql -U autozap -d autozap < "$file"; done
docker compose exec -T postgres psql -U autozap -d autozap < db/seeds/001_categories.sql
docker compose exec -T postgres psql -U autozap -d autozap < db/seeds/002_taxonomy_rules.sql
docker compose exec -T postgres psql -U autozap -d autozap < db/seeds/003_search_synonyms.sql
```

Создайте администратора:

```bash
DATABASE_URL=postgres://autozap:autozap@localhost:5432/autozap pnpm admin:create -- --email admin@example.ru --password "StrongPassword123" --name "Администратор" --role owner
```

Соберите и запустите приложение:

```bash
docker compose up -d --build
```

Проверьте:

```bash
curl -I https://example.ru
curl -I https://example.ru/robots.txt
curl -I https://example.ru/sitemap.xml
```

## Что нужно сохранить между перезапусками

Docker Compose создает volumes:

- `postgres_data` — база данных;
- `meili_data` — поисковый индекс;
- `app_uploads` — изображения из админки;
- `import_uploads` — загруженные Excel-файлы.

Эти volumes нужно включить в резервное копирование сервера.

## Рекомендации перед открытием сайта

- поставить reverse proxy с HTTPS;
- закрыть доступ к PostgreSQL и Meilisearch извне;
- установить сильные `SESSION_SECRET` и `MEILI_MASTER_KEY`;
- проверить `/admin` в режиме инкогнито;
- загрузить актуальный Excel и опубликовать каталог;
- открыть несколько категорий, подкатегорий и карточек товара;
- проверить поиск по `масло`, `акб`, `дворники` и точному внутреннему коду.

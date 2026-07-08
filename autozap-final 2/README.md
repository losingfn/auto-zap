# Автозапчасти на Салтыкова-Щедрина

Сайт-каталог магазина автозапчастей в Талдоме: публичная главная, каталог `Главная -> Категория -> Подкатегория -> Товар`, умный поиск, Excel-импорт, защищенная админ-панель, управление контентом, резервные копии и SEO.

## Что реализовано

- публичная главная по ТЗ с фото магазина, категориями, контактами, вакансией, статусом работы и Яндекс Картой с fallback;
- каталог без корзины, онлайн-заказа и форм обратного звонка;
- Excel-импорт `.xls/.xlsx` через админку с предварительным отчетом и ручной публикацией;
- автоматическая категоризация, очередь проверки и обучение правил на ручных исправлениях;
- Meilisearch как основной поиск, PostgreSQL `pg_trgm` как fallback и админ-поиск;
- админ-панель: импорт, проверка товаров, контент, каталог, категории, подкатегории, правила, синонимы, резервные копии;
- экспорт активного каталога в Excel и откат к предыдущей версии с подтверждением;
- SEO: metadata, Open Graph, `sitemap.xml`, `robots.txt`, JSON-LD `AutoPartsStore` и `BreadcrumbList`.

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

## Основная документация

- `docs/local-development.md` — локальный запуск и проверочные команды.
- `docs/operations.md` — работа владельца: администратор, Excel, публикация, откат, контент.
- `docs/deployment.md` — подготовка VPS, переменные окружения, Docker, Meilisearch, Яндекс Карта.
- `docs/final-checklist.md` — итоговые проверки и ограничения текущего окружения.
- `docs/database-schema.md` — структура базы данных.
- `docs/excel-import.md` — устройство Excel-импорта.
- `docs/categorization-and-catalog.md` — категоризация и публичный каталог.
- `docs/asset-decisions.md` — решения по ассетам.

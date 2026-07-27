# Production checklist

## Сервер

- [ ] Ubuntu 24.04 LTS установлена.
- [ ] Создан пользователь для деплоя.
- [ ] Установлен Node.js 22 LTS.
- [ ] Включён Corepack и установлен pnpm.
- [ ] Установлен PostgreSQL.
- [ ] Установлен или запущен Meilisearch.
- [ ] Установлены PM2 и Nginx.
- [ ] Firewall разрешает только SSH, HTTP, HTTPS.

## Проект

- [ ] Репозиторий размещён в `/var/www/autozap`.
- [ ] Создан `.env` на основе `.env.example`.
- [ ] В `.env` нет тестовых паролей.
- [ ] `SESSION_SECRET` длиннее 32 символов.
- [ ] `MEILI_MASTER_KEY` заменён на production-ключ.
- [ ] `APP_URL` указывает на реальный HTTPS-домен.
- [ ] `pnpm install --frozen-lockfile` выполнен.

## База и поиск

- [ ] Создан пользователь PostgreSQL.
- [ ] Создана база `autozap`.
- [ ] `pnpm db:migrate` выполнен.
- [ ] `pnpm db:seed` выполнен.
- [ ] Создан администратор через `pnpm admin:create`.
- [ ] Meilisearch healthcheck отвечает.
- [ ] `pnpm search:sync` выполнен после публикации каталога.

## Build и запуск

- [ ] `pnpm typecheck` проходит.
- [ ] `pnpm lint` проходит.
- [ ] Перед `pnpm build` PM2 остановлен, если это обновление существующего production.
- [ ] `pnpm build` проходит и автоматически запускает `postbuild`.
- [ ] `/var/www/autozap/.next/standalone/server.js`, `.next/standalone/.next/static` и `.next/standalone/public` существуют после build.
- [ ] Владелец `/var/www/autozap` совпадает с пользователем PM2; `chmod 777` не используется.
- [ ] PM2 запускает `/var/www/autozap/.next/standalone/server.js`, а не `next start`.
- [ ] `pnpm smoke:admin:prod` проходит на локальной/staging БД и проверяет HTML, JS/CSS/public assets и browser navigation; не запускать эту команду на активном production при работающем PM2.
- [ ] `pm2 start ecosystem.config.cjs` выполнен.
- [ ] `pm2 save` выполнен только после успешных local и public health checks.
- [ ] `pm2 startup systemd` настроен.
- [ ] `pm2 status` показывает `autozap online`.
- [ ] `http://127.0.0.1:3000/` возвращает HTTP 200.
- [ ] `https://autozapchast-taldom.ru/` возвращает HTTP 200.
- [ ] CSS и JS из текущего HTML возвращают HTTP 200 и ненулевой размер.
- [ ] `/assets/store/facade.webp` и `/assets/brand/logo-mark.png` возвращают HTTP 200.
- [ ] `/_next/image` для `facade.webp` возвращает HTTP 200.

## Nginx и SSL

- [ ] В `deploy/nginx/autozap.conf` заменён домен.
- [ ] Конфиг скопирован в `/etc/nginx/sites-available/autozap`.
- [ ] Site enabled через symlink.
- [ ] `sudo nginx -t` проходит.
- [ ] `sudo systemctl reload nginx` выполнен.
- [ ] Let's Encrypt сертификат выпущен.
- [ ] `sudo certbot renew --dry-run` проходит.

## Публичная проверка

- [ ] Главная открывается.
- [ ] Поиск работает: `/search?q=масло`.
- [ ] Каталог открывается: `/catalog`.
- [ ] Несколько категорий открываются.
- [ ] Подкатегория с поиском работает.
- [ ] Карточка товара открывается.
- [ ] Контакты отображаются.
- [ ] Яндекс Карта или fallback отображается.
- [ ] Галерея и lightbox работают.
- [ ] Вакансии отображаются.
- [ ] Footer отображается.
- [ ] `robots.txt` открывается.
- [ ] `sitemap.xml` открывается.
- [ ] favicon работает.
- [ ] Open Graph изображение доступно.
- [ ] В консоли браузера нет новых ошибок.

## Админка

- [ ] `/admin` без сессии ведёт на login.
- [ ] Вход администратора работает.
- [ ] `/admin/brand` открывается без runtime error.
- [ ] `/admin/import` открывается.
- [ ] Excel загружается и анализируется.
- [ ] Публикация каталога работает.
- [ ] Dashboard показывает последние импорты.
- [ ] Выход из админки работает.

## Backup

- [ ] `deploy/scripts/backup-postgres.sh` запускается вручную.
- [ ] Cron backup настроен.
- [ ] Backup появляется в `/var/backups/autozap/postgres`.
- [ ] Описан порядок восстановления.
- [ ] `.env`, Nginx config и PM2 config включены в backup.

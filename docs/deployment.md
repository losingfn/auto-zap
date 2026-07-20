# Production-развёртывание на VPS Ubuntu 24.04

Эта инструкция описывает рекомендуемый production-сценарий:

Ubuntu 24.04 LTS -> PostgreSQL -> Meilisearch -> Next.js build -> PM2 -> Nginx -> Let's Encrypt.

Docker Compose в проекте оставлен как альтернативный способ, но для небольшого VPS основной путь через PM2 проще обслуживать, логировать и бэкапить.

## 1. Подготовка сервера

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates build-essential nginx postgresql postgresql-contrib
```

Node.js 22 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
corepack prepare pnpm@latest --activate
node -v
pnpm -v
```

PM2:

```bash
sudo npm install -g pm2
```

## 2. Пользователь и каталог проекта

```bash
sudo mkdir -p /var/www/autozap
sudo chown -R "$USER":"$USER" /var/www/autozap
cd /var/www/autozap
git clone <REPOSITORY_URL> .
pnpm install --frozen-lockfile
```

## 3. PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER autozap_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE autozap OWNER autozap_user;
\q
```

Проверьте подключение:

```bash
psql "postgresql://autozap_user:CHANGE_ME_STRONG_PASSWORD@localhost:5432/autozap" -c "select 1;"
```

## 4. Meilisearch

Вариант без Docker: установите Meilisearch как сервис и держите порт закрытым наружу.

Пример через systemd зависит от выбранного способа установки Meilisearch. Важно, чтобы:

- сервис слушал `127.0.0.1:7700`;
- `MEILI_MASTER_KEY` был длинным случайным ключом;
- порт `7700` не был открыт в firewall.

Проверка:

```bash
curl http://127.0.0.1:7700/health
```

Docker-вариант только для Meilisearch тоже допустим:

```bash
docker compose up -d meilisearch
```

## 5. `.env`

```bash
cp .env.example .env
nano .env
```

Заполните:

```env
APP_URL=https://example.ru
NODE_ENV=production
DATABASE_URL=postgresql://autozap_user:CHANGE_ME_STRONG_PASSWORD@localhost:5432/autozap
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=CHANGE_ME_LONG_RANDOM_MEILI_MASTER_KEY
MEILI_SEARCH_KEY=
SESSION_SECRET=CHANGE_ME_LONG_RANDOM_SESSION_SECRET_AT_LEAST_32_CHARS
YANDEX_MAPS_API_KEY=
```

`APP_URL` замените на реальный домен. Реальные пароли не должны попадать в git.
Если в секретах есть пробелы или shell-спецсимволы, оберните значения в одинарные кавычки.

## 6. Миграции, seed и администратор

```bash
pnpm db:migrate
pnpm db:seed
pnpm admin:create -- --email admin@example.ru --password "CHANGE_ME_STRONG_PASSWORD" --name "Администратор" --role owner
```

После первого импорта Excel и публикации каталога пересоберите поиск:

```bash
pnpm search:sync
```

## 7. Production build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Проект собирается с `output: "standalone"`, поэтому production запуск должен идти через
`.next/standalone/server.js`, а не через `next start`.
`pnpm build` запускает `postbuild`, который копирует `.next/static` в
`.next/standalone/.next/static` и `public` в `.next/standalone/public`.
Не копируйте `.next/standalone` внутрь самого себя.

В автоматических shell-скриптах без TTY можно использовать `CI=true pnpm ...`, чтобы pnpm не задавал интерактивные вопросы при проверке зависимостей.

Если build в ограниченной среде пишет предупреждения о недоступной БД, но завершается успешно, это допустимо для локального sandbox. На сервере PostgreSQL должен быть доступен до build.

После build убедитесь, что весь релиз принадлежит пользователю, от которого работает PM2. Это
устраняет EACCES на Next artifacts вроде `.next/server/app/robots.txt.body` без небезопасного
`chmod 777`:

```bash
DEPLOY_USER=autozap
sudo chown -R "$DEPLOY_USER":"$DEPLOY_USER" /var/www/autozap
sudo chmod -R u+rwX,go+rX,go-w /var/www/autozap
chmod +x /var/www/autozap/scripts/*.sh
chmod +x /var/www/autozap/deploy/scripts/*.sh
```

## 8. PM2

Создайте директорию логов:

```bash
mkdir -p /var/www/autozap/logs/pm2
```

Запустите:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

Команду, которую выведет `pm2 startup`, выполните с `sudo`.

Проверка:

```bash
pm2 status
pm2 logs autozap
curl -I http://127.0.0.1:3000
pnpm smoke:admin:prod
```

PM2 должен запускать `node .next/standalone/server.js` с `HOSTNAME=127.0.0.1` и `PORT=3000`.
Если в логах есть `next start does not work with output: standalone`, PM2 использует старый
entrypoint и его нужно перезапустить из актуального `ecosystem.config.cjs`.

## 9. Nginx

```bash
sudo cp deploy/nginx/autozap.conf /etc/nginx/sites-available/autozap
sudo nano /etc/nginx/sites-available/autozap
```

Замените:

- `example.ru`
- `www.example.ru`

Активируйте:

```bash
sudo ln -s /etc/nginx/sites-available/autozap /etc/nginx/sites-enabled/autozap
sudo nginx -t
sudo systemctl reload nginx
```

## 10. SSL Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.ru -d www.example.ru
sudo certbot renew --dry-run
```

## 11. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

PostgreSQL и Meilisearch не открывайте наружу.

## 12. Обновление сайта

```bash
cd /var/www/autozap
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
DEPLOY_USER=autozap
sudo chown -R "$DEPLOY_USER":"$DEPLOY_USER" /var/www/autozap
pm2 restart autozap
pm2 status
```

Если после обновления менялась структура поисковых данных:

```bash
pnpm search:sync
```

## 13. Логи

PM2:

```bash
pm2 logs autozap
pm2 monit
pm2 flush autozap
```

Файлы:

- `/var/www/autozap/logs/pm2/out.log`
- `/var/www/autozap/logs/pm2/error.log`

Nginx:

- `/var/log/nginx/autozap.access.log`
- `/var/log/nginx/autozap.error.log`

Для ротации PM2-логов можно установить:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

## 14. Backup

См. `docs/production-backup.md`.

Коротко:

```bash
BACKUP_DIR=/var/backups/autozap/postgres DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" deploy/scripts/backup-postgres.sh
```

## 15. Проверка после запуска

Откройте:

- `https://example.ru/`
- `https://example.ru/catalog`
- `https://example.ru/search?q=масло`
- `https://example.ru/admin`
- `https://example.ru/robots.txt`
- `https://example.ru/sitemap.xml`

Затем выполните чеклист из `DEPLOY_CHECKLIST.md`.

## 16. Docker как альтернатива

В проекте есть `Dockerfile` и `docker-compose.yml`.

Docker полезен, если вы хотите держать приложение, PostgreSQL и Meilisearch в контейнерах. Для текущего VPS-сценария он не выбран основным способом, потому что:

- проще настраивать pg_dump и восстановление системной PostgreSQL;
- проще наблюдать PM2/Nginx/systemd;
- меньше движущихся частей для владельца небольшого сайта;
- целевой стек ТЗ явно включает PM2.

Если выбираете Docker, обязательно бэкапьте volumes:

- `postgres_data`
- `meili_data`
- `app_uploads`
- `import_uploads`

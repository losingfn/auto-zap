# Production Deployment Guide

Эта инструкция описывает production-развёртывание и дальнейшие обновления проекта `auto-zap` на Linux/VPS.

Документ написан под текущее состояние проекта, а не как универсальный шаблон:

- production-каталог: `/var/www/autozap`;
- production-домен: `https://autozapchast-taldom.ru`;
- Node.js приложение запускается через PM2;
- Nginx проксирует запросы на `127.0.0.1:3000`;
- Next.js собирается с `output: "standalone"`;
- корректный production entrypoint: `/var/www/autozap/.next/standalone/server.js`.

Важно: `next start` для этого проекта запрещён в production. Ранее PM2 был запущен через `next start`, хотя проект уже использовал standalone. При in-place деплое это могло приводить к смешиванию старой и новой сборки: часть пользователей видела страницу без CSS, без изображений, с ошибкой `Failed to find Server Action` или с бесконечной загрузкой. Сейчас это исправлено: PM2 должен запускаться только из `ecosystem.config.cjs`, через `scripts/with-env.sh node .next/standalone/server.js`. Обёртка загружает `/var/www/autozap/.env` до запуска standalone-сервера.

## 1. Общее Устройство Production

Production-стек:

- Ubuntu/Linux VPS;
- Git checkout проекта в `/var/www/autozap`;
- Node.js 22 LTS;
- pnpm через Corepack;
- PostgreSQL для основной базы;
- Meilisearch для поиска;
- Next.js 15 в standalone-режиме;
- PM2 для запуска Node.js процесса;
- Nginx как reverse proxy;
- Let's Encrypt для TLS;
- backup в `/var/backups/autozap`.

Почему используется standalone:

- `output: "standalone"` в `next.config.mjs` создаёт самодостаточный серверный релиз в `.next/standalone`;
- production-процессу не нужно запускать Next CLI;
- PM2 запускает `scripts/with-env.sh node .next/standalone/server.js`, поэтому standalone-сервер получает runtime-переменные из `.env`;
- этот способ соответствует предупреждению Next.js: при standalone нельзя использовать `next start`.

Что нельзя делать:

- не запускать `next start` в production;
- не запускать `pm2 restart autozap` как способ исправления entrypoint;
- не запускать `pnpm build`, пока PM2 обслуживает тот же каталог `.next`;
- не выполнять `pm2 save` до успешных local и public health checks;
- не распаковывать старую `.next` поверх новой при rollback: сначала удалить текущую `.next`, затем восстановить backup.

## 2. Production-Структура

Основные пути:

| Назначение | Путь |
| --- | --- |
| Проект | `/var/www/autozap` |
| Next build | `/var/www/autozap/.next` |
| Standalone server | `/var/www/autozap/.next/standalone/server.js` |
| Standalone static | `/var/www/autozap/.next/standalone/.next/static` |
| Standalone public | `/var/www/autozap/.next/standalone/public` |
| Public assets исходника | `/var/www/autozap/public` |
| PM2 ecosystem | `/var/www/autozap/ecosystem.config.cjs` |
| PM2 логи проекта | `/var/www/autozap/logs/pm2/out.log`, `/var/www/autozap/logs/pm2/error.log` |
| PM2 home пользователя `autozap` | `/home/autozap/.pm2` |
| Nginx site config | `/etc/nginx/sites-available/autozap` |
| Nginx access log | `/var/log/nginx/autozap.access.log` |
| Nginx error log | `/var/log/nginx/autozap.error.log` |
| Backup | `/var/backups/autozap` |

Критичные каталоги build:

- `.next`;
- `.next/static`;
- `.next/standalone`;
- `.next/standalone/public`;
- `.next/standalone/.next/static`.

Эти каталоги нельзя менять во время работы старого PM2-процесса. `next build` очищает `.next`, а `postbuild` копирует static/public в standalone. Если сайт в этот момент продолжает обслуживать пользователей, браузер может получить HTML одной сборки и CSS/JS другой сборки или временный 404 по asset.

## 3. Первичная Настройка Сервера

Команды ниже выполняются на production-сервере. Root используется только для установки системных пакетов, создания каталогов и настройки systemd/nginx. Git, pnpm, build и PM2-команды приложения выполняются от Linux-пользователя `autozap`.

### 3.1. Системные Пакеты

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates build-essential nginx postgresql postgresql-contrib
```

### 3.2. Node.js 22 LTS И pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@latest --activate
node -v
pnpm -v
```

Успешно: `node -v` показывает Node.js 22.x, `pnpm -v` показывает установленный pnpm.

### 3.3. Пользователь И Каталоги

```bash
sudo useradd --create-home --shell /bin/bash autozap
sudo install -d -o autozap -g autozap -m 755 /var/www/autozap
sudo install -d -o autozap -g autozap -m 700 /var/backups/autozap
sudo install -d -o autozap -g autozap -m 755 /var/www/autozap/logs/pm2
```

Проверка:

```bash
ls -ld /var/www/autozap /var/backups/autozap /var/www/autozap/logs/pm2
```

Успешно: владельцем является `autozap`; `/var/backups/autozap` имеет права `700`.

### 3.4. Получение Кода

```bash
sudo -iu autozap
cd /var/www/autozap
git clone https://github.com/losingfn/auto-zap.git .
git status --short
```

Успешно: `git status --short` пустой.

### 3.5. PostgreSQL

Создайте пользователя БД и задайте пароль интерактивно, не публикуя его в shell history:

```bash
sudo -u postgres psql
```

Внутри `psql`:

```sql
CREATE USER autozap_user;
\password autozap_user
CREATE DATABASE autozap OWNER autozap_user;
\q
```

Проверка выполняется от пользователя `autozap` с `DATABASE_URL` из `.env`:

```bash
cd /var/www/autozap
scripts/with-env.sh psql "$DATABASE_URL" -c "select 1;"
```

Успешно: вывод содержит `1`.

### 3.6. Meilisearch

Meilisearch должен быть доступен приложению по `MEILI_HOST`, обычно `http://127.0.0.1:7700`. Порт `7700` нельзя открывать наружу.

Проверка:

```bash
curl -fsS http://127.0.0.1:7700/health
```

Успешно: Meilisearch возвращает JSON со статусом `available`.

### 3.7. `.env`

Создайте файл:

```bash
cd /var/www/autozap
cp .env.example .env
chmod 600 .env
nano .env
```

Production-значения должны включать:

- `APP_URL=https://autozapchast-taldom.ru`;
- `NODE_ENV=production`;
- `DATABASE_URL` для базы `autozap`;
- `IMPORT_STORAGE_ROOT=/var/www/autozap` для общего persistent-хранилища исходных Excel-файлов web-процесса и worker;
- `MEILI_HOST=http://127.0.0.1:7700` или фактический локальный адрес Meilisearch;
- `MEILI_MASTER_KEY`;
- `SESSION_SECRET` длиной не менее 32 случайных символов;
- `YANDEX_MAPS_API_KEY`, если используется.

Секреты не выводить в чат, issue, PR, логи и документацию.

### 3.8. Зависимости, Миграции И Первичные Данные

```bash
cd /var/www/autozap
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
printf 'Admin email: '
read -r ADMIN_EMAIL
printf 'Admin password: '
stty -echo
read -r ADMIN_PASSWORD
stty echo
printf '\n'
pnpm admin:create -- --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --name "Администратор" --role owner
unset ADMIN_PASSWORD
```

Если пароль администратора содержит спецсимволы, вводите команду аккуратно и не публикуйте её вывод. После первого импорта каталога синхронизируйте поиск:

```bash
pnpm search:sync
```

## 4. Первичный Build

До первого запуска PM2 приложение ещё не обслуживает пользователей, поэтому build можно выполнить сразу:

```bash
cd /var/www/autozap
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm build` автоматически запускает `postbuild` из `package.json`:

```text
node --import tsx scripts/prepare-standalone-release.ts
```

Ручной запуск `postbuild` после `pnpm build` не нужен.

Проверка standalone:

```bash
test -f .next/standalone/server.js
test -f .next/BUILD_ID
test -f .next/standalone/.next/BUILD_ID
cmp -s .next/BUILD_ID .next/standalone/.next/BUILD_ID
test -d .next/standalone/public
test -d .next/standalone/.next/static
test -f .next/standalone/public/assets/store/facade.webp
test -f .next/standalone/public/assets/brand/logo-mark.png
find .next/standalone/.next/static -type f -name '*.css' -print -quit
find .next/standalone/.next/static -type f -name '*.js' -print -quit
find .next/standalone/node_modules/.pnpm -maxdepth 1 -type d -name 'next@*' -print -quit
```

Успешно: все `test`/`cmp` завершаются без ошибок, `find` печатает пути.

## 5. Настройка PM2

PM2 устанавливается глобально:

```bash
sudo npm install -g pm2
```

Все PM2-команды приложения выполнять от пользователя `autozap`:

```bash
sudo -iu autozap
cd /var/www/autozap
pm2 start ecosystem.config.cjs
```

Текущий `ecosystem.config.cjs` должен запускать:

```text
cwd: /var/www/autozap
script: scripts/with-env.sh
args: node .next/standalone/server.js
interpreter: none
NODE_ENV: production
HOSTNAME: 127.0.0.1
PORT: 3000
```

Проверка:

```bash
pm2 jlist > /tmp/autozap-pm2-jlist.json
node -e '
const fs = require("fs");
const apps = JSON.parse(fs.readFileSync("/tmp/autozap-pm2-jlist.json", "utf8"));
const app = apps.find((item) => item.name === "autozap");
if (!app) process.exit(2);
const env = app.pm2_env || app;
const value = (key) => env.env?.[key] ?? env[key] ?? "";
console.log("cwd=" + env.pm_cwd);
console.log("script=" + env.pm_exec_path);
console.log("args=" + JSON.stringify(env.args || []));
console.log("NODE_ENV=" + value("NODE_ENV"));
console.log("HOSTNAME=" + value("HOSTNAME"));
console.log("PORT=" + value("PORT"));
if ((env.pm_cwd || "") !== "/var/www/autozap") process.exit(3);
if (!String(env.pm_exec_path || "").endsWith("scripts/with-env.sh")) process.exit(4);
if (!JSON.stringify(env.args || []).includes(".next/standalone/server.js")) process.exit(5);
if (JSON.stringify(env.args || []).includes("next start")) process.exit(6);
if (value("NODE_ENV") !== "production") process.exit(7);
if (value("HOSTNAME") !== "127.0.0.1") process.exit(8);
if (String(value("PORT")) !== "3000") process.exit(9);
'
rm -f /tmp/autozap-pm2-jlist.json
```

Успешно: script указывает на `/var/www/autozap/scripts/with-env.sh`, а args — на `/var/www/autozap/.next/standalone/server.js`; args не содержат `next start`.

Сохранять PM2 process list можно только после health checks:

```bash
pm2 save
```

Автозапуск:

```bash
pm2 startup systemd
```

Команду, которую выведет `pm2 startup`, выполнить с `sudo`.

Если `pm2 show autozap` или логи показывают `next start`, процесс создан по старой конфигурации. Исправление: сохранить backup PM2 dump, выполнить `pm2 delete autozap`, затем `pm2 start ecosystem.config.cjs`. Не использовать `pm2 restart` или `pm2 reload` для смены entrypoint.

## 6. Nginx И SSL

Шаблон Nginx находится в `deploy/nginx/autozap.conf`. Перед применением на production в `/etc/nginx/sites-available/autozap` должен быть указан реальный домен:

```nginx
server_name autozapchast-taldom.ru www.autozapchast-taldom.ru;
```

Команды:

```bash
cd /var/www/autozap
sudo cp deploy/nginx/autozap.conf /etc/nginx/sites-available/autozap
sudo nano /etc/nginx/sites-available/autozap
sudo ln -s /etc/nginx/sites-available/autozap /etc/nginx/sites-enabled/autozap
sudo nginx -t
sudo systemctl reload nginx
```

Nginx должен проксировать на `http://127.0.0.1:3000`. Он не должен напрямую обслуживать `.next`, потому что приложение работает через Next standalone server.

SSL:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d autozapchast-taldom.ru -d www.autozapchast-taldom.ru
sudo certbot renew --dry-run
```

## 7. Health Check Helpers

Эти helper-функции используются в деплое, rollback и ручной диагностике. Они требуют ровно HTTP `200` и ненулевой размер ответа. Для URL, где ожидается redirect, используйте отдельную проверку с явным ожидаемым кодом.

```bash
check_http_200() {
  label="$1"
  url="$2"
  extra_header="${3:-}"

  if [ -n "$extra_header" ]; then
    result="$(curl -sS -o /dev/null -w '%{http_code}\t%{size_download}\t%{content_type}' -H "$extra_header" "$url")" || {
      echo "$label failed: curl error url=$url"
      return 1
    }
  else
    result="$(curl -sS -o /dev/null -w '%{http_code}\t%{size_download}\t%{content_type}' "$url")" || {
      echo "$label failed: curl error url=$url"
      return 1
    }
  fi

  code="$(printf '%s' "$result" | awk -F '\t' '{print $1}')"
  size="$(printf '%s' "$result" | awk -F '\t' '{print $2}')"
  type="$(printf '%s' "$result" | awk -F '\t' '{print $3}')"

  echo "$label code=$code size=$size type=$type url=$url"

  if [ "$code" != "200" ] || [ "${size:-0}" -le 0 ]; then
    return 1
  fi
}

wait_http_200() {
  label="$1"
  url="$2"
  timeout_seconds="${3:-30}"

  for i in $(seq 1 "$timeout_seconds"); do
    if check_http_200 "$label" "$url" > /dev/null; then
      echo "$label ready after ${i}s"
      return 0
    fi
    sleep 1
  done

  echo "$label did not return HTTP 200 within ${timeout_seconds}s url=$url"
  return 1
}

check_http_200_series() {
  label="$1"
  url="$2"
  extra_header="${3:-}"

  for i in $(seq 1 20); do
    if [ -n "$extra_header" ]; then
      result="$(curl -sS -o /dev/null -w '%{http_code}\t%{size_download}\t%{content_type}' -H "$extra_header" "$url")" || {
        echo "$label request=$i curl error url=$url"
        return 1
      }
    else
      result="$(curl -sS -o /dev/null -w '%{http_code}\t%{size_download}\t%{content_type}' "$url")" || {
        echo "$label request=$i curl error url=$url"
        return 1
      }
    fi

    code="$(printf '%s' "$result" | awk -F '\t' '{print $1}')"
    size="$(printf '%s' "$result" | awk -F '\t' '{print $2}')"
    type="$(printf '%s' "$result" | awk -F '\t' '{print $3}')"

    echo "$label request=$i code=$code size=$size type=$type url=$url"

    if [ "$code" != "200" ] || [ "${size:-0}" -le 0 ]; then
      return 1
    fi
  done
}
```

## 8. Safe Production Deploy

Этот регламент используется для дальнейших обновлений. Он намеренно не является zero-downtime: текущая структура `/var/www/autozap` — in-place release. Безопасность достигается коротким контролируемым downtime: PM2 останавливается до изменения `.next`.

### 8.1. Перед Деплоем

Войти как `autozap`:

```bash
sudo -iu autozap
cd /var/www/autozap
```

Проверить, что PM2 уже использует standalone:

```bash
pm2 show autozap
```

Успешно: script path содержит `/var/www/autozap/scripts/with-env.sh`, а args — `.next/standalone/server.js`. Если виден `next start`, сначала исправить PM2 entrypoint и не выполнять deploy.

Проверить git:

```bash
git branch --show-current
git status --short
```

Успешно: ветка ожидаемая, `git status --short` пустой.

### 8.2. Создать Backup Перед Изменениями

```bash
BACKUP_DIR="/var/backups/autozap/$(date +%Y%m%d-%H%M%S)-deploy"
mkdir -m 700 "$BACKUP_DIR"
git rev-parse HEAD > "$BACKUP_DIR/git-commit.before.txt"
git branch --show-current > "$BACKUP_DIR/git-branch.before.txt"
git status --short > "$BACKUP_DIR/git-status.before.txt"
pm2 jlist > "$BACKUP_DIR/pm2-jlist.before.json"
pm2 show autozap > "$BACKUP_DIR/pm2-show.before.txt"
test -f "$HOME/.pm2/dump.pm2" && cp "$HOME/.pm2/dump.pm2" "$BACKUP_DIR/pm2-dump.before.pm2"
tar -czf "$BACKUP_DIR/build-current.tar.gz" .next ecosystem.config.cjs package.json pnpm-lock.yaml
tar -tzf "$BACKUP_DIR/build-current.tar.gz" > /dev/null
```

Не публикуйте `pm2-jlist.before.json` и PM2 dump: там могут быть env.

Успешно: архив читается, backup лежит вне Git в `/var/backups/autozap/...`.

### 8.3. Получить Обновления

```bash
OLD_COMMIT="$(git rev-parse HEAD)"
git fetch origin main
TARGET_COMMIT="$(git rev-parse origin/main)"
git diff --name-only "$OLD_COMMIT" "$TARGET_COMMIT" -- package.json pnpm-lock.yaml
```

Если вывод содержит `package.json` или `pnpm-lock.yaml`, зависимости менялись.

```bash
git pull --ff-only
git rev-parse HEAD > "$BACKUP_DIR/git-commit.after-pull.txt"
git status --short
```

Успешно: pull fast-forward, `git status --short` пустой.

Если зависимости менялись, заранее загрузите пакеты до downtime:

```bash
pnpm fetch --frozen-lockfile
```

Успешно: registry доступен, пакеты загружены в pnpm store. Если команда падает, остановиться: PM2 ещё работает, rollback не нужен.

### 8.4. Проверки До Downtime

Эти команды не должны менять `.next`:

```bash
pnpm lint
pnpm typecheck
```

Если есть изменения БД в релизе, остановитесь и подготовьте отдельный DB backup и план отката. `pnpm db:migrate` нельзя запускать как обычный шаг без подтверждения, потому что rollback приложения не откатывает БД автоматически.

### 8.5. Начало Downtime

```bash
pm2 stop autozap-worker
pm2 stop autozap
```

Если команда не прошла, остановиться. Не запускать build.

Для первого релиза с `IMPORT_STORAGE_ROOT` до `pnpm build` переместите legacy Excel-файлы из старого standalone-каталога в persistent storage:

```bash
pnpm import:migrate-legacy-storage
```

Команда использует `rename`, не копирует файлы и останавливается при collision. После успешного build web запускается через `ecosystem.config.cjs`, а worker — отдельным `pm2 restart autozap-worker --update-env`.

Если зависимости менялись:

```bash
pnpm install --frozen-lockfile --offline
```

Если зависимости не менялись и `node_modules` исправен, этот шаг можно пропустить.

Если согласованы миграции БД:

```bash
pnpm db:migrate
```

### 8.6. Build

```bash
pnpm build
```

Если build падает, не запускать PM2 с частичной `.next`. Выполнить rollback из раздела 10.

Проверка standalone:

```bash
test -f .next/standalone/server.js
test -f .next/BUILD_ID
test -f .next/standalone/.next/BUILD_ID
cmp -s .next/BUILD_ID .next/standalone/.next/BUILD_ID
test -d .next/standalone/public
test -d .next/standalone/.next/static
test -f .next/standalone/public/assets/store/facade.webp
test -f .next/standalone/public/assets/brand/logo-mark.png
find .next/standalone/.next/static -type f -name '*.css' -print -quit
find .next/standalone/.next/static -type f -name '*.js' -print -quit
find .next/standalone/node_modules/.pnpm -maxdepth 1 -type d -name 'next@*' -print -quit
```

Manifest-файлы можно вывести информационно, но не делать единственной причиной rollback: набор manifest зависит от версии Next.js.

```bash
find .next .next/standalone/.next -maxdepth 2 -type f -name '*manifest*.json' | sort
```

### 8.7. Запуск Нового Процесса

Не использовать `pm2 restart autozap` после build. Надёжный порядок:

```bash
pm2 delete autozap
pm2 start ecosystem.config.cjs
```

`pm2 save` пока не выполнять.

Дождаться локального HTTP 200:

```bash
wait_http_200 "pm2-ready" "http://127.0.0.1:3000/" 30
```

Проверить process definition:

```bash
pm2 jlist > "$BACKUP_DIR/pm2-jlist.after-start.json"
node -e '
const fs = require("fs");
const app = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).find((item) => item.name === "autozap");
if (!app) process.exit(2);
const env = app.pm2_env || app;
const value = (key) => env.env?.[key] ?? env[key] ?? "";
console.log("cwd=" + env.pm_cwd);
console.log("script=" + env.pm_exec_path);
console.log("args=" + JSON.stringify(env.args || []));
console.log("NODE_ENV=" + value("NODE_ENV"));
console.log("HOSTNAME=" + value("HOSTNAME"));
console.log("PORT=" + value("PORT"));
if ((env.pm_cwd || "") !== "/var/www/autozap") process.exit(3);
if (!String(env.pm_exec_path || "").endsWith("scripts/with-env.sh")) process.exit(4);
if (!JSON.stringify(env.args || []).includes(".next/standalone/server.js")) process.exit(5);
if (JSON.stringify(env.args || []).includes("next start")) process.exit(6);
if (value("NODE_ENV") !== "production") process.exit(7);
if (value("HOSTNAME") !== "127.0.0.1") process.exit(8);
if (String(value("PORT")) !== "3000") process.exit(9);
' "$BACKUP_DIR/pm2-jlist.after-start.json"
```

Если проверка падает, выполнить rollback.

### 8.8. Local И Public Health Checks

```bash
check_http_200 "local-home" "http://127.0.0.1:3000/"
check_http_200 "public-home" "https://autozapchast-taldom.ru/"
check_http_200 "catalog" "http://127.0.0.1:3000/catalog"
check_http_200 "search" "http://127.0.0.1:3000/search?q=%D0%BC%D0%B0%D1%81%D0%BB%D0%BE"
check_http_200 "robots" "http://127.0.0.1:3000/robots.txt"
check_http_200 "sitemap" "http://127.0.0.1:3000/sitemap.xml"
check_http_200 "admin-login" "http://127.0.0.1:3000/admin/login"
check_http_200 "facade" "http://127.0.0.1:3000/assets/store/facade.webp"
check_http_200 "logo-mark" "http://127.0.0.1:3000/assets/brand/logo-mark.png"
check_http_200 "next-image" "http://127.0.0.1:3000/_next/image?url=%2Fassets%2Fstore%2Ffacade.webp&w=1920&q=75" "Accept: image/avif,image/webp,image/apng,*/*"
```

`/admin` без сессии может перенаправлять на `/admin/login`; поэтому для строгого HTTP 200 проверяется `/admin/login`.

Извлечь CSS/JS из текущего HTML:

```bash
curl -fsS http://127.0.0.1:3000/ -o "$BACKUP_DIR/home.after.html"
CSS_URL="$(node -e 'const fs=require("fs");const h=fs.readFileSync(process.argv[1],"utf8");const u=[...h.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(x=>x.startsWith("/_next/static/"));console.log(u.find(x=>x.endsWith(".css"))||"")' "$BACKUP_DIR/home.after.html")"
JS_URL="$(node -e 'const fs=require("fs");const h=fs.readFileSync(process.argv[1],"utf8");const u=[...h.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(x=>x.startsWith("/_next/static/"));console.log(u.find(x=>x.endsWith(".js"))||"")' "$BACKUP_DIR/home.after.html")"
printf 'CSS=%s\nJS=%s\n' "$CSS_URL" "$JS_URL"
test -n "$CSS_URL"
test -n "$JS_URL"
```

Серии по 20 запросов:

```bash
check_http_200_series "home" "http://127.0.0.1:3000/"
check_http_200_series "css" "http://127.0.0.1:3000$CSS_URL"
check_http_200_series "js" "http://127.0.0.1:3000$JS_URL"
check_http_200_series "asset" "http://127.0.0.1:3000/assets/store/facade.webp"
check_http_200_series "next-image" "http://127.0.0.1:3000/_next/image?url=%2Fassets%2Fstore%2Ffacade.webp&w=1920&q=75" "Accept: image/avif,image/webp,image/apng,*/*"
```

Проверить логи:

```bash
pm2 logs autozap --lines 80 --nostream
sudo tail -n 80 /var/log/nginx/autozap.error.log
```

Если всё успешно:

```bash
pm2 save
```

Только после этого новый PM2 process list сохранён.

## 9. Health Checks Вручную

Быстрая проверка статуса:

```bash
pm2 status
pm2 show autozap
curl -fsS http://127.0.0.1:3000/ > /dev/null
curl -fsS https://autozapchast-taldom.ru/ > /dev/null
```

Проверка CSS/JS выполняется через извлечение URL из HTML, как в разделе 8.8. Нельзя проверять произвольный старый chunk: имена файлов включают hash текущей сборки.

Проверка Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo tail -n 80 /var/log/nginx/autozap.error.log
```

Проверка PM2 entrypoint:

```bash
pm2 show autozap
pm2 jlist | node -e '
let input="";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const app = JSON.parse(input).find((item) => item.name === "autozap");
  const env = app?.pm2_env || app;
  console.log(env?.pm_exec_path || "");
  console.log(JSON.stringify(env?.args || []));
});
'
```

Успешно: script указывает на `/var/www/autozap/scripts/with-env.sh`, args содержат `/var/www/autozap/.next/standalone/server.js` и не содержат `next start`.

## 10. Rollback

Rollback приложения не откатывает БД. Если в релизе были миграции, откат БД выполнять только по отдельному плану восстановления PostgreSQL.

### 10.1. Если Ошибка До `pm2 stop`

Ничего не откатывать: старый процесс продолжает работать. Исправить причину и начать деплой заново.

### 10.2. Если Ошибка После `pm2 stop`

Выполнять от пользователя `autozap` в `/var/www/autozap`:

```bash
pwd
```

Успешно: `/var/www/autozap`.

Остановить нерабочий процесс:

```bash
pm2 delete autozap
```

Если `pm2 delete` не проходит и заранее подтверждено, что у пользователя `autozap` нет других PM2-процессов:

```bash
pm2 kill
```

Восстановить build без наложения новой `.next`:

```bash
rm -rf .next
tar -xzf "$BACKUP_DIR/build-current.tar.gz" -C /var/www/autozap .next
```

Восстановить старый PM2 dump:

```bash
test -f "$HOME/.pm2/dump.pm2" && cp "$HOME/.pm2/dump.pm2" "$BACKUP_DIR/pm2-dump.failed-new.pm2"
cp "$BACKUP_DIR/pm2-dump.before.pm2" "$HOME/.pm2/dump.pm2"
pm2 resurrect
```

Дождаться HTTP 200:

```bash
wait_http_200 "rollback-ready" "http://127.0.0.1:3000/" 30
check_http_200 "rollback-home" "http://127.0.0.1:3000/"
```

Проверить PM2:

```bash
pm2 status
pm2 show autozap
```

Если rollback успешен, не выполнять `pm2 save` автоматически после неудачного нового запуска. Старый dump уже восстановлен копированием. `pm2 save` разрешён только после отдельного решения, когда подтверждено, что именно этот process list нужно сохранить.

## 11. Типичные Ошибки

### `next start does not work with output: standalone`

Причина: PM2 или ручная команда запускает `next start`. Для этого проекта это неверно.

Проверка:

```bash
pm2 show autozap
pm2 logs autozap --lines 80 --nostream
```

Исправление: backup PM2 dump, `pm2 delete autozap`, `pm2 start ecosystem.config.cjs`, health checks, затем `pm2 save`.

### Нет CSS Или Страница Открывается Только Текстом

Вероятная причина: build выполнялся при работающем PM2 в том же каталоге, либо HTML и static chunks относятся к разным сборкам.

Проверка:

```bash
curl -fsS http://127.0.0.1:3000/ -o /tmp/autozap-home.html
grep -o '/_next/static/[^"]*' /tmp/autozap-home.html | head
```

Затем проверить найденный CSS/JS через `check_http_200`.

Исправление: выполнить безопасный деплой по разделу 8 или rollback по разделу 10.

### Нет Изображений Или `/_next/image` Возвращает 400

Причина: отсутствует исходный файл в `public`, нарушена standalone-копия `public`, либо deploy прервал `postbuild`.

Проверка:

```bash
test -f .next/standalone/public/assets/store/facade.webp
check_http_200 "facade" "http://127.0.0.1:3000/assets/store/facade.webp"
check_http_200 "next-image" "http://127.0.0.1:3000/_next/image?url=%2Fassets%2Fstore%2Ffacade.webp&w=1920&q=75" "Accept: image/avif,image/webp,image/apng,*/*"
```

### `Failed to find Server Action`

Причина: клиент отправляет action id из другой сборки, обычно после неатомарного in-place deploy.

Исправление: безопасный deploy с остановкой PM2 до build. Для уже затронутых клиентов помогает обновление страницы после стабилизации build, но root cause — deploy procedure.

### 502 От Nginx

Причина: PM2 не слушает `127.0.0.1:3000`, процесс падает или Nginx проксирует не туда.

Проверка:

```bash
pm2 status
pm2 logs autozap --lines 80 --nostream
curl -fsS http://127.0.0.1:3000/ > /dev/null
sudo tail -n 80 /var/log/nginx/autozap.error.log
```

### 500 От Приложения

Причина: ошибка приложения, БД, env или Meilisearch.

Проверка:

```bash
pm2 logs autozap --lines 120 --nostream
scripts/with-env.sh psql "$DATABASE_URL" -c "select 1;"
curl -fsS http://127.0.0.1:7700/health
```

### 403

Для `/admin` и `/api/admin/*` отказ без сессии ожидаем. Для публичных страниц 403 не является нормой.

Проверка:

```bash
check_http_200 "admin-login" "http://127.0.0.1:3000/admin/login"
curl -I http://127.0.0.1:3000/admin
```

### EACCES На `.next`

Причина: build запускался от одного пользователя, PM2 от другого, или файлы принадлежат root.

Проверка:

```bash
whoami
ls -ld /var/www/autozap /var/www/autozap/.next /var/www/autozap/.next/standalone
find /var/www/autozap/.next -maxdepth 2 ! -user autozap -print | head
```

Исправление: остановиться и привести владельца к `autozap` точечно. Не использовать `chmod 777`.

### `pm2 save` Сохранил Плохой Процесс

Причина: `pm2 save` выполнен до health checks.

Исправление: восстановить сохранённый PM2 dump из backup и выполнить `pm2 resurrect`. После этого не делать `pm2 save`, пока не подтверждён правильный процесс.

## 12. Чек-Лист Перед Деплоем

- [ ] Я работаю под пользователем `autozap`, не root.
- [ ] Каталог: `/var/www/autozap`.
- [ ] `git status --short` пустой.
- [ ] PM2 запускает `scripts/with-env.sh` с аргументом `.next/standalone/server.js`, не `next start`.
- [ ] Есть доступ к `/var/backups/autozap`.
- [ ] Создан backup `.next` и PM2 dump.
- [ ] Понятно, менялись ли `package.json` или `pnpm-lock.yaml`.
- [ ] Если есть миграции БД, подготовлен отдельный DB backup и план отката.
- [ ] `pnpm lint` и `pnpm typecheck` прошли до downtime.
- [ ] Владелец `/var/www/autozap` и `.next` — `autozap`.

## 13. Чек-Лист После Деплоя

- [ ] `pm2 status` показывает `autozap online`.
- [ ] `pm2 show autozap` показывает `/var/www/autozap/scripts/with-env.sh`; args содержат `.next/standalone/server.js`.
- [ ] Args не содержат `next start`.
- [ ] `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `PORT=3000`.
- [ ] `http://127.0.0.1:3000/` возвращает HTTP 200.
- [ ] `https://autozapchast-taldom.ru/` возвращает HTTP 200.
- [ ] `/catalog`, `/search?q=масло`, `/robots.txt`, `/sitemap.xml`, `/admin/login` возвращают HTTP 200.
- [ ] CSS и JS из текущего HTML возвращают HTTP 200 и ненулевой размер.
- [ ] `/assets/store/facade.webp`, `/assets/brand/logo-mark.png` возвращают HTTP 200.
- [ ] `/_next/image?...facade.webp...` возвращает HTTP 200 с `Accept: image/avif,image/webp,image/apng,*/*`.
- [ ] Серии из 20 запросов к главной, CSS, JS, asset и `/_next/image` прошли.
- [ ] В PM2 и Nginx error logs нет новых критических ошибок.
- [ ] Только теперь выполнен `pm2 save`.

## 14. Backup

Подробная инструкция по PostgreSQL backup и восстановлению: `docs/production-backup.md`.

Минимум перед deploy:

- backup `.next`;
- backup `ecosystem.config.cjs`;
- backup `package.json` и `pnpm-lock.yaml`;
- backup PM2 dump;
- backup git commit/branch/status;
- отдельный PostgreSQL backup, если есть миграции.

## 15. Docker Как Альтернатива

В проекте есть `Dockerfile` и `docker-compose.yml`, но основной production-путь для текущего VPS — PM2 + Nginx. Docker не используется в этой инструкции, чтобы не смешивать две разные модели эксплуатации.

Если когда-нибудь будет выбран Docker, нужно отдельно описать backup volumes, запуск контейнера, health checks и rollback. Не смешивайте Docker deploy с текущим PM2 in-place deploy.

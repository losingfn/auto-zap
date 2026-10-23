# Публикация сайта: кандидат от 24 октября 2026 года

Это инструкция для выполнения **после отдельного разрешения**. Сейчас команды на сервере не выполнялись.
Архитектура сохранена: `/var/www/autozap`, пользователь `autozap`, порт 3000, PM2,
`with-env.sh`, сборка Next standalone на Linux. Тестовый экземпляр 3100 не используется.

Состав: утверждённый релиз `fef1dbc9255ee8bae339d6d1432e2f0e360af108` плюс исправления
сохранения/повтора согласий, три регрессии, тестовый helper, эта инструкция и read-only SQL.
Никакого повторного объединения веток не требуется. Метрика остаётся выключенной.
`source.tar.gz` в локальных артефактах — снимок для проверки, **не macOS-сборка для сервера**.
Передача приложения производится существующим Git-путём после разрешения на commit/push.

## 0. Локальная фиксация — только после разрешения на commit и push

В `/Users/mac/Documents/autozap`, на `codex/privacy-consent-save-diagnostics`:

```bash
git add -- src/features/privacy/coordinator.ts src/features/privacy/privacy-provider.tsx \
  scripts/helpers/privacy-next-environment.ts scripts/test-privacy-origin.ts \
  scripts/test-privacy-save-browser.ts scripts/test-privacy-save-retry.ts \
  deploy/releases/site-2026-10-24/schema-preflight.sql docs/site-release-2026-10-24.md
git diff --cached --check
git diff --cached --stat
git commit -m "Finalize privacy saving and prepare site release"
git push -u origin codex/privacy-consent-save-diagnostics
git rev-parse HEAD
```

Не добавлять `.env`, `.next`, `node_modules`, `.DS_Store`, `.agents`, `.codex`, временные
файлы и `artifacts/`. Не включать нерешённые эксперименты настоящего SDK.

## 1. Сервер: до остановки сайта

Сначала войти в существующую учётную запись приложения (`sudo -iu autozap`). Далее —
одна Bash-сессия. При любой ошибке остановиться. До шага 4 старый standalone продолжает работать.

```bash
set -euo pipefail
umask 077
cd /var/www/autozap
test "$(id -un)" = autozap
test -z "$(git status --porcelain)"
# Не создавать новый PM2 daemon при ошибочной учётной записи.
test -r "$HOME/.pm2/pm2.pid"
kill -0 "$(cat "$HOME/.pm2/pm2.pid")"
pm2 describe autozap >/dev/null
pm2 describe autozap-worker >/dev/null
BACKUP_DIR="/var/backups/autozap/$(date +%Y%m%d-%H%M%S)-site-release"
mkdir -m 700 "$BACKUP_DIR"
printf 'Backup directory: %s\n' "$BACKUP_DIR"
OLD_COMMIT="$(git rev-parse HEAD)"
printf '%s\n' "$OLD_COMMIT" > "$BACKUP_DIR/git-commit.before.txt"
git branch --show-current > "$BACKUP_DIR/git-branch.before.txt"
pm2 jlist > "$BACKUP_DIR/pm2-before.json"
test ! -f "$HOME/.pm2/dump.pm2" || cp -p "$HOME/.pm2/dump.pm2" "$BACKUP_DIR/pm2-dump.before.pm2"
node - "$BACKUP_DIR/pm2-before.json" <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const apps=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const name of ['autozap','autozap-worker']){
 const app=apps.find(a=>a.name===name);assert(app,'Expected existing PM2 application');
 const e=app.pm2_env;assert.equal(e.pm_cwd,'/var/www/autozap');
 assert(String(e.pm_exec_path).endsWith('/scripts/with-env.sh'));
 assert(JSON.stringify(e.args).includes(name==='autozap'?'.next/standalone/server.js':'scripts/background-worker.ts'));
 if(name==='autozap')assert.equal(String(e.env?.PORT??e.PORT),'3000');
}
console.log('PASS existing PM2 definitions');
NODE
HOSTNAME=127.0.0.1 PORT=3000 scripts/with-env.sh node <<'NODE'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert(['https://autozapchast-taldom.ru','https://autozapchast-taldom.ru/'].includes(process.env.APP_URL));
assert(process.env.DATABASE_URL);
assert((process.env.PRIVACY_CONSENT_SECRET??'').length>=32);
assert.equal(process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED,'false');
assert(!process.env.PORT||process.env.PORT==='3000');
assert(!process.env.HOSTNAME||process.env.HOSTNAME==='127.0.0.1');
const configured=process.env.IMPORT_STORAGE_ROOT?.trim();
assert(!configured||path.isAbsolute(configured));
const root=path.resolve(configured||process.cwd());assert.notEqual(root,'/');
assert(!root.startsWith(path.join(process.cwd(),'.next')+path.sep));
fs.accessSync(root,fs.constants.R_OK|fs.constants.W_OK|fs.constants.X_OK);
for(const base of new Set([root,process.cwd()])){
 const old=path.join(base,'.next/standalone/data/imports/uploads');
 const files=fs.existsSync(old)?fs.readdirSync(old,{withFileTypes:true}).filter(f=>f.isFile()):[];
 assert.equal(files.length,0,'STOP: legacy import files need separately approved migration before build');
}
console.log('PASS production configuration and persistent import storage');
NODE
sha256sum .env > "$BACKUP_DIR/env.before.sha256"
```

Если обнаружены legacy Excel-файлы внутри `.next/standalone/data/imports/uploads`,
**не продолжать build**: существующий `pnpm import:migrate-legacy-storage` перемещает
файлы и требует отдельного разрешения. Не запускать его автоматически.

## 2. Резервная копия рабочей версии и данных

В той же сессии:

```bash
items=(.next .env public package.json pnpm-lock.yaml ecosystem.config.cjs ecosystem.worker.config.cjs)
test ! -d data || items+=(data)
tar -czf "$BACKUP_DIR/current.tar.gz" "${items[@]}"
tar -tzf "$BACKUP_DIR/current.tar.gz" >/dev/null
STORAGE_ROOT="$(scripts/with-env.sh node -p 'require("node:path").resolve(process.env.IMPORT_STORAGE_ROOT||process.cwd())')"
if test "$STORAGE_ROOT" != /var/www/autozap && test -d "$STORAGE_ROOT/data/imports/uploads"; then
  tar -czf "$BACKUP_DIR/import-storage.tar.gz" -C "$STORAGE_ROOT" data/imports/uploads
fi
scripts/with-env.sh sh -c 'exec pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$1"' sh "$BACKUP_DIR/database.dump"
pg_restore --list "$BACKUP_DIR/database.dump" >/dev/null
pnpm fetch --frozen-lockfile
```

Dump содержит всю БД: товары, категории, цены, версии каталога, идентификаторы товаров,
согласия и служебные записи. Файловый архив содержит старую сборку, ключ подписи в `.env`,
картинки/загрузки и локальные данные. Backup и PM2 dump содержат секреты: не выводить
их в чат, не помещать в Git и не скачивать в публичное хранилище.
Скрипт ежедневного backup с удалением старых копий здесь не используется.

## 3. Получить ровно проверенный кандидат и проверить схему

```bash
git fetch origin codex/privacy-consent-save-diagnostics
TARGET_COMMIT="$(git rev-parse FETCH_HEAD)"
git merge-base --is-ancestor fef1dbc9255ee8bae339d6d1432e2f0e360af108 "$TARGET_COMMIT"
diff -u <(printf '%s\n' \
  deploy/releases/site-2026-10-24/schema-preflight.sql docs/site-release-2026-10-24.md \
  scripts/helpers/privacy-next-environment.ts scripts/test-privacy-origin.ts \
  scripts/test-privacy-save-browser.ts scripts/test-privacy-save-retry.ts \
  src/features/privacy/coordinator.ts src/features/privacy/privacy-provider.tsx | LC_ALL=C sort) \
  <(git diff --name-only fef1dbc9255ee8bae339d6d1432e2f0e360af108 "$TARGET_COMMIT" | LC_ALL=C sort)
while read -r expected file; do
  actual="$(git show "$TARGET_COMMIT:$file" | sha256sum)"
  test "${actual%% *}" = "$expected"
done <<'EXPECTED'
ba73a44ef94f89fc0dd00f47234b82e83ce3a851a7bed51db4965eb68a30e6ee  scripts/helpers/privacy-next-environment.ts
45748e13b9a992145548e9942faa3b0390f5b807e2bf3bc7daca818347fbd9c8  scripts/test-privacy-origin.ts
e06f0ef46301436428fb038e3944e5de95827dbf4e238106ff1ad7e954233498  scripts/test-privacy-save-browser.ts
587405a200c3b2587df851d6f64cff5c1f605a7f5ef5d1a8f53248d336bb9567  scripts/test-privacy-save-retry.ts
868c0cbaee31dae97d24f01e5fa3863ecf9f9dbf4ef57d7ef658a37894975e4e  src/features/privacy/coordinator.ts
8724b608ba09adfd7a60000f706a086935eb9b86e8f75021047f4c02638325b8  src/features/privacy/privacy-provider.tsx
523ed96e21011e16daf3cdd1eb11f516cf9ee98147662c7b4b770a6267a36646  deploy/releases/site-2026-10-24/schema-preflight.sql
EXPECTED
# Существующий регламент получает исходники до downtime; .next не трогать.
git switch --detach "$TARGET_COMMIT"
pnpm fetch --frozen-lockfile
sha256sum -c "$BACKUP_DIR/env.before.sha256"
scripts/with-env.sh sh -c 'exec psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$1"' sh deploy/releases/site-2026-10-24/schema-preflight.sql
```

SQL выполняет `BEGIN READ ONLY`, проверяет нужные столбцы, ограничения идемпотентности
и права SELECT/INSERT журнала, затем делает ROLLBACK. Он проверен на отдельной БД;
отрицательный контроль с отсутствующим столбцом останавливает проверку.

Новых миграций сверх 0001–0013 нет. 0012/0013 уже применены по сведениям пользователя.
При нехватке схемы остановиться и согласовать **конкретную** миграцию отдельно.
**Не выполнять `pnpm db:migrate`**: этот runner повторяет все SQL, включая изменения
категорий/подкатегорий и backfill product identities. Не выполнять seed, импорт,
перекатегоризацию, публикацию каталога, reindex или retention.

## 4. Короткое окно недоступности: install/build и штатный запуск

Только после успешного backup, скачивания зависимостей и schema gate:

```bash
pm2 stop autozap-worker
pm2 stop autozap
pnpm install --frozen-lockfile --offline --prod=false
scripts/with-env.sh env NODE_ENV=production YANDEX_METRIKA_CONFIGURATION_VERIFIED=false pnpm build
test -f .next/standalone/server.js
cmp -s .next/BUILD_ID .next/standalone/.next/BUILD_ID
test -d .next/standalone/public
test -d .next/standalone/.next/static
node - <<'NODE'
const fs=require('node:fs'),assert=require('node:assert/strict');
const m=JSON.parse(fs.readFileSync('.next/server/app-paths-manifest.json','utf8'));
for(const p of ['/page','/privacy/page','/privacy/analytics-consent/page','/api/privacy-consent/route'])assert(m[p],p);
NODE
sha256sum -c "$BACKUP_DIR/env.before.sha256"
pm2 delete autozap
pm2 start ecosystem.config.cjs
pm2 restart autozap-worker --update-env
```

Не запускать `next start`, не менять Nginx, не переключать трафик на 3100.
Не копировать macOS `.next` на Linux. После ошибки install/build **не запускать
частичную сборку** — перейти к откату ниже. Продолжительность downtime зависит от
сборки на сервере; скачивание зависимостей и backup уже выполнены заранее.

## 5. Проверка после публикации

```bash
for attempt in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null; then break; fi
  sleep 1
done
for base in http://127.0.0.1:3000 https://autozapchast-taldom.ru; do
  for route in / /catalog /search /spisok-pokupok /privacy /privacy/analytics-consent /api/privacy-consent; do
    code="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$base$route")"
    test "$code" = 200
  done
done
curl -fsS --max-time 15 https://autozapchast-taldom.ru/api/privacy-consent | node -e '
let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{
const assert=require("node:assert/strict"),v=JSON.parse(s);assert.equal(v.state,"unknown");assert.deepEqual(v.receipts,[]);console.log("PASS public JSON API without cookies");});'
node - <<'NODE'
const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const html=execFileSync('curl',['-fsS','--max-time','15','https://autozapchast-taldom.ru/'],{encoding:'utf8'});
const files=[...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(m=>m[1]);
const css=files.find(p=>p.includes('.css')),js=files.find(p=>p.includes('.js'));
if(!css||!js)throw Error('Missing current CSS/JS');
for(const p of [css,js]){const u=new URL(p,'https://autozapchast-taldom.ru');if(u.origin!=='https://autozapchast-taldom.ru')throw Error('Unexpected asset origin');execFileSync('curl',['-fsS','--max-time','15',u.href],{stdio:'ignore'});}
console.log('PASS current public CSS/JS assets');
NODE
pm2 describe autozap >/dev/null
pm2 describe autozap-worker >/dev/null
pm2 logs autozap --lines 30 --nostream
pm2 logs autozap-worker --lines 30 --nostream
# Только после успешных проверок:
pm2 save
```

Это GET-проверки без записи согласий. Не выводить журналы с персональными данными
или секретами в чат. Убедиться обычным открытием сайта в загрузке дизайна/каталога
и недоступности включения Метрики; реальный SDK не проверять и не включать.
Реальный POST согласия после публикации — отдельное разрешённое действие; локальные
API/SQL/UI-проверки уже выполнены на изолированной БД.

## 6. Откат приложения без восстановления/перезаписи рабочей БД

При ошибке после переключения исходников/остановки процессов, в той же Bash-сессии:

```bash
if pm2 describe autozap-worker >/dev/null 2>&1; then pm2 stop autozap-worker; fi
if pm2 describe autozap >/dev/null 2>&1; then pm2 stop autozap; fi
git switch --detach "$(cat "$BACKUP_DIR/git-commit.before.txt")"
# Не накладывать старую .next поверх новой. Сохранить неудачную сборку, не удалять.
if test -d .next; then test ! -e "$BACKUP_DIR/failed.next"; mv .next "$BACKUP_DIR/failed.next"; fi
tar -xzf "$BACKUP_DIR/current.tar.gz" .next
pnpm install --frozen-lockfile --offline --prod=false
sha256sum -c "$BACKUP_DIR/env.before.sha256"
if pm2 describe autozap >/dev/null 2>&1; then pm2 delete autozap; fi
pm2 start ecosystem.config.cjs
pm2 restart autozap-worker --update-env
for attempt in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null; then break; fi
  sleep 1
done
curl -fsS --max-time 15 http://127.0.0.1:3000/ >/dev/null
curl -fsS --max-time 15 https://autozapchast-taldom.ru/ >/dev/null
```

БД, `.env`, persistent storage и пользовательские загрузки при этом **не восстанавливать
поверх текущих данных**: деплой их не менял. Сохраняется исходный ключ подписи.
Не выполнять `pg_restore --clean` как обычный rollback. Если проблемы затронули данные
независимо от приложения, требуется отдельный план и разрешение на восстановление.
После rollback не делать `pm2 save` автоматически; старый dump сохранён приватно.
При смене исходников до downtime, если preflight не прошёл, вернуть `OLD_COMMIT`;
работающий старый standalone не перестраивать.

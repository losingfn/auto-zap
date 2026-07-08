# Backup и восстановление production

## Что обязательно бэкапить

1. PostgreSQL базу `autozap`.
2. `.env` на сервере.
3. `/var/www/autozap/public/uploads`, если в админке появятся загружаемые файлы.
4. `/var/www/autozap/data/imports/uploads`, если нужно хранить исходные Excel-файлы.
5. `/etc/nginx/sites-available/autozap`.
6. `/var/www/autozap/ecosystem.config.cjs`.

Meilisearch индекс можно пересобрать командой `pnpm search:sync`, поэтому он менее критичен, чем PostgreSQL.

## Ежедневный backup PostgreSQL

Скрипт:

```bash
deploy/scripts/backup-postgres.sh
```

Ручной запуск:

```bash
cd /var/www/autozap
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
export BACKUP_DIR=/var/backups/autozap/postgres
export KEEP_DAYS=14
deploy/scripts/backup-postgres.sh
```

Скрипт создаёт `custom` dump через `pg_dump`, сжимает его gzip и удаляет копии старше `KEEP_DAYS`.

## Cron

```bash
sudo crontab -e
```

```cron
15 3 * * * cd /var/www/autozap && export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" && BACKUP_DIR=/var/backups/autozap/postgres KEEP_DAYS=14 /usr/bin/env bash deploy/scripts/backup-postgres.sh >> /var/log/autozap-backup.log 2>&1
```

Проверка:

```bash
ls -lh /var/backups/autozap/postgres
tail -n 100 /var/log/autozap-backup.log
```

## Восстановление PostgreSQL

Остановите приложение:

```bash
pm2 stop autozap
```

Создайте пустую БД или очистите существующую:

```bash
sudo -u postgres dropdb autozap
sudo -u postgres createdb autozap -O autozap_user
```

Восстановите:

```bash
gunzip -c /var/backups/autozap/postgres/autozap-YYYYMMDD-HHMMSS.dump.gz > /tmp/autozap.dump
pg_restore --dbname="postgresql://autozap_user:CHANGE_ME@localhost:5432/autozap" --clean --if-exists --no-owner --no-acl /tmp/autozap.dump
```

Пересоберите поиск и запустите приложение:

```bash
cd /var/www/autozap
pnpm search:sync
pm2 start autozap
```

## Backup проекта

Минимально сохранить:

```bash
sudo tar -czf /var/backups/autozap/autozap-config-$(date +%Y%m%d).tar.gz \
  /var/www/autozap/.env \
  /var/www/autozap/ecosystem.config.cjs \
  /etc/nginx/sites-available/autozap
```

Если есть uploads:

```bash
sudo tar -czf /var/backups/autozap/autozap-uploads-$(date +%Y%m%d).tar.gz \
  /var/www/autozap/public/uploads \
  /var/www/autozap/data/imports/uploads
```

## Проверка backup

Минимум раз в месяц:

1. Скачать свежий backup.
2. Восстановить в отдельную тестовую БД.
3. Запустить `pnpm search:sync` на тестовой БД.
4. Проверить `/`, `/catalog`, `/search?q=масло`, `/admin`.

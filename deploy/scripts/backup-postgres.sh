#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/autozap/postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="$BACKUP_DIR/autozap-$timestamp.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_path"
gzip -9 "$backup_path"

find "$BACKUP_DIR" -type f -name "autozap-*.dump.gz" -mtime "+$KEEP_DAYS" -delete

echo "Created $backup_path.gz"

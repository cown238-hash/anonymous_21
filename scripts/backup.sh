#!/usr/bin/env bash
#
# Timestamped PostgreSQL backup + retention.
#
#   ./scripts/backup.sh                      # write backups/nimbus-<ts>.dump
#   ./scripts/backup.sh /mnt/backups         # custom directory
#
# Restoring:
#   pg_restore -d nimbus --clean --if-exists backups/nimbus-<ts>.dump
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/server/.env" ]; then
  # shellcheck disable=SC1091
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/server/.env" | head -n1 | cut -d= -f2- | tr -d '"')"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set and could not be read from server/.env" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install the PostgreSQL client tools." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/nimbus-$STAMP.dump"

echo "▸ backing up to $FILE"
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$FILE"

gzip -f "$FILE"
COMPRESSED="$FILE.gz"

SIZE="$(du -h "$COMPRESSED" | cut -f1)"
echo "✓ backup complete ($SIZE)"

# Optional off-site copy.
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "▸ uploading to s3://$BACKUP_S3_BUCKET"
    aws s3 cp "$COMPRESSED" "s3://$BACKUP_S3_BUCKET/" --storage-class STANDARD_IA
  else
    echo "! aws cli not found; skipping off-site copy" >&2
  fi
fi

echo "▸ pruning backups older than $RETENTION_DAYS days"
find "$OUT_DIR" -name 'nimbus-*.dump.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete

echo "✓ done"
#!/usr/bin/env bash
#
# Restores the most recent backup (or a specific file) into DATABASE_URL.
#
#   ./scripts/restore.sh
#   ./scripts/restore.sh backups/nimbus-20260101T000000Z.dump.gz
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/server/.env" ]; then
  # shellcheck disable=SC1091
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/server/.env" | head -n1 | cut -d= -f2- | tr -d '"')"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set and could not be read from server/.env" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  FILE="$1"
else
  FILE="$(ls -t "$ROOT"/backups/nimbus-*.dump.gz 2>/dev/null | head -n1 || true)"
fi

if [ -z "${FILE:-}" ] || [ ! -f "$FILE" ]; then
  echo "no backup found. Pass a path explicitly." >&2
  exit 1
fi

if [[ "$FILE" == *.gz ]]; then
  echo "▸ decompressing $FILE"
  TMP="$(mktemp -d)/restore.dump"
  gunzip -c "$FILE" > "$TMP"
  FILE="$TMP"
fi

read -rp "This will OVERWRITE the target database. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "aborted"
  exit 1
fi

echo "▸ restoring $FILE"
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl "$FILE"

echo "✓ restore complete"
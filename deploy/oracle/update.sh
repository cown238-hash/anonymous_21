#!/usr/bin/env bash
#
# Pull, rebuild and restart the stack on the Oracle VM.
#
#   ./deploy/oracle/update.sh
#
# Uploads and the database live in compose volumes (uploads-data, db-data), so
# they survive every rebuild.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

COMPOSE="docker compose -f docker-compose.yml -f deploy/oracle/compose.oracle.yml"

echo "▸ pulling latest code"
git pull --ff-only

echo "▸ building (ARM build takes a few minutes the first time)"
$COMPOSE build

echo "▸ applying migrations + restarting"
# The container entrypoint runs `prisma migrate deploy` before starting.
$COMPOSE up -d

echo "▸ pruning old images"
docker image prune -f

echo "▸ health check"
sleep 5
if curl -fsS "http://127.0.0.1:${APP_PORT:-4000}/api/ready" > /dev/null; then
  echo "✓ app is ready"
else
  echo "! /api/ready did not answer — check: $COMPOSE logs -f app"
fi

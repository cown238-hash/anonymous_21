#!/bin/sh
set -e

echo "▸ nimbus container starting"

# Apply pending migrations before serving traffic. `db push` is deliberately
# not used here: it can silently drop columns in production.
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ -d /app/server/prisma/migrations ]; then
  echo "▸ applying database migrations"
  node /app/node_modules/prisma/build/index.js migrate deploy \
    --schema=/app/server/prisma/schema.prisma
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "▸ seeding database"
  node /app/node_modules/prisma/build/index.js db seed \
    --schema=/app/server/prisma/schema.prisma
fi

echo "▸ starting: $*"
exec "$@"
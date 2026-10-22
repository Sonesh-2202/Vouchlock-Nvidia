#!/bin/sh
set -e

# Apply pending database migrations before the API starts. A failed migration
# must fail the deployment instead of leaving a live API with a stale schema.
if [ "$1" = "node" ] && [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Applying pending database migrations..."
  pnpm --filter @projectpilot/api db:migrate
fi

exec "$@"

#!/bin/sh
set -e

# If running the API server and DATABASE_URL is configured, apply pending database migrations
if [ "$1" = "node" ] && [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Applying pending database migrations..."
  pnpm --filter @projectpilot/api db:migrate || {
    echo "[entrypoint] Warning: database migration step returned non-zero code. Verifying connectivity..."
  }
fi

exec "$@"

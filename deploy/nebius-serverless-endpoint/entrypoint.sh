#!/bin/sh
set -e

echo "=== Starting Vouchlock Interactive Application Service ==="

# 1. Start the Fastify API backend in background on port 4000
echo "[1/3] Starting Fastify API server on port 4000..."
NODE_ENV=production PORT=4000 API_PORT=4000 API_HOST=127.0.0.1 node /app/apps/api/dist/server.js &
API_PID=$!

# 2. Wait for API server to become ready
echo "[2/3] Waiting for API health probe on http://127.0.0.1:4000/health..."
MAX_TRIES=30
TRIES=0
until curl -s http://127.0.0.1:4000/health > /dev/null; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge $MAX_TRIES ]; then
    echo "ERROR: Fastify API backend failed to initialize within 30 seconds."
    kill -9 $API_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
echo "Fastify API backend is healthy (PID $API_PID)."

# 3. Start Nginx reverse proxy in foreground on port 8080
echo "[3/3] Starting Nginx reverse proxy on port 8080..."
nginx -g "daemon off;"

# ── Stage 1: Build Application (Contracts, Domain, Web, API) ──
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy dependency manifests and configs
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source trees
COPY packages/contracts ./packages/contracts
COPY packages/domain ./packages/domain
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build all packages, web static bundle, and API
RUN pnpm --filter @projectpilot/contracts run build && \
    pnpm --filter @projectpilot/domain run build && \
    pnpm --filter @projectpilot/web run build && \
    pnpm --filter @projectpilot/api run build

# ── Stage 2: Unified Production Serverless Runner ──
FROM alpine:3.20 AS runner

# Install Node.js 20 runtime, Nginx, and curl for health probes
RUN apk add --no-cache nodejs nginx curl

WORKDIR /app

# Copy built API and node_modules from builder
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/packages/domain ./packages/domain
COPY --from=builder /app/apps/api ./apps/api

# Copy compiled SPA static assets to Nginx document root
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy Nginx serverless configuration and entrypoint
COPY deploy/nebius-serverless-endpoint/nginx.conf /etc/nginx/http.d/default.conf
COPY deploy/nebius-serverless-endpoint/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Environment variables (overridden by Nebius Serverless Endpoint config)
ENV NODE_ENV=production
ENV PORT=4000
ENV API_PORT=4000
ENV API_HOST=127.0.0.1
ENV NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1

# Expose HTTP port for Nebius Serverless Endpoint
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

# ── Stage 1: Build packages and API ──
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy dependency manifests and workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source trees
COPY packages/contracts ./packages/contracts
COPY packages/domain ./packages/domain
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Build shared packages, API, and the web client served by the API container.
RUN pnpm --filter @projectpilot/contracts run build && \
    pnpm --filter @projectpilot/domain run build && \
    pnpm --filter @projectpilot/api run build && \
    pnpm --filter @projectpilot/web run build

# ── Stage 2: Production runtime ──
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV API_PORT=4000
ENV SERVE_WEB=true

# Install curl and postgresql-client for container health checks and operations
RUN apk add --no-cache curl postgresql-client

# Copy built workspace and node_modules from builder
COPY --from=builder /app ./
COPY --from=builder /app/apps/web/dist /app/apps/web/dist

# Make entrypoint executable and ensure non-root user permissions
RUN chmod +x apps/api/docker-entrypoint.sh && \
    chown -R node:node /app

USER node

EXPOSE 4000 10000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f "http://localhost:${PORT:-4000}/health/ready" || exit 1

ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]

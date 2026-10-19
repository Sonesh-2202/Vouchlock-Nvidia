/**
 * ProjectPilot API Application Builder
 * Modular Fastify instance creation for server startup and integration testing.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { loadConfig, type AppConfig } from './config.js';
import { createDb, type Database } from './db/connection.js';
import { createLogger, type Logger } from './logger.js';
import { authRoutes } from './routes/auth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { requirementRoutes } from './routes/requirements.js';
import { meRoutes } from './routes/me.js';
import { copilotRoutes } from './routes/copilot.js';
import { mcpRoutes } from './routes/mcp.js';
import { modelRoutes } from './routes/models.js';
import { jobsRoutes } from './routes/jobs.js';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import type postgres from 'postgres';

export interface BuildAppOptions {
  config?: Partial<AppConfig>;
  db?: Database;
  client?: postgres.Sql;
  logger?: Logger;
  rateLimitMax?: number;
}

export interface BuiltApp {
  app: FastifyInstance;
  config: AppConfig;
  db: Database;
  client: postgres.Sql | null;
  logger: Logger;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<BuiltApp> {
  const baseConfig = loadConfig();
  const config: AppConfig = {
    ...baseConfig,
    ...options.config,
  };

  const logger = options.logger ?? createLogger(config.logLevel, config.logRedact);
  let db = options.db;
  let client: postgres.Sql | null = options.client ?? null;

  if (!db) {
    const conn = createDb(config.databaseUrl);
    db = conn.db;
    client = conn.client;
  }

  const app = Fastify({
    logger: false,
    genReqId: () => nanoid(12),
    requestTimeout: 30000,
  });

  // Gracefully handle empty JSON request bodies without throwing FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err: unknown) {
      const parseError = err as { statusCode?: number };
      parseError.statusCode = 400;
      done(err as Error, undefined);
    }
  });

  // ── Plugins ──
  await app.register(fastifyCookie);

  await app.register(fastifyCors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });

  await app.register(fastifyRateLimit, {
    max: options.rateLimitMax ?? 120,
    timeWindow: '1 minute',
  });

  // ── Request logging with redaction ──
  app.addHook('onRequest', (request, _reply, done) => {
    logger.info(
      { reqId: request.id, method: request.method, url: request.url },
      'incoming request',
    );
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    logger.info(
      { reqId: request.id, statusCode: reply.statusCode, responseTime: reply.elapsedTime },
      'request complete',
    );
    done();
  });

  // ── Global Error Handler ──
  app.setErrorHandler((error, request, reply) => {
    logger.error({ reqId: request.id, err: error }, 'Unhandled request error');

    const err = (error ?? {}) as { code?: string; message?: string; statusCode?: number };
    const errMessage = err.message || '';
    const isDbError =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'ETIMEDOUT' ||
      errMessage.includes('ECONNREFUSED') ||
      errMessage.includes('password authentication failed') ||
      (errMessage.includes('database') && errMessage.includes('does not exist')) ||
      (errMessage.includes('relation') && errMessage.includes('does not exist'));

    if (isDbError) {
      let friendlyMessage = 'Database service is unavailable. Please verify PostgreSQL is running and reachable.';
      if (errMessage.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED') {
        friendlyMessage =
          'Database connection refused. PostgreSQL is not reachable at the configured host/port in DATABASE_URL. Please verify PostgreSQL is running or start it via Docker (docker compose up -d postgres).';
      } else if (errMessage.includes('password authentication failed')) {
        friendlyMessage =
          'Database authentication failed. Please check the username and password in DATABASE_URL in your .env file.';
      } else if (errMessage.includes('does not exist')) {
        friendlyMessage =
          'Database or table does not exist. Please create the database and run migrations with `pnpm db:migrate`.';
      }

      return reply.code(503).send({
        error: {
          code: 'database_unavailable',
          message: friendlyMessage,
        },
      });
    }

    const statusCode = err.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        code: err.code || 'internal_error',
        message:
          statusCode === 500
            ? 'An unexpected error occurred. Please try again.'
            : err.message || 'An unexpected error occurred.',
      },
    });
  });

  // ── Health endpoints ──
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.get('/health/ready', async (_req, reply) => {
    try {
      await db!.execute(sql`SELECT 1`);
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch (err) {
      logger.error({ err }, 'readiness check failed');
      return reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── API Routes ──
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth', config, db: db!, logger });
      await api.register(workspaceRoutes, { prefix: '/workspaces', config, db: db!, logger });
      await api.register(projectRoutes, { prefix: '/projects', config, db: db!, logger });
      await api.register(requirementRoutes, { prefix: '/projects', config, db: db!, logger });
      await api.register(taskRoutes, { prefix: '/tasks', config, db: db!, logger });
      await api.register(meRoutes, { prefix: '/me', config, db: db!, logger });
      await api.register(copilotRoutes, { prefix: '/copilot', config, db: db!, logger });
      await api.register(mcpRoutes, { prefix: '/mcp', config, db: db!, logger });
      await api.register(modelRoutes, { prefix: '/models', config, db: db!, logger });
      await api.register(jobsRoutes, { prefix: '/jobs', config, db: db!, logger });
    },
    { prefix: '/api/v1' },
  );

  // ── MCP Server & Custom Tool Endpoints (/mcp, /mcp/v1) ──
  await app.register(mcpRoutes, { prefix: '/mcp', config, db: db!, logger });
  await app.register(mcpRoutes, { prefix: '/mcp/v1', config, db: db!, logger });

  return { app, config, db, client, logger };
}

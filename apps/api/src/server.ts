/**
 * Vouchlock API Server — Fastify
 * Entrypoint for HTTP server lifecycle.
 */

import { sql } from 'drizzle-orm';
import { buildApp } from './app.js';

async function main() {
  const { app, config, db, client, logger } = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info({ port: config.port, host: config.host }, 'Vouchlock API started');

    // Startup database connection probe
    try {
      await db.execute(sql`SELECT 1`);
      logger.info('Database connection established successfully');
    } catch (dbErr: any) {
      logger.warn(
        { err: dbErr.message },
        '⚠️ Warning: Unable to connect to PostgreSQL database. API started, but database operations will fail until PostgreSQL is reachable with the credentials in DATABASE_URL.',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    if (client) {
      await client.end();
    }
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await app.close();
    if (client) {
      await client.end();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();

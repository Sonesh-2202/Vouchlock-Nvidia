/**
 * Vouchlock API Server — Fastify
 * Entrypoint for HTTP server lifecycle.
 */

import { buildApp } from './app.js';

async function main() {
  const { app, config, client, logger } = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info({ port: config.port, host: config.host }, 'Vouchlock API started');
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

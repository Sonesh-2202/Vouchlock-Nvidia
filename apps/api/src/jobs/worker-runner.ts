/**
 * Nebius Serverless Job Worker Runner
 * Standalone entrypoint executed inside the worker container for portfolio audits.
 * Invoked via: node dist/jobs/worker-runner.js --job-id <uuid>
 * Or with environment variables: JOB_ID=<uuid> WORKSPACE_ID=<uuid>
 */

import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/connection.js';
import { createLogger } from '../logger.js';
import { serverlessJobs } from '../db/schema.js';
import { portfolioAuditJobService } from './portfolio-audit-service.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.logRedact);
  const { db } = createDb(config.databaseUrl);

  // Parse arguments or environment
  const args = process.argv.slice(2);
  let jobId = process.env['JOB_ID'] || '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--job-id' && args[i + 1]) {
      jobId = args[i + 1]!;
      break;
    }
  }

  if (!jobId) {
    logger.error('No JOB_ID provided to worker runner. Specify via --job-id <id> or JOB_ID env var.');
    process.exit(1);
  }

  logger.info({ jobId }, 'Nebius Serverless Job worker started');

  const [job] = await db
    .select()
    .from(serverlessJobs)
    .where(eq(serverlessJobs.id, jobId))
    .limit(1);

  if (!job) {
    logger.error({ jobId }, 'Job record not found in database');
    process.exit(1);
  }

  const input = (job.inputParams as any) || {
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    userId: job.userId,
    modelOverride: undefined,
    roleProfile: job.modelRole || 'deep_reasoning',
  };

  try {
    // Mark as running
    await db
      .update(serverlessJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        progressPercent: 10,
        updatedAt: new Date(),
      })
      .where(eq(serverlessJobs.id, jobId));

    // Execute audit analysis using the service's logic
    await portfolioAuditJobService.executeLocalJob(
      jobId,
      {
        workspaceId: job.workspaceId,
        projectId: job.projectId || undefined,
        userId: job.userId,
        modelOverride: input.modelOverride || undefined,
        roleProfile: input.roleProfile || 'deep_reasoning',
      },
      config,
      db,
      logger,
    );

    logger.info({ jobId }, 'Nebius Serverless Job worker completed successfully');
    process.exit(0);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, jobId }, 'Nebius Serverless Job worker failed');

    await db
      .update(serverlessJobs)
      .set({
        status: 'failed',
        error: errorMsg,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serverlessJobs.id, jobId));

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in worker runner:', err);
  process.exit(1);
});

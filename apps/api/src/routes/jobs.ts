/**
 * Asynchronous Serverless Jobs Routes (/api/v1/jobs)
 * Provides workspace portfolio delivery audits and evidence gap workflows.
 * Supports progress polling, cancellation, and execution target status.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createPortfolioAuditJobSchema } from '@projectpilot/contracts';
import { hasPermission } from '@projectpilot/domain';
import { authenticate } from '../auth.js';
import { workspaceMembers, serverlessJobs } from '../db/schema.js';
import { portfolioAuditJobService } from '../jobs/portfolio-audit-service.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface JobsRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

export async function jobsRoutes(app: FastifyInstance, opts: JobsRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/jobs/portfolio-audit — start or resume an asynchronous portfolio delivery audit
  app.post('/portfolio-audit', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const parsed = createPortfolioAuditJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid portfolio audit job parameters',
          details: parsed.error.flatten(),
        },
      });
    }

    const { workspaceId, projectId, modelOverride, roleProfile, executionTargetPreference, idempotencyKey } = parsed.data;

    // Check workspace membership
    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    if (!member || !hasPermission(member.role, 'ai:generate')) {
      return reply.code(403).send({
        error: {
          code: 'forbidden',
          message: 'Insufficient permission to launch portfolio delivery audits in this workspace.',
        },
      });
    }

    try {
      const job = await portfolioAuditJobService.submitAuditJob(
        {
          workspaceId,
          projectId,
          userId,
          modelOverride,
          roleProfile,
          executionTargetPreference,
          idempotencyKey,
        },
        config,
        db,
        logger,
      );

      return reply.code(202).send({
        job,
      });
    } catch (err: unknown) {
      logger.error({ err, workspaceId }, 'failed to submit portfolio audit job');
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({
        error: {
          code: 'job_submission_failed',
          message: msg || 'Could not queue portfolio audit job',
        },
      });
    }
  });

  // GET /api/v1/jobs/:jobId — retrieve status, progress, and result of a job
  app.get('/:jobId', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const params = request.params as { jobId: string };

    // Find job
    const [jobRow] = await db
      .select()
      .from(serverlessJobs)
      .where(eq(serverlessJobs.id, params.jobId))
      .limit(1);

    if (!jobRow) {
      return reply.code(404).send({
        error: { code: 'job_not_found', message: 'The requested job was not found.' },
      });
    }

    // Verify workspace access
    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, jobRow.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    if (!member) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'You do not have access to this workspace job.' },
      });
    }

    const job = await portfolioAuditJobService.getJob(jobRow.id, jobRow.workspaceId, db);
    return reply.code(200).send({ job });
  });

  // POST /api/v1/jobs/:jobId/cancel — cancel a running or queued job
  app.post('/:jobId/cancel', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const params = request.params as { jobId: string };

    const [jobRow] = await db
      .select()
      .from(serverlessJobs)
      .where(eq(serverlessJobs.id, params.jobId))
      .limit(1);

    if (!jobRow) {
      return reply.code(404).send({
        error: { code: 'job_not_found', message: 'The requested job was not found.' },
      });
    }

    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, jobRow.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    if (!member || !hasPermission(member.role, 'ai:generate')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permission to cancel this job.' },
      });
    }

    const cancelledJob = await portfolioAuditJobService.cancelJob(jobRow.id, jobRow.workspaceId, db, logger);
    return reply.code(200).send({ job: cancelledJob });
  });

  // GET /api/v1/workspaces/:workspaceId/jobs — list jobs in a workspace
  app.get('/workspace/:workspaceId', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const params = request.params as { workspaceId: string };

    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, params.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    if (!member) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Access denied to this workspace.' },
      });
    }

    const jobs = await portfolioAuditJobService.listJobs(params.workspaceId, db);
    return reply.code(200).send({ jobs });
  });
}

/**
 * Copilot Routes (/api/v1/copilot).
 * Bounded read -> propose -> approve workflow.
 * Strictly enforces human-in-the-loop: no autonomous writes.
 * Prompt injection defense: project records isolated in delimiters.
 * Every report, approval, and rejection is recorded in auditEvents.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import {
  generateCopilotReportSchema,
  approveCopilotActionSchema,
  rejectCopilotActionSchema,
} from '@projectpilot/contracts';
import { hasPermission } from '@projectpilot/domain';
import { authenticate } from '../auth.js';
import { readCopilotContext, CopilotAccessError } from '../copilot/context-reader.js';
import { generateCopilotReport, computeProposalId } from '../copilot/report-generator.js';
import { ephemeralSessionStore } from '../ai/planner.js';
import {
  projects,
  workspaceMembers,
  aiGenerations,
  auditEvents,
  tasks,
  milestones,
  requirements,
  evidence,
} from '../db/schema.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface CopilotRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

export async function copilotRoutes(app: FastifyInstance, opts: CopilotRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/copilot/reports — generate bounded read-only analysis report
  app.post('/reports', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const parsed = generateCopilotReportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid report request payload',
          details: parsed.error.flatten(),
        },
      });
    }

    const { projectId, providerOverride } = parsed.data;

    let context;
    try {
      context = await readCopilotContext(db, userId, projectId);
    } catch (err) {
      if (err instanceof CopilotAccessError) {
        return reply.code(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }

    // RBAC check: ai:generate
    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, context.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member || !hasPermission(member.role, 'ai:generate')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permission to generate AI reports' },
      });
    }

    const effectiveProvider = providerOverride || config.aiProvider || 'mock';
    const sessionApiKey = ephemeralSessionStore.getSessionKey(
      userId,
      effectiveProvider,
      context.workspaceId,
    );

    let report;
    try {
      report = await generateCopilotReport(
        context,
        userId,
        providerOverride ? { ...config, aiProvider: providerOverride as any } : config,
        sessionApiKey,
      );
    } catch (err: unknown) {
      logger.error(
        { err, projectId, provider: effectiveProvider },
        'copilot report generation failed',
      );
      const errorObj = err as { code?: string; message?: string };
      const statusCode =
        errorObj.code === 'ai_auth_error'
          ? 401
          : errorObj.code === 'ai_rate_limit'
            ? 429
            : errorObj.code === 'ai_timeout'
              ? 504
              : errorObj.code === 'ai_model_not_found'
                ? 422
                : errorObj.code === 'ai_server_error'
                  ? 503
                  : 500;
      return reply.code(statusCode).send({
        error: {
          code: errorObj.code || 'ai_generation_failed',
          message:
            errorObj.message ||
            (effectiveProvider === 'gemini'
              ? 'Google Gemini API key is missing. Add your Google AI Studio key in Settings.'
              : 'Failed to generate Copilot report.'),
        },
      });
    }

    // Save report in aiGenerations
    await db.insert(aiGenerations).values({
      projectId,
      requesterId: userId,
      kind: 'copilot_report',
      provider: report.provider,
      model: report.model,
      inputHash: computeProposalId('report', projectId, { generatedAt: report.generatedAt }),
      outputJson: report,
    });

    // Write audit event
    await db.insert(auditEvents).values({
      workspaceId: context.workspaceId,
      actorId: userId,
      action: 'copilot_report_generated',
      subjectType: 'project',
      subjectId: projectId,
      metadata: {
        provider: report.provider,
        model: report.model,
        proposedActionsCount: report.proposedActions.length,
        evidenceGapsCount: report.evidenceGaps.length,
      },
    });

    logger.info({ userId, projectId, provider: report.provider }, 'copilot report generated');
    return reply.code(200).send({ report });
  });

  // POST /api/v1/copilot/approve — execute ONE proposed action with human approval
  app.post('/approve', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const parsed = approveCopilotActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid approval payload',
          details: parsed.error.flatten(),
        },
      });
    }

    const { projectId, proposalId, action } = parsed.data;

    // 1. Verify project exists
    const [project] = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    // 2. Check RBAC permissions
    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, project.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member || !hasPermission(member.role, 'ai:accept')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permission to approve AI proposals' },
      });
    }

    // 3. Verify proposal content hash
    const expectedProposalId = computeProposalId(
      action.actionType,
      action.description,
      action.payload,
    );

    if (proposalId !== expectedProposalId) {
      return reply.code(400).send({
        error: {
          code: 'invalid_proposal_id',
          message: 'Proposal ID does not match the content hash of the proposed action.',
        },
      });
    }

    // 4. Execute single action based on type
    let entityId = projectId;
    const payload = action.payload as Record<string, any>;

    switch (action.actionType) {
      case 'create_task': {
        if (!hasPermission(member.role, 'task:create')) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient permission to create tasks' },
          });
        }
        const [newTask] = await db
          .insert(tasks)
          .values({
            projectId,
            createdBy: userId,
            title: payload.title || action.description,
            description: payload.description || `Created via Copilot proposal ${proposalId}`,
            milestoneId: payload.milestoneId || null,
            status: payload.status || 'todo',
            priority: payload.priority || 'normal',
          })
          .returning({ id: tasks.id });
        if (newTask) entityId = newTask.id;
        break;
      }

      case 'update_task': {
        if (!hasPermission(member.role, 'task:update')) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient permission to update tasks' },
          });
        }
        const taskId = payload.taskId;
        if (!taskId) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: 'Missing taskId in payload' },
          });
        }
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (payload.status) updateData.status = payload.status;
        if (payload.title) updateData.title = payload.title;
        if (payload.description !== undefined) updateData.description = payload.description;
        if (payload.priority) updateData.priority = payload.priority;
        if (payload.milestoneId !== undefined) updateData.milestoneId = payload.milestoneId;

        await db
          .update(tasks)
          .set(updateData)
          .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
        entityId = taskId;
        break;
      }

      case 'create_milestone': {
        if (!hasPermission(member.role, 'project:update')) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient permission to create milestones' },
          });
        }
        const [newMilestone] = await db
          .insert(milestones)
          .values({
            projectId,
            title: payload.title || action.description,
            description: payload.description || null,
            dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
          })
          .returning({ id: milestones.id });
        if (newMilestone) entityId = newMilestone.id;
        break;
      }

      case 'update_requirement': {
        if (!hasPermission(member.role, 'requirement:update')) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient permission to update requirements' },
          });
        }
        const reqId = payload.requirementId;
        if (!reqId) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: 'Missing requirementId in payload' },
          });
        }
        await db
          .update(requirements)
          .set({
            status: payload.status || 'active',
            description: payload.description,
            updatedAt: new Date(),
          })
          .where(and(eq(requirements.id, reqId), eq(requirements.projectId, projectId)));
        entityId = reqId;
        break;
      }

      case 'request_evidence': {
        if (!hasPermission(member.role, 'evidence:create')) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient permission to request evidence' },
          });
        }
        const reqId = payload.requirementId;
        if (!reqId) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: 'Missing requirementId in payload' },
          });
        }
        const [newEvidence] = await db
          .insert(evidence)
          .values({
            projectId,
            requirementId: reqId,
            authorUserId: userId,
            type: 'note',
            title: payload.evidenceTitle || 'Verification Request (Copilot)',
            content: `Evidence requested via Copilot proposal ${proposalId}. Context: ${action.description}`,
          })
          .returning({ id: evidence.id });
        if (newEvidence) entityId = newEvidence.id;
        break;
      }

      default:
        return reply.code(400).send({
          error: {
            code: 'unsupported_action',
            message: `Action ${action.actionType} is not supported`,
          },
        });
    }

    // Write audit event
    await db.insert(auditEvents).values({
      workspaceId: project.workspaceId,
      actorId: userId,
      action: 'copilot_approved',
      subjectType: action.actionType,
      subjectId: entityId,
      metadata: {
        proposalId,
        actionType: action.actionType,
        description: action.description,
        projectId,
      },
    });

    logger.info(
      { userId, projectId, proposalId, actionType: action.actionType },
      'copilot action approved',
    );
    return reply.code(200).send({
      success: true,
      proposalId,
      entityId,
      actionType: action.actionType,
    });
  });

  // POST /api/v1/copilot/reject — log user rejection of proposed action
  app.post('/reject', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const parsed = rejectCopilotActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid rejection payload',
          details: parsed.error.flatten(),
        },
      });
    }

    const { projectId, proposalId, reason } = parsed.data;

    const [project] = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    // Write audit event
    await db.insert(auditEvents).values({
      workspaceId: project.workspaceId,
      actorId: userId,
      action: 'copilot_rejected',
      subjectType: 'project',
      subjectId: projectId,
      metadata: {
        proposalId,
        reason: reason || 'User rejected proposed action',
      },
    });

    logger.info({ userId, projectId, proposalId }, 'copilot proposal rejected');
    return reply.code(200).send({
      success: true,
      proposalId,
    });
  });
}

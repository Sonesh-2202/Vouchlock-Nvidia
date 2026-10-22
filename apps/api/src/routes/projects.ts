/**
 * Project routes — CRUD with workspace scope enforcement.
 * PATCH uses version/If-Match for conflict detection.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import {
  createProjectSchema,
  updateProjectSchema,
  generatePlanDraftSchema,
  acceptPlanDraftSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  createBriefRevisionSchema,
  extractRequirementsInputSchema,
  acceptProposalInputSchema,
} from '@projectpilot/contracts';
import {
  hasPermission,
  validateBriefRevisionInput,
  validateProposalCandidates,
  type PlanDraft,
} from '@projectpilot/domain';
import {
  projects,
  workspaceMembers,
  milestones,
  tasks,
  auditEvents,
  users,
  aiGenerations,
  projectBriefRevisions,
  requirements,
} from '../db/schema.js';
import { authenticate } from '../auth.js';
import { generatePlan, extractRequirementsProposal, ephemeralSessionStore } from '../ai/planner.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface ProjectRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

async function getMemberRole(db: Database, workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return member?.role ?? null;
}

export async function projectRoutes(app: FastifyInstance, opts: ProjectRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/workspaces/:workspaceId/projects
  app.post<{ Params: { workspaceId: string } }>(
    '/workspaces/:workspaceId/projects',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { workspaceId } = request.params;

      const role = await getMemberRole(db, workspaceId, userId);
      if (!role || !hasPermission(role, 'project:create')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const [project] = await db
        .insert(projects)
        .values({
          workspaceId,
          name: parsed.data.name,
          goal: parsed.data.goal,
          audience: parsed.data.audience ?? null,
          deliverable: parsed.data.deliverable ?? null,
          deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
          constraints: parsed.data.constraints ?? {},
          successMeasures: parsed.data.successMeasures ?? {},
          createdBy: userId,
        })
        .returning();

      await db.insert(auditEvents).values({
        workspaceId,
        actorId: userId,
        action: 'project.created',
        subjectType: 'project',
        subjectId: project!.id,
      });

      logger.info({ userId, projectId: project!.id, workspaceId }, 'project created');
      return reply.code(201).send({ project });
    },
  );

  // GET /api/v1/workspaces/:workspaceId/projects
  app.get<{ Params: { workspaceId: string }; Querystring: { status?: string } }>(
    '/workspaces/:workspaceId/projects',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { workspaceId } = request.params;

      const role = await getMemberRole(db, workspaceId, userId);
      if (!role) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Workspace not found' },
        });
      }

      const conditions = [eq(projects.workspaceId, workspaceId)];
      const statusFilter = request.query.status;
      if (statusFilter === 'active' || statusFilter === 'archived') {
        conditions.push(eq(projects.status, statusFilter));
      }

      const results = await db
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(projects.createdAt);

      return { projects: results };
    },
  );

  // GET /api/v1/projects/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    // Enforce workspace membership
    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    // Load milestones and tasks
    const projectMilestones = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(milestones.sortOrder);

    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, id))
      .orderBy(tasks.sortOrder);

    return { project, milestones: projectMilestones, tasks: projectTasks, currentUserRole: role };
  });

  // PATCH /api/v1/projects/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, existing.workspaceId, userId);
    if (!role || !hasPermission(role, 'project:update')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    // Optimistic concurrency
    if (parsed.data.version !== existing.version) {
      return reply.code(409).send({
        error: {
          code: 'conflict',
          message: 'Project has been modified. Refresh and try again.',
          details: { currentVersion: existing.version },
        },
      });
    }

    const { version: _v, ...updateData } = parsed.data;
    const [updated] = await db
      .update(projects)
      .set({
        ...updateData,
        deadline:
          updateData.deadline !== undefined
            ? updateData.deadline
              ? new Date(updateData.deadline)
              : null
            : undefined,
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(and(eq(projects.id, id), eq(projects.version, existing.version)))
      .returning();

    if (!updated) {
      return reply.code(409).send({
        error: { code: 'conflict', message: 'Concurrent modification detected' },
      });
    }

    return { project: updated };
  });

  // DELETE /api/v1/projects/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'project:delete')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    // Soft delete: cascade handled by DB FK constraints for hard delete
    // For MVP, we do hard delete with audit trail
    await db.delete(projects).where(eq(projects.id, id));

    await db.insert(auditEvents).values({
      workspaceId: project.workspaceId,
      actorId: userId,
      action: 'project.deleted',
      subjectType: 'project',
      subjectId: id,
    });

    logger.info({ userId, projectId: id }, 'project deleted');
    return { ok: true };
  });

  // POST /api/v1/projects/:id/plan-drafts — generate AI plan draft without mutating project
  app.post<{ Params: { id: string } }>('/:id/plan-drafts', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'ai:generate')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const parsed = generatePlanDraftSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    // Get workspace member names for owner suggestions
    const members = await db
      .select({ displayName: users.displayName })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, project.workspaceId));

    const memberNames = members.map((m) => m.displayName);

    const effectiveProvider = parsed.data.providerOverride || config.aiProvider || 'nebius';
    const sessionApiKey = ephemeralSessionStore.getSessionKey(
      userId,
      effectiveProvider,
      project.workspaceId,
    );

    const result = await generatePlan(
      {
        goal: parsed.data.goal ?? project.goal,
        audience: parsed.data.audience ?? project.audience,
        deliverable: parsed.data.deliverable ?? project.deliverable,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : project.deadline,
        constraints: parsed.data.constraints ?? (project.constraints as Record<string, unknown>),
        memberNames,
      },
      config,
      {
        sessionApiKey,
        providerOverride: parsed.data.providerOverride,
        modelOverride: parsed.data.modelOverride,
        roleProfile: parsed.data.roleProfile,
        workspaceId: project.workspaceId,
        userId,
      },
    );

    const [generation] = await db
      .insert(aiGenerations)
      .values({
        projectId: id,
        requesterId: userId,
        kind: 'plan_draft',
        provider: result.provider,
        model: result.model,
        inputHash: result.inputHash,
        outputJson: result.draft as unknown as Record<string, unknown>,
      })
      .returning();

    logger.info({ userId, projectId: id, generationId: generation!.id }, 'plan draft generated');

    return {
      generationId: generation!.id,
      draft: result.draft,
      validationErrors: result.validationErrors,
    };
  });

  // POST /api/v1/projects/:id/plan-drafts/:draftId/accept — apply plan draft in transaction
  app.post<{ Params: { id: string; draftId: string } }>(
    '/:id/plan-drafts/:draftId/accept',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { id, draftId } = request.params;

      const parsed = acceptPlanDraftSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (!project) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      const role = await getMemberRole(db, project.workspaceId, userId);
      if (!role || !hasPermission(role, 'ai:accept')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      const [generation] = await db
        .select()
        .from(aiGenerations)
        .where(and(eq(aiGenerations.id, draftId), eq(aiGenerations.projectId, id)))
        .limit(1);

      if (!generation) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Plan draft not found' },
        });
      }

      // Idempotency: if already accepted, return success immediately
      if (generation.acceptedAt) {
        return {
          ok: true,
          alreadyAccepted: true,
          acceptedAt: generation.acceptedAt,
        };
      }

      // Draft to apply is user-edited draft if provided, otherwise the stored output
      const draftToApply = (parsed.data.draft ?? generation.outputJson) as unknown as PlanDraft;

      // Query members to resolve owner suggestions to user IDs
      const members = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, project.workspaceId));

      const memberMap = new Map<string, string>();
      for (const m of members) {
        memberMap.set(m.displayName, m.id);
      }

      // Apply in transaction
      let createdMilestonesCount = 0;
      let createdTasksCount = 0;

      await db.transaction(async (tx) => {
        let sortOrder = 0;
        for (const m of draftToApply.milestones) {
          const [insertedMilestone] = await tx
            .insert(milestones)
            .values({
              projectId: id,
              title: m.title,
              description: m.description ?? null,
              dueDate: m.dueDate ? new Date(m.dueDate) : null,
              sortOrder: sortOrder++,
            })
            .returning();

          createdMilestonesCount++;

          let taskSortOrder = 0;
          for (const t of m.tasks) {
            const assigneeId = t.ownerSuggestion
              ? (memberMap.get(t.ownerSuggestion) ?? null)
              : null;

            await tx.insert(tasks).values({
              projectId: id,
              milestoneId: insertedMilestone!.id,
              title: t.title,
              description: t.description ?? null,
              status: 'todo',
              priority: 'normal',
              assigneeUserId: assigneeId,
              dueDate: t.dueDate ? new Date(t.dueDate) : null,
              sortOrder: taskSortOrder++,
              createdBy: userId,
            });

            createdTasksCount++;
          }
        }

        // Mark generation accepted
        await tx
          .update(aiGenerations)
          .set({ acceptedAt: new Date() })
          .where(eq(aiGenerations.id, draftId));

        // Audit event
        await tx.insert(auditEvents).values({
          workspaceId: project.workspaceId,
          actorId: userId,
          action: 'ai.plan_accepted',
          subjectType: 'project',
          subjectId: id,
          metadata: { draftId, createdMilestonesCount, createdTasksCount },
        });
      });

      logger.info(
        { userId, projectId: id, draftId, createdMilestonesCount, createdTasksCount },
        'plan draft accepted and materialized',
      );

      return {
        ok: true,
        createdMilestonesCount,
        createdTasksCount,
        acceptedAt: new Date().toISOString(),
      };
    },
  );

  // POST /api/v1/projects/:id/ai/progress-summary — read-only summary
  app.post<{ Params: { id: string } }>('/:id/ai/progress-summary', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const projectTasks = await db.select().from(tasks).where(eq(tasks.projectId, id));
    const total = projectTasks.length;
    const done = projectTasks.filter((t) => t.status === 'done').length;
    const blocked = projectTasks.filter((t) => t.status === 'blocked').length;
    const doing = projectTasks.filter((t) => t.status === 'doing').length;
    const todo = projectTasks.filter((t) => t.status === 'todo').length;
    const backlog = projectTasks.filter((t) => t.status === 'backlog').length;

    const now = new Date();
    const overdue = projectTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done',
    ).length;

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    const summary = `${project.name} is ${pct}% complete (${done}/${total} tasks finished). ${
      blocked > 0 ? `⚠️ ${blocked} task(s) currently blocked. ` : ''
    }${doing > 0 ? `${doing} task(s) actively in progress. ` : ''}${
      overdue > 0 ? `⏰ ${overdue} task(s) overdue.` : 'All tasks on schedule.'
    }`;

    return {
      summary,
      stats: { total, done, doing, blocked, todo, backlog, overdue, percentComplete: pct },
      generatedAt: new Date().toISOString(),
    };
  });

  // GET /api/v1/projects/:id/export — export full project data as JSON
  app.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'project:export')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const [projectMilestones, projectTasks, projectGenerations] = await Promise.all([
      db
        .select()
        .from(milestones)
        .where(eq(milestones.projectId, id))
        .orderBy(milestones.sortOrder),
      db.select().from(tasks).where(eq(tasks.projectId, id)).orderBy(tasks.sortOrder),
      db
        .select()
        .from(aiGenerations)
        .where(eq(aiGenerations.projectId, id))
        .orderBy(aiGenerations.createdAt),
    ]);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      project,
      milestones: projectMilestones,
      tasks: projectTasks,
      aiGenerations: projectGenerations,
    };
  });

  // POST /api/v1/projects/:id/milestones — create milestone
  app.post<{ Params: { id: string } }>('/:id/milestones', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'project:update')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const parsed = createMilestoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const [milestone] = await db
      .insert(milestones)
      .values({
        projectId: id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      })
      .returning();

    return reply.code(201).send({ milestone });
  });

  // PATCH /api/v1/projects/milestones/:milestoneId — update milestone
  app.patch<{ Params: { milestoneId: string } }>(
    '/milestones/:milestoneId',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { milestoneId } = request.params;

      const [existing] = await db
        .select()
        .from(milestones)
        .where(eq(milestones.id, milestoneId))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Milestone not found' },
        });
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, existing.projectId))
        .limit(1);

      const role = await getMemberRole(db, project!.workspaceId, userId);
      if (!role || !hasPermission(role, 'project:update')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      const parsed = updateMilestoneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const [updated] = await db
        .update(milestones)
        .set({
          title: parsed.data.title ?? existing.title,
          description:
            parsed.data.description !== undefined ? parsed.data.description : existing.description,
          dueDate:
            parsed.data.dueDate !== undefined
              ? parsed.data.dueDate
                ? new Date(parsed.data.dueDate)
                : null
              : existing.dueDate,
          updatedAt: new Date(),
        })
        .where(eq(milestones.id, milestoneId))
        .returning();

      return { milestone: updated };
    },
  );

  // DELETE /api/v1/projects/milestones/:milestoneId — delete milestone
  app.delete<{ Params: { milestoneId: string } }>(
    '/milestones/:milestoneId',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { milestoneId } = request.params;

      const [existing] = await db
        .select()
        .from(milestones)
        .where(eq(milestones.id, milestoneId))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Milestone not found' },
        });
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, existing.projectId))
        .limit(1);

      const role = await getMemberRole(db, project!.workspaceId, userId);
      if (!role || !hasPermission(role, 'project:update')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      await db.delete(milestones).where(eq(milestones.id, milestoneId));
      return { ok: true };
    },
  );

  // ── Project Brief Revisions ──

  // POST /api/v1/projects/:id/briefs — Create a versioned brief revision
  app.post<{ Params: { id: string } }>('/:id/briefs', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'brief:create')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const parsed = createBriefRevisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'invalid_payload',
          message: 'Validation failed',
          details: parsed.error.format(),
        },
      });
    }

    const domainValidation = validateBriefRevisionInput(parsed.data.title, parsed.data.content);
    if (!domainValidation.valid) {
      return reply.code(422).send({
        error: {
          code: 'invalid_brief',
          message: domainValidation.errors.join('; '),
        },
      });
    }

    // Determine next revision number
    const [maxRev] = await db
      .select({
        maxNum: sql<number>`COALESCE(MAX(${projectBriefRevisions.revisionNumber}), 0)`,
      })
      .from(projectBriefRevisions)
      .where(eq(projectBriefRevisions.projectId, id));

    const nextRevNum = (Number(maxRev?.maxNum) || 0) + 1;

    const [revision] = await db
      .insert(projectBriefRevisions)
      .values({
        projectId: id,
        revisionNumber: nextRevNum,
        title: parsed.data.title,
        content: parsed.data.content,
        notes: parsed.data.notes ?? null,
        authorUserId: userId,
      })
      .returning();

    await db.insert(auditEvents).values({
      workspaceId: project.workspaceId,
      actorId: userId,
      action: 'brief.created',
      subjectType: 'project_brief_revision',
      subjectId: revision!.id,
      metadata: {
        projectId: id,
        revisionNumber: nextRevNum,
        title: parsed.data.title,
      },
    });

    logger.info(
      { userId, projectId: id, revisionId: revision!.id, revisionNumber: nextRevNum },
      'brief revision created',
    );

    return reply.code(201).send({ revision });
  });

  // GET /api/v1/projects/:id/briefs — List all brief revisions
  app.get<{ Params: { id: string } }>('/:id/briefs', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'brief:read')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const revisions = await db
      .select()
      .from(projectBriefRevisions)
      .where(eq(projectBriefRevisions.projectId, id))
      .orderBy(desc(projectBriefRevisions.revisionNumber));

    return { revisions };
  });

  // GET /api/v1/projects/:id/briefs/latest — Get latest brief revision
  app.get<{ Params: { id: string } }>('/:id/briefs/latest', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'brief:read')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const [latest] = await db
      .select()
      .from(projectBriefRevisions)
      .where(eq(projectBriefRevisions.projectId, id))
      .orderBy(desc(projectBriefRevisions.revisionNumber))
      .limit(1);

    return { revision: latest ?? null };
  });

  // ── Requirement Proposals ──

  // POST /api/v1/projects/:id/proposals/extract — Extract candidate requirements from brief revision
  app.post<{ Params: { id: string } }>('/:id/proposals/extract', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'proposal:extract')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const parsed = extractRequirementsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'invalid_payload',
          message: 'Validation failed',
          details: parsed.error.format(),
        },
      });
    }

    const [revision] = await db
      .select()
      .from(projectBriefRevisions)
      .where(
        and(
          eq(projectBriefRevisions.id, parsed.data.briefRevisionId),
          eq(projectBriefRevisions.projectId, id),
        ),
      )
      .limit(1);

    if (!revision) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Brief revision not found for this project' },
      });
    }

    const effectiveProvider = parsed.data.providerOverride || config.aiProvider || 'nebius';
    const sessionApiKey = ephemeralSessionStore.getSessionKey(
      userId,
      effectiveProvider,
      project.workspaceId,
    );

    try {
      const result = await extractRequirementsProposal(
        {
          briefText: revision.content,
          briefTitle: revision.title,
        },
        config,
        {
          sessionApiKey,
          providerOverride: parsed.data.providerOverride,
          modelOverride: parsed.data.modelOverride,
          roleProfile: parsed.data.roleProfile,
          workspaceId: project.workspaceId,
          userId,
        },
      );

      const [generation] = await db
        .insert(aiGenerations)
        .values({
          projectId: id,
          requesterId: userId,
          kind: 'requirement_extraction',
          provider: result.provider,
          model: result.model,
          inputHash: result.inputHash,
          outputJson: result.proposal as unknown as Record<string, unknown>,
        })
        .returning();

      await db.insert(auditEvents).values({
        workspaceId: project.workspaceId,
        actorId: userId,
        action: 'proposal.extracted',
        subjectType: 'ai_generation',
        subjectId: generation!.id,
        metadata: {
          briefRevisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          candidateCount: result.proposal.candidates.length,
        },
      });

      logger.info(
        {
          userId,
          projectId: id,
          generationId: generation!.id,
          candidateCount: result.proposal.candidates.length,
        },
        'requirement proposal extracted',
      );

      return {
        generationId: generation!.id,
        briefRevisionId: revision.id,
        provider: result.provider,
        model: result.model,
        proposal: result.proposal,
        usage: result.usage,
      };
    } catch (err: unknown) {
      logger.error({ err, projectId: id }, 'failed to extract requirements proposal');
      const errorObj = err as { code?: string; message?: string };
      const statusCode =
        errorObj.code === 'ai_auth_error'
          ? 401
          : errorObj.code === 'ai_rate_limit_error'
            ? 429
            : 502;
      return reply.code(statusCode).send({
        error: {
          code: errorObj.code || 'extraction_failed',
          message: errorObj.message || 'Failed to extract requirements from brief.',
        },
      });
    }
  });

  // POST /api/v1/projects/:id/proposals/accept — Explicitly accept proposed candidates into canonical requirements
  app.post<{ Params: { id: string } }>('/:id/proposals/accept', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'proposal:accept')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const parsed = acceptProposalInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'invalid_payload',
          message: 'Validation failed',
          details: parsed.error.format(),
        },
      });
    }

    const { briefRevisionId, idempotencyKey, acceptedCandidates } = parsed.data;

    // Check idempotency: did we already process this idempotencyKey for this project?
    const [existingAudit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, project.workspaceId),
          eq(auditEvents.action, 'proposal.accepted'),
          sql`${auditEvents.metadata}->>'idempotencyKey' = ${idempotencyKey}`,
        ),
      )
      .limit(1);

    if (existingAudit) {
      logger.info({ projectId: id, idempotencyKey }, 'proposal accept idempotent replay');
      const auditMeta = existingAudit.metadata as {
        count?: number;
        requirementIds?: string[];
        briefRevisionId?: string;
      } | null;

      let existingReqs: (typeof requirements.$inferSelect)[] = [];
      if (auditMeta?.requirementIds && auditMeta.requirementIds.length > 0) {
        existingReqs = await db
          .select()
          .from(requirements)
          .where(inArray(requirements.id, auditMeta.requirementIds));
      }

      return {
        idempotentReplay: true,
        acceptedCount: auditMeta?.count ?? existingReqs.length,
        createdRequirements: existingReqs,
        message: 'Proposal was already accepted previously.',
      };
    }

    const candidateValidation = validateProposalCandidates(acceptedCandidates);
    if (!candidateValidation.valid) {
      return reply.code(422).send({
        error: {
          code: 'invalid_candidates',
          message: candidateValidation.errors.join('; '),
        },
      });
    }

    // Insert canonical requirements and audit event inside an atomic database transaction
    const createdRequirements = await db.transaction(async (tx) => {
      const inserted = [];
      for (const cand of acceptedCandidates) {
        // Build provenance metadata into sourceReference if present, ensuring revision link is preserved
        const provenanceRef = cand.sourceReference
          ? `[Brief Rev ${briefRevisionId ? briefRevisionId.slice(0, 8) : ''}] ${cand.sourceReference}`
          : briefRevisionId
            ? `Brief Revision ${briefRevisionId.slice(0, 8)}`
            : null;

        const [req] = await tx
          .insert(requirements)
          .values({
            projectId: id,
            title: cand.title,
            description: cand.description ?? null,
            category: cand.category,
            priority: cand.priority,
            status: 'active', // Accepted proposal items become active canonical requirements
            sourceReference: provenanceRef,
            ownerUserId: cand.ownerUserId ?? null,
            version: 1,
          })
          .returning();
        inserted.push(req!);
      }

      // Record audit event with idempotencyKey and requirement IDs inside the transaction
      await tx.insert(auditEvents).values({
        workspaceId: project.workspaceId,
        actorId: userId,
        action: 'proposal.accepted',
        subjectType: 'project',
        subjectId: id,
        metadata: {
          idempotencyKey,
          briefRevisionId,
          count: inserted.length,
          requirementIds: inserted.map((r) => r.id),
        },
      });

      return inserted;
    });

    logger.info(
      { userId, projectId: id, count: createdRequirements.length },
      'requirements created from accepted proposal',
    );

    return reply.code(201).send({
      acceptedCount: createdRequirements.length,
      createdRequirements,
    });
  });

  // GET /api/v1/projects/:id/activity — chronological project activity stream
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>('/:id/activity', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'project:read')) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const limit = Math.min(Math.max(parseInt(request.query.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(request.query.offset ?? '0', 10) || 0, 0);

    const activity = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        subjectType: auditEvents.subjectType,
        subjectId: auditEvents.subjectId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        actorId: auditEvents.actorId,
        actorName: users.displayName,
      })
      .from(auditEvents)
      .innerJoin(users, eq(auditEvents.actorId, users.id))
      .where(
        and(
          eq(auditEvents.workspaceId, project.workspaceId),
          or(
            and(eq(auditEvents.subjectType, 'project'), eq(auditEvents.subjectId, id)),
            sql`${auditEvents.metadata}->>'projectId' = ${id}`,
          ),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return { activity };
  });
}

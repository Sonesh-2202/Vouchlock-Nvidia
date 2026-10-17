/**
 * Requirement, Traceability, Evidence, Verification, and Delivery Report routes.
 * Strictly scoped to project and workspace permissions.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  createRequirementSchema,
  updateRequirementSchema,
  linkRequirementTaskSchema,
  createEvidenceSchema,
  verifyRequirementSchema,
} from '@projectpilot/contracts';
import {
  hasPermission,
  canTransitionRequirementStatus,
  computeDeliveryMetrics,
  type Requirement,
  type RequirementStatus,
  type RequirementCategory,
  type Evidence,
} from '@projectpilot/domain';
import {
  projects,
  workspaceMembers,
  tasks,
  requirements,
  requirementTasks,
  evidence,
  verifications,
  auditEvents,
  users,
} from '../db/schema.js';
import { authenticate } from '../auth.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface RequirementRouteOpts {
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

export async function requirementRoutes(app: FastifyInstance, opts: RequirementRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/projects/:projectId/requirements — create requirement manually
  app.post<{ Params: { projectId: string } }>(
    '/:projectId/requirements',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { projectId } = request.params;

      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      const role = await getMemberRole(db, project.workspaceId, userId);
      if (!role || !hasPermission(role, 'requirement:create')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      const parsed = createRequirementSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      // If ownerUserId specified, verify membership
      if (parsed.data.ownerUserId) {
        const [ownerMember] = await db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, project.workspaceId),
              eq(workspaceMembers.userId, parsed.data.ownerUserId),
            ),
          )
          .limit(1);

        if (!ownerMember) {
          return reply.code(400).send({
            error: {
              code: 'invalid_owner',
              message: 'Assigned owner is not a member of this workspace',
            },
          });
        }
      }

      const [req] = await db
        .insert(requirements)
        .values({
          projectId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          category: parsed.data.category,
          priority: parsed.data.priority,
          status: 'draft',
          sourceReference: parsed.data.sourceReference ?? null,
          ownerUserId: parsed.data.ownerUserId ?? null,
        })
        .returning();

      await db.insert(auditEvents).values({
        workspaceId: project.workspaceId,
        actorId: userId,
        action: 'requirement.created',
        subjectType: 'requirement',
        subjectId: req!.id,
        metadata: { projectId, title: req!.title },
      });

      logger.info({ userId, projectId, requirementId: req!.id }, 'requirement created');
      return reply.code(201).send({ requirement: req });
    },
  );

  // GET /api/v1/projects/:projectId/requirements — list requirements with links and evidence count
  app.get<{ Params: { projectId: string }; Querystring: { status?: string; category?: string } }>(
    '/:projectId/requirements',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { projectId } = request.params;

      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      const role = await getMemberRole(db, project.workspaceId, userId);
      if (!role || !hasPermission(role, 'requirement:read')) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      const conditions = [eq(requirements.projectId, projectId)];
      if (request.query.status) {
        conditions.push(eq(requirements.status, request.query.status as RequirementStatus));
      }
      if (request.query.category) {
        conditions.push(eq(requirements.category, request.query.category as RequirementCategory));
      }

      const reqList = await db
        .select()
        .from(requirements)
        .where(and(...conditions))
        .orderBy(desc(requirements.createdAt));

      if (reqList.length === 0) {
        return { requirements: [] };
      }

      const reqIds = reqList.map((r) => r.id);

      // Load task links
      const links = await db
        .select({
          requirementId: requirementTasks.requirementId,
          taskId: tasks.id,
          taskTitle: tasks.title,
          taskStatus: tasks.status,
        })
        .from(requirementTasks)
        .innerJoin(tasks, eq(requirementTasks.taskId, tasks.id))
        .where(inArray(requirementTasks.requirementId, reqIds));

      // Load evidence count per requirement
      const evidenceRecords = await db
        .select({
          id: evidence.id,
          requirementId: evidence.requirementId,
          type: evidence.type,
          title: evidence.title,
        })
        .from(evidence)
        .where(inArray(evidence.requirementId, reqIds));

      // Load latest verification per requirement
      const verifRecords = await db
        .select({
          id: verifications.id,
          requirementId: verifications.requirementId,
          status: verifications.status,
          notes: verifications.notes,
          createdAt: verifications.createdAt,
          verifierName: users.displayName,
        })
        .from(verifications)
        .innerJoin(users, eq(verifications.verifiedByUserId, users.id))
        .where(inArray(verifications.requirementId, reqIds))
        .orderBy(desc(verifications.createdAt));

      const linksByReqId = new Map<string, Array<{ id: string; title: string; status: string }>>();
      for (const link of links) {
        const arr = linksByReqId.get(link.requirementId) ?? [];
        arr.push({ id: link.taskId, title: link.taskTitle, status: link.taskStatus });
        linksByReqId.set(link.requirementId, arr);
      }

      const evidenceCountByReqId = new Map<string, number>();
      for (const ev of evidenceRecords) {
        const count = evidenceCountByReqId.get(ev.requirementId) ?? 0;
        evidenceCountByReqId.set(ev.requirementId, count + 1);
      }

      const latestVerifByReqId = new Map<string, (typeof verifRecords)[0]>();
      for (const v of verifRecords) {
        if (!latestVerifByReqId.has(v.requirementId)) {
          latestVerifByReqId.set(v.requirementId, v);
        }
      }

      const enriched = reqList.map((r) => ({
        ...r,
        linkedTasks: linksByReqId.get(r.id) ?? [],
        evidenceCount: evidenceCountByReqId.get(r.id) ?? 0,
        latestVerification: latestVerifByReqId.get(r.id) ?? null,
      }));

      return { requirements: enriched };
    },
  );

  // GET /api/v1/projects/requirements/:reqId — requirement details with linked tasks, evidence, verifications
  app.get<{ Params: { reqId: string } }>('/requirements/:reqId', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { reqId } = request.params;

    const [req] = await db.select().from(requirements).where(eq(requirements.id, reqId)).limit(1);
    if (!req) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Requirement not found' },
      });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, req.projectId))
      .limit(1);
    if (!project) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Project not found' },
      });
    }

    const role = await getMemberRole(db, project.workspaceId, userId);
    if (!role || !hasPermission(role, 'requirement:read')) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Requirement not found' },
      });
    }

    const [linkedTasks, evidenceList, verifHistory] = await Promise.all([
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
        })
        .from(requirementTasks)
        .innerJoin(tasks, eq(requirementTasks.taskId, tasks.id))
        .where(eq(requirementTasks.requirementId, reqId)),
      db
        .select({
          id: evidence.id,
          type: evidence.type,
          title: evidence.title,
          content: evidence.content,
          taskId: evidence.taskId,
          createdAt: evidence.createdAt,
          authorName: users.displayName,
        })
        .from(evidence)
        .innerJoin(users, eq(evidence.authorUserId, users.id))
        .where(eq(evidence.requirementId, reqId))
        .orderBy(desc(evidence.createdAt)),
      db
        .select({
          id: verifications.id,
          status: verifications.status,
          notes: verifications.notes,
          createdAt: verifications.createdAt,
          verifiedByName: users.displayName,
        })
        .from(verifications)
        .innerJoin(users, eq(verifications.verifiedByUserId, users.id))
        .where(eq(verifications.requirementId, reqId))
        .orderBy(desc(verifications.createdAt)),
    ]);

    return {
      requirement: req,
      linkedTasks,
      evidence: evidenceList,
      verifications: verifHistory,
      currentUserRole: role,
    };
  });

  // PATCH /api/v1/projects/requirements/:reqId — update requirement with version concurrency
  app.patch<{ Params: { reqId: string } }>('/requirements/:reqId', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { reqId } = request.params;

    const parsed = updateRequirementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const [existing] = await db
      .select()
      .from(requirements)
      .where(eq(requirements.id, reqId))
      .limit(1);
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Requirement not found' },
      });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1);
    const role = await getMemberRole(db, project!.workspaceId, userId);
    if (!role || !hasPermission(role, 'requirement:update')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    // Optimistic concurrency
    if (parsed.data.version !== existing.version) {
      return reply.code(409).send({
        error: {
          code: 'conflict',
          message: 'Requirement has been modified. Refresh and try again.',
          details: { currentVersion: existing.version },
        },
      });
    }

    // Check status transition validity
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const canTransition = canTransitionRequirementStatus(
        existing.status as RequirementStatus,
        parsed.data.status as RequirementStatus,
        role,
      );
      if (!canTransition) {
        return reply.code(400).send({
          error: {
            code: 'invalid_status_transition',
            message: `Cannot transition requirement from ${existing.status} to ${parsed.data.status}`,
          },
        });
      }
    }

    const { version: _v, ...updateData } = parsed.data;
    const [updated] = await db
      .update(requirements)
      .set({
        ...updateData,
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(and(eq(requirements.id, reqId), eq(requirements.version, existing.version)))
      .returning();

    if (!updated) {
      return reply.code(409).send({
        error: { code: 'conflict', message: 'Concurrent modification detected' },
      });
    }

    await db.insert(auditEvents).values({
      workspaceId: project!.workspaceId,
      actorId: userId,
      action: 'requirement.updated',
      subjectType: 'requirement',
      subjectId: reqId,
      metadata: { changes: updateData },
    });

    return { requirement: updated };
  });

  // DELETE /api/v1/projects/requirements/:reqId — delete requirement (admin/owner only)
  app.delete<{ Params: { reqId: string } }>('/requirements/:reqId', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { reqId } = request.params;

    const [existing] = await db
      .select()
      .from(requirements)
      .where(eq(requirements.id, reqId))
      .limit(1);
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Requirement not found' },
      });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1);
    const role = await getMemberRole(db, project!.workspaceId, userId);
    if (!role || !hasPermission(role, 'requirement:delete')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    await db.delete(requirements).where(eq(requirements.id, reqId));

    await db.insert(auditEvents).values({
      workspaceId: project!.workspaceId,
      actorId: userId,
      action: 'requirement.deleted',
      subjectType: 'requirement',
      subjectId: reqId,
    });

    return { ok: true };
  });

  // POST /api/v1/projects/requirements/:reqId/tasks — link task to requirement
  app.post<{ Params: { reqId: string } }>('/requirements/:reqId/tasks', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { reqId } = request.params;

    const parsed = linkRequirementTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const [req] = await db.select().from(requirements).where(eq(requirements.id, reqId)).limit(1);
    if (!req) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Requirement not found' },
      });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, req.projectId))
      .limit(1);
    const role = await getMemberRole(db, project!.workspaceId, userId);
    if (!role || !hasPermission(role, 'requirement:update')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    // Enforce project and workspace isolation: task must exist and belong to the SAME project!
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.projectId, req.projectId)))
      .limit(1);

    if (!task) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found in this project' },
      });
    }

    // Insert link (idempotent ignore duplicate key)
    try {
      await db
        .insert(requirementTasks)
        .values({
          requirementId: reqId,
          taskId: parsed.data.taskId,
        })
        .onConflictDoNothing();
    } catch {
      // Fallback for drivers that don't support onConflictDoNothing on compound PK
    }

    await db.insert(auditEvents).values({
      workspaceId: project!.workspaceId,
      actorId: userId,
      action: 'requirement.task_linked',
      subjectType: 'requirement',
      subjectId: reqId,
      metadata: { taskId: parsed.data.taskId },
    });

    return { ok: true, requirementId: reqId, taskId: parsed.data.taskId };
  });

  // DELETE /api/v1/projects/requirements/:reqId/tasks/:taskId — unlink task from requirement
  app.delete<{ Params: { reqId: string; taskId: string } }>(
    '/requirements/:reqId/tasks/:taskId',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { reqId, taskId } = request.params;

      const [req] = await db.select().from(requirements).where(eq(requirements.id, reqId)).limit(1);
      if (!req) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Requirement not found' },
        });
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, req.projectId))
        .limit(1);
      const role = await getMemberRole(db, project!.workspaceId, userId);
      if (!role || !hasPermission(role, 'requirement:update')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      await db
        .delete(requirementTasks)
        .where(and(eq(requirementTasks.requirementId, reqId), eq(requirementTasks.taskId, taskId)));

      await db.insert(auditEvents).values({
        workspaceId: project!.workspaceId,
        actorId: userId,
        action: 'requirement.task_unlinked',
        subjectType: 'requirement',
        subjectId: reqId,
        metadata: { taskId },
      });

      return { ok: true };
    },
  );

  // POST /api/v1/projects/requirements/:reqId/evidence — attach safe evidence (URL or note)
  app.post<{ Params: { reqId: string } }>(
    '/requirements/:reqId/evidence',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { reqId } = request.params;

      const parsed = createEvidenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const [req] = await db.select().from(requirements).where(eq(requirements.id, reqId)).limit(1);
      if (!req) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Requirement not found' },
        });
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, req.projectId))
        .limit(1);
      const role = await getMemberRole(db, project!.workspaceId, userId);
      if (!role || !hasPermission(role, 'evidence:create')) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Insufficient permissions' },
        });
      }

      // If taskId provided, ensure it belongs to the same project
      if (parsed.data.taskId) {
        const [task] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.projectId, req.projectId)))
          .limit(1);

        if (!task) {
          return reply.code(400).send({
            error: { code: 'invalid_task', message: 'Linked task does not exist in this project' },
          });
        }
      }

      const [ev] = await db
        .insert(evidence)
        .values({
          projectId: req.projectId,
          requirementId: reqId,
          taskId: parsed.data.taskId ?? null,
          authorUserId: userId,
          type: parsed.data.type,
          title: parsed.data.title,
          content: parsed.data.content,
        })
        .returning();

      await db.insert(auditEvents).values({
        workspaceId: project!.workspaceId,
        actorId: userId,
        action: 'evidence.created',
        subjectType: 'evidence',
        subjectId: ev!.id,
        metadata: { requirementId: reqId, type: ev!.type, title: ev!.title },
      });

      return reply.code(201).send({ evidence: ev });
    },
  );

  // POST /api/v1/projects/requirements/:reqId/verify — explicit authorized verification action
  app.post<{ Params: { reqId: string } }>('/requirements/:reqId/verify', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { reqId } = request.params;

    const parsed = verifyRequirementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const [req] = await db.select().from(requirements).where(eq(requirements.id, reqId)).limit(1);
    if (!req) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Requirement not found' },
      });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, req.projectId))
      .limit(1);
    const role = await getMemberRole(db, project!.workspaceId, userId);
    if (!role || !hasPermission(role, 'requirement:verify')) {
      return reply.code(403).send({
        error: {
          code: 'forbidden',
          message: 'Only workspace owners and admins can explicitly verify requirements',
        },
      });
    }

    const targetStatus: RequirementStatus =
      parsed.data.status === 'verified'
        ? 'verified'
        : parsed.data.status === 'rejected'
          ? 'blocked'
          : 'active';

    // Check transition rule
    if (targetStatus !== req.status) {
      const canTransition = canTransitionRequirementStatus(
        req.status as RequirementStatus,
        targetStatus,
        role,
      );
      if (!canTransition) {
        return reply.code(400).send({
          error: {
            code: 'invalid_status_transition',
            message: `Cannot transition requirement from ${req.status} to ${targetStatus}`,
          },
        });
      }
    }

    let updatedReq: typeof req | undefined;
    let verifRecord: typeof verifications.$inferSelect | undefined;

    await db.transaction(async (tx) => {
      // Record verification event in history
      const [v] = await tx
        .insert(verifications)
        .values({
          requirementId: reqId,
          verifiedByUserId: userId,
          status: parsed.data.status,
          notes: parsed.data.notes ?? null,
        })
        .returning();
      verifRecord = v;

      // Update requirement status
      const [u] = await tx
        .update(requirements)
        .set({
          status: targetStatus,
          updatedAt: new Date(),
          version: req.version + 1,
        })
        .where(and(eq(requirements.id, reqId), eq(requirements.version, req.version)))
        .returning();
      updatedReq = u;

      // Audit event
      await tx.insert(auditEvents).values({
        workspaceId: project!.workspaceId,
        actorId: userId,
        action: 'requirement.verified',
        subjectType: 'requirement',
        subjectId: reqId,
        metadata: { status: parsed.data.status, notes: parsed.data.notes },
      });
    });

    logger.info(
      { userId, requirementId: reqId, status: parsed.data.status },
      'requirement verification recorded',
    );

    return {
      ok: true,
      verification: verifRecord,
      requirement: updatedReq,
    };
  });

  // GET /api/v1/projects/:projectId/delivery-report — truthful delivery report from persisted records
  app.get<{ Params: { projectId: string } }>(
    '/:projectId/delivery-report',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { projectId } = request.params;

      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      const role = await getMemberRole(db, project.workspaceId, userId);
      if (!role || !hasPermission(role, 'report:generate')) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      // Load all requirements
      const projectReqs = await db
        .select()
        .from(requirements)
        .where(eq(requirements.projectId, projectId))
        .orderBy(requirements.createdAt);

      const reqIds = projectReqs.map((r) => r.id);

      // Load task links
      const taskLinks =
        reqIds.length > 0
          ? await db
              .select({
                requirementId: requirementTasks.requirementId,
                taskId: tasks.id,
                taskTitle: tasks.title,
                taskStatus: tasks.status,
              })
              .from(requirementTasks)
              .innerJoin(tasks, eq(requirementTasks.taskId, tasks.id))
              .where(inArray(requirementTasks.requirementId, reqIds))
          : [];

      // Load evidence
      const evList =
        reqIds.length > 0
          ? await db
              .select({
                id: evidence.id,
                requirementId: evidence.requirementId,
                taskId: evidence.taskId,
                authorUserId: evidence.authorUserId,
                type: evidence.type,
                title: evidence.title,
                content: evidence.content,
                createdAt: evidence.createdAt,
              })
              .from(evidence)
              .where(inArray(evidence.requirementId, reqIds))
          : [];

      // Load verifications
      const verifList =
        reqIds.length > 0
          ? await db
              .select({
                id: verifications.id,
                requirementId: verifications.requirementId,
                status: verifications.status,
                notes: verifications.notes,
                createdAt: verifications.createdAt,
                verifiedByName: users.displayName,
              })
              .from(verifications)
              .innerJoin(users, eq(verifications.verifiedByUserId, users.id))
              .where(inArray(verifications.requirementId, reqIds))
              .orderBy(desc(verifications.createdAt))
          : [];

      // Domain metrics computation
      const metrics = computeDeliveryMetrics(
        projectReqs as unknown as Requirement[],
        taskLinks.map((l) => ({ requirementId: l.requirementId, taskId: l.taskId })),
        evList as unknown as Evidence[],
      );

      // Latest verification map
      const latestVerifMap = new Map<string, (typeof verifList)[0]>();
      for (const v of verifList) {
        if (!latestVerifMap.has(v.requirementId)) {
          latestVerifMap.set(v.requirementId, v);
        }
      }

      // Group tasks by requirement
      const tasksByReq = new Map<string, Array<{ id: string; title: string; status: string }>>();
      for (const l of taskLinks) {
        const arr = tasksByReq.get(l.requirementId) ?? [];
        arr.push({ id: l.taskId, title: l.taskTitle, status: l.taskStatus });
        tasksByReq.set(l.requirementId, arr);
      }

      // Group evidence by requirement
      const evidenceByReq = new Map<string, Array<(typeof evList)[0]>>();
      for (const e of evList) {
        const arr = evidenceByReq.get(e.requirementId) ?? [];
        arr.push(e);
        evidenceByReq.set(e.requirementId, arr);
      }

      const items = projectReqs.map((r) => {
        const linked = tasksByReq.get(r.id) ?? [];
        const ev = evidenceByReq.get(r.id) ?? [];
        const latestV = latestVerifMap.get(r.id) ?? null;
        const allTasksDone = linked.length > 0 && linked.every((t) => t.status === 'done');

        return {
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category,
          priority: r.priority,
          status: r.status,
          sourceReference: r.sourceReference,
          linkedTasks: linked,
          evidenceCount: ev.length,
          evidence: ev.map((item) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            content: item.content,
          })),
          latestVerification: latestV,
          isVerified: r.status === 'verified',
          allTasksDone,
          hasLinkedTasks: linked.length > 0,
          hasEvidence: ev.length > 0,
        };
      });

      return {
        project: {
          id: project.id,
          name: project.name,
          goal: project.goal,
          deliverable: project.deliverable,
          deadline: project.deadline,
          status: project.status,
        },
        metrics,
        items,
        generatedAt: new Date().toISOString(),
      };
    },
  );
}

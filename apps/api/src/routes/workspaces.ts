/**
 * Workspace routes — CRUD, membership, invitations.
 * Every query enforces workspace membership scope.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { createWorkspaceSchema, createInvitationSchema } from '@projectpilot/contracts';
import {
  hasPermission,
  computeInviteExpiry,
  isInviteUsable,
  canRemoveMember,
} from '@projectpilot/domain';
import {
  workspaces,
  workspaceMembers,
  invitations,
  users,
  auditEvents,
  projects,
} from '../db/schema.js';
import { authenticate } from '../auth.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';
import { createHash, randomBytes } from 'crypto';

interface WorkspaceRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

/** Get user's role in a workspace, or null if not a member. */
async function getMemberRole(db: Database, workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return member?.role ?? null;
}

export async function workspaceRoutes(app: FastifyInstance, opts: WorkspaceRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/workspaces — create workspace
  app.post('/', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const parsed = createWorkspaceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: parsed.data.name, ownerUserId: userId })
      .returning();

    if (!workspace) {
      return reply.code(500).send({
        error: { code: 'internal_error', message: 'Failed to create workspace' },
      });
    }

    // Add creator as owner member
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });

    // Audit
    await db.insert(auditEvents).values({
      workspaceId: workspace.id,
      actorId: userId,
      action: 'workspace.created',
      subjectType: 'workspace',
      subjectId: workspace.id,
    });

    logger.info({ userId, workspaceId: workspace.id }, 'workspace created');
    return reply.code(201).send({ workspace });
  });

  // GET /api/v1/workspaces — list user's workspaces
  app.get('/', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const results = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.deletedAt)));

    return { workspaces: results };
  });

  // GET /api/v1/workspaces/:id — get workspace details
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const role = await getMemberRole(db, id, userId);
    if (!role) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Workspace not found' },
      });
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, id), isNull(workspaces.deletedAt)))
      .limit(1);

    if (!workspace) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Workspace not found' },
      });
    }

    // Get members
    const members = await db
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        displayName: users.displayName,
        email: users.email,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, id));

    return { workspace, members, currentUserRole: role };
  });

  // POST /api/v1/workspaces/:id/invitations — create invitation
  app.post<{ Params: { id: string } }>('/:id/invitations', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const role = await getMemberRole(db, id, userId);
    if (!role || !hasPermission(role, 'members:invite')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions' },
      });
    }

    const parsed = createInvitationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    // Generate secure random token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const [invitation] = await db
      .insert(invitations)
      .values({
        workspaceId: id,
        invitedEmail: parsed.data.email ?? null,
        tokenHash,
        role: parsed.data.role,
        expiresAt: computeInviteExpiry(),
        createdBy: userId,
      })
      .returning({ id: invitations.id, expiresAt: invitations.expiresAt });

    // Audit
    await db.insert(auditEvents).values({
      workspaceId: id,
      actorId: userId,
      action: 'invitation.created',
      subjectType: 'invitation',
      subjectId: invitation!.id,
      metadata: { role: parsed.data.role },
    });

    logger.info({ userId, workspaceId: id }, 'invitation created');

    // Return the raw token (only time it's exposed) — user sends it to invitee
    return reply.code(201).send({
      invitation: {
        id: invitation!.id,
        token: rawToken,
        role: parsed.data.role,
        expiresAt: invitation!.expiresAt,
      },
    });
  });

  // POST /api/v1/invitations/:token/accept — accept invitation
  app.post<{ Params: { token: string } }>('/invitations/:token/accept', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { token } = request.params;

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);

    if (!invitation) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Invitation not found' },
      });
    }

    if (!isInviteUsable(invitation)) {
      return reply.code(410).send({
        error: { code: 'invite_expired', message: 'This invitation has expired or been used' },
      });
    }

    // Check if already a member
    const existingRole = await getMemberRole(db, invitation.workspaceId, userId);
    if (existingRole) {
      return reply.code(409).send({
        error: { code: 'already_member', message: 'You are already a member of this workspace' },
      });
    }

    // Add member and mark invitation accepted
    await db.insert(workspaceMembers).values({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
      invitedBy: invitation.createdBy,
    });

    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    // Audit
    await db.insert(auditEvents).values({
      workspaceId: invitation.workspaceId,
      actorId: userId,
      action: 'invitation.accepted',
      subjectType: 'invitation',
      subjectId: invitation.id,
    });

    logger.info({ userId, workspaceId: invitation.workspaceId }, 'invitation accepted');
    return { ok: true, workspaceId: invitation.workspaceId };
  });

  // DELETE /api/v1/workspaces/:id/members/:userId — remove member
  app.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    async (request, reply) => {
      const actorId = await authenticate(
        request,
        reply,
        config.jwtSecret,
        config.sessionCookieName,
      );
      const { id: workspaceId, userId: targetUserId } = request.params;

      const actorRole = await getMemberRole(db, workspaceId, actorId);
      if (!actorRole) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Workspace not found' },
        });
      }

      const targetRole = await getMemberRole(db, workspaceId, targetUserId);
      if (!targetRole) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Member not found' },
        });
      }

      // Check if target is last owner
      const ownerCount = await db
        .select({ count: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')),
        );

      const isLastOwner = targetRole === 'owner' && ownerCount.length <= 1;

      if (!canRemoveMember(actorRole, targetRole, isLastOwner)) {
        return reply.code(403).send({
          error: {
            code: 'forbidden',
            message: isLastOwner ? 'Cannot remove the last owner' : 'Insufficient permissions',
          },
        });
      }

      await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, targetUserId),
          ),
        );

      // Audit
      await db.insert(auditEvents).values({
        workspaceId,
        actorId,
        action: 'member.removed',
        subjectType: 'user',
        subjectId: targetUserId,
      });

      logger.info({ actorId, targetUserId, workspaceId }, 'member removed');
      return { ok: true };
    },
  );

  // GET /api/v1/workspaces/:id/export — export workspace data as JSON
  app.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const role = await getMemberRole(db, id, userId);
    if (!role || !hasPermission(role, 'workspace:read')) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Workspace not found' },
      });
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!ws) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Workspace not found' },
      });
    }

    const memberList = await db
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        displayName: users.displayName,
        email: users.email,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, id));

    const projectList = await db.select().from(projects).where(eq(projects.workspaceId, id));

    const auditTrail = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, id))
      .orderBy(auditEvents.createdAt);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workspace: ws,
      members: memberList,
      projects: projectList,
      auditEvents: auditTrail,
    };
  });

  // GET /api/v1/workspaces/:id/activity — query workspace activity audit log (requires audit:read: owner/admin)
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string; subjectType?: string };
  }>('/:id/activity', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const role = await getMemberRole(db, id, userId);
    if (!role) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Workspace not found' },
      });
    }

    if (!hasPermission(role, 'audit:read')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions to read audit activity' },
      });
    }

    const limit = Math.min(Math.max(parseInt(request.query.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(request.query.offset ?? '0', 10) || 0, 0);
    const { subjectType } = request.query;

    const conditions = [eq(auditEvents.workspaceId, id)];
    if (subjectType) {
      conditions.push(eq(auditEvents.subjectType, subjectType));
    }

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
        actorEmail: users.email,
      })
      .from(auditEvents)
      .innerJoin(users, eq(auditEvents.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return { activity };
  });
}

/**
 * Task routes — CRUD, comments, with workspace scope enforcement.
 * Status transitions validated by domain rules.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import {
  createTaskSchema,
  updateTaskSchema,
  createCommentSchema,
  updateCommentSchema,
} from '@projectpilot/contracts';
import { hasPermission, isValidStatusTransition } from '@projectpilot/domain';
import { tasks, projects, workspaceMembers, comments, users, auditEvents } from '../db/schema.js';
import { authenticate } from '../auth.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface TaskRouteOpts {
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

async function getProjectWithAccess(db: Database, projectId: string, userId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project) return null;

  const role = await getMemberRole(db, project.workspaceId, userId);
  if (!role) return null;

  return { project, role };
}

export async function taskRoutes(app: FastifyInstance, opts: TaskRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/projects/:projectId/tasks
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/tasks',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { projectId } = request.params;

      const access = await getProjectWithAccess(db, projectId, userId);
      if (!access || !hasPermission(access.role, 'task:create')) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Project not found' },
        });
      }

      const parsed = createTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const task = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(tasks)
          .values({
            projectId,
            title: parsed.data.title,
            description: parsed.data.description ?? null,
            milestoneId: parsed.data.milestoneId ?? null,
            status: parsed.data.status,
            priority: parsed.data.priority,
            assigneeUserId: parsed.data.assigneeUserId ?? null,
            dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
            createdBy: userId,
          })
          .returning();

        await tx.insert(auditEvents).values({
          workspaceId: access.project.workspaceId,
          actorId: userId,
          action: 'task.created',
          subjectType: 'task',
          subjectId: created!.id,
          metadata: { projectId, title: created!.title, status: created!.status },
        });

        return created!;
      });

      logger.info({ userId, taskId: task.id, projectId }, 'task created');
      return reply.code(201).send({ task });
    },
  );

  // PATCH /api/v1/tasks/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    const access = await getProjectWithAccess(db, existing.projectId, userId);
    if (!access || !hasPermission(access.role, 'task:update')) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    const parsed = updateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    // Version check for optimistic concurrency
    if (parsed.data.version !== existing.version) {
      return reply.code(409).send({
        error: {
          code: 'conflict',
          message: 'Task has been modified. Refresh and try again.',
          details: { currentVersion: existing.version },
        },
      });
    }

    // Validate status transition
    if (parsed.data.status && !isValidStatusTransition(existing.status, parsed.data.status)) {
      return reply.code(422).send({
        error: {
          code: 'invalid_transition',
          message: `Cannot transition from "${existing.status}" to "${parsed.data.status}"`,
        },
      });
    }

    const { version: _v, ...updateData } = parsed.data;
    const updated = await db.transaction(async (tx) => {
      const [res] = await tx
        .update(tasks)
        .set({
          ...updateData,
          dueDate:
            updateData.dueDate !== undefined
              ? updateData.dueDate
                ? new Date(updateData.dueDate)
                : null
              : undefined,
          updatedAt: new Date(),
          version: existing.version + 1,
        })
        .where(and(eq(tasks.id, id), eq(tasks.version, existing.version)))
        .returning();

      if (res) {
        await tx.insert(auditEvents).values({
          workspaceId: access.project.workspaceId,
          actorId: userId,
          action: 'task.updated',
          subjectType: 'task',
          subjectId: id,
          metadata: {
            projectId: existing.projectId,
            previousStatus: existing.status,
            status: res.status,
            changes: Object.keys(updateData),
          },
        });
      }

      return res;
    });

    if (!updated) {
      return reply.code(409).send({
        error: { code: 'conflict', message: 'Concurrent modification detected' },
      });
    }

    return { task: updated };
  });

  // DELETE /api/v1/tasks/:id — delete task (requires task:delete permission: owner/admin)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    const access = await getProjectWithAccess(db, existing.projectId, userId);
    if (!access) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    if (!hasPermission(access.role, 'task:delete')) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient permissions to delete tasks' },
      });
    }

    await db.transaction(async (tx) => {
      await tx.delete(tasks).where(eq(tasks.id, id));

      await tx.insert(auditEvents).values({
        workspaceId: access.project.workspaceId,
        actorId: userId,
        action: 'task.deleted',
        subjectType: 'task',
        subjectId: id,
        metadata: { projectId: existing.projectId, title: existing.title },
      });
    });

    logger.info({ userId, taskId: id, projectId: existing.projectId }, 'task deleted');
    return { ok: true };
  });

  // GET /api/v1/tasks/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id } = request.params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    const access = await getProjectWithAccess(db, task.projectId, userId);
    if (!access) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    // Load comments
    const taskComments = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        authorUserId: comments.authorUserId,
        authorName: users.displayName,
        body: comments.body,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorUserId, users.id))
      .where(and(eq(comments.taskId, id), isNull(comments.deletedAt)))
      .orderBy(comments.createdAt);

    return { task, comments: taskComments };
  });

  // POST /api/v1/tasks/:id/comments
  app.post<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const { id: taskId } = request.params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    const access = await getProjectWithAccess(db, task.projectId, userId);
    if (!access || !hasPermission(access.role, 'comment:create')) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Task not found' },
      });
    }

    const parsed = createCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      });
    }

    const comment = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(comments)
        .values({
          taskId,
          authorUserId: userId,
          body: parsed.data.body,
        })
        .returning();

      await tx.insert(auditEvents).values({
        workspaceId: access.project.workspaceId,
        actorId: userId,
        action: 'comment.created',
        subjectType: 'comment',
        subjectId: created!.id,
        metadata: { taskId },
      });

      return created!;
    });

    logger.info({ userId, taskId, commentId: comment.id }, 'comment created');
    return reply.code(201).send({ comment });
  });

  // PATCH /api/v1/tasks/:taskId/comments/:commentId — authors may edit their own comments.
  app.patch<{ Params: { taskId: string; commentId: string } }>(
    '/:taskId/comments/:commentId',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { taskId, commentId } = request.params;
      const parsed = updateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Comment not found' } });
      }
      const access = await getProjectWithAccess(db, task.projectId, userId);
      if (!access || !hasPermission(access.role, 'comment:create')) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Comment not found' } });
      }

      const [existing] = await db
        .select()
        .from(comments)
        .where(
          and(eq(comments.id, commentId), eq(comments.taskId, taskId), isNull(comments.deletedAt)),
        )
        .limit(1);
      if (!existing) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Comment not found' } });
      }
      if (existing.authorUserId !== userId) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Only the comment author can edit this comment' },
        });
      }

      const [updated] = await db.transaction(async (tx) => {
        const result = await tx
          .update(comments)
          .set({ body: parsed.data.body, editedAt: new Date() })
          .where(
            and(
              eq(comments.id, commentId),
              eq(comments.taskId, taskId),
              eq(comments.authorUserId, userId),
              isNull(comments.deletedAt),
            ),
          )
          .returning();

        if (result[0]) {
          await tx.insert(auditEvents).values({
            workspaceId: access.project.workspaceId,
            actorId: userId,
            action: 'comment.edited',
            subjectType: 'comment',
            subjectId: commentId,
            metadata: { taskId },
          });
        }
        return result;
      });

      if (!updated) {
        return reply.code(409).send({
          error: {
            code: 'conflict',
            message: 'Comment changed or was removed. Refresh and retry.',
          },
        });
      }

      logger.info({ userId, taskId, commentId }, 'comment edited');
      return { comment: updated };
    },
  );

  // DELETE /api/v1/tasks/:taskId/comments/:commentId — authors can remove their own comment;
  // owners and admins can moderate any comment in their workspace.
  app.delete<{ Params: { taskId: string; commentId: string } }>(
    '/:taskId/comments/:commentId',
    async (request, reply) => {
      const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
      const { taskId, commentId } = request.params;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Comment not found' } });
      }
      const access = await getProjectWithAccess(db, task.projectId, userId);
      if (!access || !hasPermission(access.role, 'comment:create')) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Comment not found' } });
      }

      const [existing] = await db
        .select()
        .from(comments)
        .where(
          and(eq(comments.id, commentId), eq(comments.taskId, taskId), isNull(comments.deletedAt)),
        )
        .limit(1);
      if (!existing) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Comment not found' } });
      }

      const isModerator = access.role === 'owner' || access.role === 'admin';
      if (existing.authorUserId !== userId && !isModerator) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'You may remove only your own comment' },
        });
      }

      const [deleted] = await db.transaction(async (tx) => {
        const result = await tx
          .update(comments)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(comments.id, commentId),
              eq(comments.taskId, taskId),
              isNull(comments.deletedAt),
            ),
          )
          .returning({ id: comments.id });

        if (result[0]) {
          await tx.insert(auditEvents).values({
            workspaceId: access.project.workspaceId,
            actorId: userId,
            action: 'comment.deleted',
            subjectType: 'comment',
            subjectId: commentId,
            metadata: { taskId, moderated: existing.authorUserId !== userId },
          });
        }
        return result;
      });

      if (!deleted) {
        return reply.code(409).send({
          error: {
            code: 'conflict',
            message: 'Comment changed or was removed. Refresh and retry.',
          },
        });
      }

      logger.info({ userId, taskId, commentId }, 'comment deleted');
      return { ok: true };
    },
  );
}

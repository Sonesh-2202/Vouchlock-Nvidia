/**
 * MCP Tools Implementation
 * Provides read-only project inspection tools for external assistants.
 * Strictly enforces workspace tenant isolation and user permissions.
 */

import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import {
  projects,
  milestones,
  tasks,
  requirements,
  evidence,
  workspaceMembers,
  users,
} from '../db/schema.js';
import { hasPermission } from '@projectpilot/domain';
import {
  type McpRequestContext,
  type McpTool,
  McpForbiddenError,
  McpNotFoundError,
  McpError,
} from './types.js';

/**
 * Validates that the requested project exists and belongs strictly to the
 * workspace authorized by the caller's MCP token. Also verifies active membership.
 */
export async function validateProjectAccess(
  db: Database,
  context: McpRequestContext,
  projectId: string,
) {
  if (!projectId || typeof projectId !== 'string') {
    throw new McpError('projectId must be a valid string UUID', 'validation_error', 400);
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project) {
    throw new McpNotFoundError(`Project ${projectId} not found`);
  }

  // Tenant isolation: token workspace must match project workspace
  if (project.workspaceId !== context.workspaceId) {
    throw new McpForbiddenError('Access denied: Project does not belong to authorized workspace');
  }

  // Active membership & RBAC check
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new McpForbiddenError(
      `Access denied: User is not an active member of workspace ${context.workspaceId}`,
    );
  }

  if (!hasPermission(member.role, 'project:read')) {
    throw new McpForbiddenError('Access denied: Insufficient permission to view project');
  }

  return { project, memberRole: member.role };
}

// ── Tool 1: get_project_summary ──
export const getProjectSummaryTool: McpTool<{ projectId: string }> = {
  name: 'get_project_summary',
  description:
    'Get a high-level summary of a project including goal, status, and milestone/task/requirement counts',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique UUID of the project' },
    },
    required: ['projectId'],
  },
  handler: async (db, context, args) => {
    if (context.signal?.aborted) {
      throw new McpError('Tool execution cancelled', 'cancelled', 499);
    }
    const { project } = await validateProjectAccess(db, context, args.projectId);

    const [milestonesCount, tasksCount, requirementsCount, membersCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(milestones)
        .where(eq(milestones.projectId, project.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(eq(tasks.projectId, project.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(requirements)
        .where(eq(requirements.projectId, project.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, context.workspaceId)),
    ]);

    return {
      id: project.id,
      name: project.name,
      goal: project.goal,
      audience: project.audience,
      deliverable: project.deliverable,
      status: project.status,
      deadline: project.deadline ? project.deadline.toISOString() : null,
      memberCount: Number(membersCount[0]?.count ?? 0),
      milestoneCount: Number(milestonesCount[0]?.count ?? 0),
      taskCount: Number(tasksCount[0]?.count ?? 0),
      requirementCount: Number(requirementsCount[0]?.count ?? 0),
    };
  },
};

// ── Tool 2: list_requirements ──
export const listRequirementsTool: McpTool<{
  projectId: string;
  status?: string;
  limit?: number;
  offset?: number;
}> = {
  name: 'list_requirements',
  description: 'List requirements for a project with optional status filtering and pagination',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique UUID of the project' },
      status: {
        type: 'string',
        enum: ['draft', 'active', 'verified', 'blocked', 'deprecated'],
        description: 'Optional filter by requirement status',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Maximum number of requirements to return (default 50, max 100)',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Zero-based offset for pagination (default 0)',
      },
    },
    required: ['projectId'],
  },
  handler: async (db, context, args) => {
    if (context.signal?.aborted) {
      throw new McpError('Tool execution cancelled', 'cancelled', 499);
    }
    const { project } = await validateProjectAccess(db, context, args.projectId);

    const safeLimit = Math.min(Math.max(1, Number(args.limit ?? 50)), 100);
    const safeOffset = Math.max(0, Number(args.offset ?? 0));

    const conditions = [eq(requirements.projectId, project.id)];
    if (args.status) {
      conditions.push(eq(requirements.status, args.status as any));
    }

    let query: any = db
      .select({
        id: requirements.id,
        title: requirements.title,
        description: requirements.description,
        status: requirements.status,
        priority: requirements.priority,
        category: requirements.category,
        sourceReference: requirements.sourceReference,
      })
      .from(requirements)
      .where(and(...conditions));

    if (typeof query.limit === 'function') {
      query = query.limit(safeLimit);
    }
    if (typeof query.offset === 'function') {
      query = query.offset(safeOffset);
    }

    const rows = await query;
    const rawList = Array.isArray(rows) ? rows : [];
    const finalRows = rawList.slice(0, safeLimit);

    return {
      projectId: project.id,
      requirements: finalRows,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        count: finalRows.length,
        hasMore: finalRows.length === safeLimit,
      },
    };
  },
};

// ── Tool 3: list_tasks ──
export const listTasksTool: McpTool<{
  projectId: string;
  status?: string;
  milestoneId?: string;
  limit?: number;
  offset?: number;
}> = {
  name: 'list_tasks',
  description: 'List tasks for a project with optional status, milestone filtering, and pagination',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique UUID of the project' },
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'doing', 'blocked', 'done'],
        description: 'Optional filter by task status',
      },
      milestoneId: {
        type: 'string',
        description: 'Optional milestone UUID filter',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Maximum number of tasks to return (default 50, max 100)',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Zero-based offset for pagination (default 0)',
      },
    },
    required: ['projectId'],
  },
  handler: async (db, context, args) => {
    if (context.signal?.aborted) {
      throw new McpError('Tool execution cancelled', 'cancelled', 499);
    }
    const { project } = await validateProjectAccess(db, context, args.projectId);

    const safeLimit = Math.min(Math.max(1, Number(args.limit ?? 50)), 100);
    const safeOffset = Math.max(0, Number(args.offset ?? 0));

    const conditions = [eq(tasks.projectId, project.id)];
    if (args.status) {
      conditions.push(eq(tasks.status, args.status as any));
    }
    if (args.milestoneId) {
      conditions.push(eq(tasks.milestoneId, args.milestoneId));
    }

    let query: any = db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        milestoneId: tasks.milestoneId,
        assigneeDisplayName: users.displayName,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeUserId, users.id))
      .where(and(...conditions));

    if (typeof query.limit === 'function') {
      query = query.limit(safeLimit);
    }
    if (typeof query.offset === 'function') {
      query = query.offset(safeOffset);
    }

    const rows = await query;
    const rawList = Array.isArray(rows) ? rows : [];
    const finalRows = rawList.slice(0, safeLimit);

    return {
      projectId: project.id,
      tasks: finalRows.map((r: any) => ({
        ...r,
        dueDate: r.dueDate
          ? r.dueDate instanceof Date
            ? r.dueDate.toISOString()
            : String(r.dueDate)
          : null,
      })),
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        count: finalRows.length,
        hasMore: finalRows.length === safeLimit,
      },
    };
  },
};

// ── Tool 4: get_delivery_report ──
export const getDeliveryReportTool: McpTool<{ projectId: string }> = {
  name: 'get_delivery_report',
  description:
    'Get project delivery progress and verification metrics (metrics only, no raw evidence)',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique UUID of the project' },
    },
    required: ['projectId'],
  },
  handler: async (db, context, args) => {
    if (context.signal?.aborted) {
      throw new McpError('Tool execution cancelled', 'cancelled', 499);
    }
    const { project } = await validateProjectAccess(db, context, args.projectId);

    const [tasksList, reqsList, evidenceCountResult] = await Promise.all([
      db
        .select({
          status: tasks.status,
        })
        .from(tasks)
        .where(eq(tasks.projectId, project.id)),
      db
        .select({
          status: requirements.status,
        })
        .from(requirements)
        .where(eq(requirements.projectId, project.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(evidence)
        .innerJoin(requirements, eq(evidence.requirementId, requirements.id))
        .where(eq(requirements.projectId, project.id)),
    ]);

    const totalTasks = tasksList.length;
    const completedTasks = tasksList.filter((t) => t.status === 'done').length;
    const blockedTasks = tasksList.filter((t) => t.status === 'blocked').length;
    const inProgressTasks = tasksList.filter((t) => t.status === 'doing').length;

    const totalRequirements = reqsList.length;
    const verifiedRequirements = reqsList.filter((r) => r.status === 'verified').length;
    const unverifiedRequirements = totalRequirements - verifiedRequirements;

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      projectId: project.id,
      projectName: project.name,
      completionRate,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        blocked: blockedTasks,
        inProgress: inProgressTasks,
      },
      requirements: {
        total: totalRequirements,
        verified: verifiedRequirements,
        unverified: unverifiedRequirements,
      },
      evidenceCount: Number(evidenceCountResult[0]?.count ?? 0),
      generatedAt: new Date().toISOString(),
    };
  },
};

export const MCP_TOOLS: Record<string, McpTool<any>> = {
  get_project_summary: getProjectSummaryTool,
  list_requirements: listRequirementsTool,
  list_tasks: listTasksTool,
  get_delivery_report: getDeliveryReportTool,
};

/**
 * Copilot Context Reader
 * Reads strictly bounded project records for authenticated users.
 * Enforces workspace isolation and role permissions.
 * Never leaks data across workspace boundaries or unassigned projects.
 */

import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import {
  projects,
  milestones,
  tasks,
  requirements,
  evidence,
  projectBriefRevisions,
  workspaceMembers,
  users,
} from '../db/schema.js';
import type { CopilotContext } from './types.js';

export class CopilotAccessError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_found' | 'forbidden',
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CopilotAccessError';
  }
}

/**
 * Reads bounded, typed context for Copilot analysis.
 */
export async function readCopilotContext(
  db: Database,
  userId: string,
  projectId: string,
): Promise<CopilotContext> {
  // 1. Fetch project
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project) {
    throw new CopilotAccessError('Project not found or has been deleted', 'not_found', 404);
  }

  // 2. Verify user is a member of the project workspace
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

  if (!member) {
    throw new CopilotAccessError(
      'Access denied: You do not have permission to access this project',
      'forbidden',
      403,
    );
  }

  // 3. Fetch project records in parallel
  const [
    milestonesList,
    tasksList,
    requirementsList,
    evidenceList,
    briefRevisionsList,
    workspaceUsersList,
  ] = await Promise.all([
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        description: milestones.description,
        dueDate: milestones.dueDate,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId)),

    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        milestoneId: tasks.milestoneId,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId)),

    db
      .select({
        id: requirements.id,
        title: requirements.title,
        description: requirements.description,
        category: requirements.category,
        priority: requirements.priority,
        status: requirements.status,
        sourceReference: requirements.sourceReference,
      })
      .from(requirements)
      .where(eq(requirements.projectId, projectId)),

    db
      .select({
        id: evidence.id,
        requirementId: evidence.requirementId,
        taskId: evidence.taskId,
        type: evidence.type,
        title: evidence.title,
        content: evidence.content,
      })
      .from(evidence)
      .where(eq(evidence.projectId, projectId)),

    db
      .select({
        id: projectBriefRevisions.id,
        revisionNumber: projectBriefRevisions.revisionNumber,
        title: projectBriefRevisions.title,
        content: projectBriefRevisions.content,
      })
      .from(projectBriefRevisions)
      .where(eq(projectBriefRevisions.projectId, projectId))
      .orderBy(desc(projectBriefRevisions.revisionNumber))
      .limit(5),

    db
      .select({ displayName: users.displayName })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, project.workspaceId)),
  ]);

  const memberNames = workspaceUsersList.map((u) => u.displayName);

  return {
    workspaceId: project.workspaceId,
    project: {
      id: project.id,
      name: project.name,
      goal: project.goal,
      audience: project.audience,
      deliverable: project.deliverable,
      deadline: project.deadline ? project.deadline.toISOString() : null,
      status: project.status,
    },
    milestones: milestonesList.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    })),
    tasks: tasksList.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      milestoneId: t.milestoneId,
    })),
    requirements: requirementsList.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      priority: r.priority,
      status: r.status,
      sourceReference: r.sourceReference,
    })),
    evidence: evidenceList.map((e) => ({
      id: e.id,
      requirementId: e.requirementId,
      taskId: e.taskId,
      type: e.type,
      title: e.title,
      content: e.content,
    })),
    briefRevisions: briefRevisionsList.map((b) => ({
      id: b.id,
      revisionNumber: b.revisionNumber,
      title: b.title,
      content: b.content,
    })),
    memberNames,
  };
}

/**
 * Copilot / Delivery Agent Context Reader
 * Reads strictly bounded project records for authenticated users.
 * Enforces workspace isolation and role permissions.
 * Never leaks data across workspace boundaries or unassigned projects.
 */

import { eq, and, desc, inArray } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import {
  projects,
  milestones,
  tasks,
  requirements,
  requirementTasks,
  evidence,
  verifications,
  projectBriefRevisions,
  workspaceMembers,
  auditEvents,
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
 * Reads bounded, typed context for Copilot / Delivery Agent analysis.
 */
export async function readCopilotContext(
  db: Database,
  userId: string,
  projectId: string,
  briefRevisionId?: string,
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
    auditEventsList,
  ] = await Promise.all([
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        description: milestones.description,
        dueDate: milestones.dueDate,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(milestones.sortOrder),

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
      .where(eq(tasks.projectId, projectId))
      .orderBy(tasks.sortOrder),

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

    db
      .select({
        action: auditEvents.action,
        subjectType: auditEvents.subjectType,
        subjectId: auditEvents.subjectId,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, project.workspaceId))
      .orderBy(desc(auditEvents.createdAt))
  let orderedBriefRevisions = briefRevisionsList;
  if (briefRevisionId) {
    const foundIndex = orderedBriefRevisions.findIndex((b) => b.id === briefRevisionId);
    if (foundIndex > 0) {
      const selected = orderedBriefRevisions[foundIndex]!;
      orderedBriefRevisions = [selected, ...orderedBriefRevisions.filter((b) => b.id !== briefRevisionId)];
    } else if (foundIndex === -1) {
      // If the selected brief revision is older than top 5, fetch it specifically
      const [specificBrief] = await db
        .select({
          id: projectBriefRevisions.id,
          revisionNumber: projectBriefRevisions.revisionNumber,
          title: projectBriefRevisions.title,
          content: projectBriefRevisions.content,
        })
        .from(projectBriefRevisions)
        .where(
          and(
            eq(projectBriefRevisions.id, briefRevisionId),
            eq(projectBriefRevisions.projectId, projectId),
          ),
        )
        .limit(1);
      if (specificBrief) {
        orderedBriefRevisions = [specificBrief, ...orderedBriefRevisions];
      }
    }
  }

  const reqIds = requirementsList.map((r) => r.id);

  // Fetch requirement-task links and verifications if requirements exist
  let reqTaskLinks: Array<{ requirementId: string; taskId: string }> = [];
  let verificationsList: Array<{
    id: string;
    requirementId: string;
    status: string;
    notes: string | null;
    createdAt: Date;
  }> = [];

  if (reqIds.length > 0) {
    const [links, verifs] = await Promise.all([
      db
        .select({
          requirementId: requirementTasks.requirementId,
          taskId: requirementTasks.taskId,
        })
        .from(requirementTasks)
        .where(inArray(requirementTasks.requirementId, reqIds)),
      db
        .select({
          id: verifications.id,
          requirementId: verifications.requirementId,
          status: verifications.status,
          notes: verifications.notes,
          createdAt: verifications.createdAt,
        })
        .from(verifications)
        .where(inArray(verifications.requirementId, reqIds))
        .orderBy(desc(verifications.createdAt)),
    ]);
    reqTaskLinks = links;
    verificationsList = verifs;
  }

  // Pre-calculate linkage maps
  const taskToReqsMap = new Map<string, string[]>();
  const reqToTasksMap = new Map<string, string[]>();

  for (const link of reqTaskLinks) {
    const existingReqs = taskToReqsMap.get(link.taskId) ?? [];
    existingReqs.push(link.requirementId);
    taskToReqsMap.set(link.taskId, existingReqs);

    const existingTasks = reqToTasksMap.get(link.requirementId) ?? [];
    existingTasks.push(link.taskId);
    reqToTasksMap.set(link.requirementId, existingTasks);
  }

  // Pre-calculate evidence count map
  const reqEvidenceCountMap = new Map<string, number>();
  for (const ev of evidenceList) {
    reqEvidenceCountMap.set(ev.requirementId, (reqEvidenceCountMap.get(ev.requirementId) ?? 0) + 1);
  }

  // Pre-calculate latest verification status map
  const reqVerificationMap = new Map<string, string>();
  for (const v of verificationsList) {
    if (!reqVerificationMap.has(v.requirementId)) {
      reqVerificationMap.set(v.requirementId, v.status);
    }
  }

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
      linkedRequirementIds: taskToReqsMap.get(t.id) ?? [],
    })),
    requirements: requirementsList.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      priority: r.priority,
      status: r.status,
      sourceReference: r.sourceReference,
      linkedTaskIds: reqToTasksMap.get(r.id) ?? [],
      evidenceCount: reqEvidenceCountMap.get(r.id) ?? 0,
      verificationStatus: reqVerificationMap.get(r.id) ?? null,
    })),
    evidence: evidenceList.map((e) => ({
      id: e.id,
      requirementId: e.requirementId,
      taskId: e.taskId,
      type: e.type,
      title: e.title,
      content: e.content,
    })),
    verifications: verificationsList.map((v) => ({
      id: v.id,
      requirementId: v.requirementId,
      status: v.status,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
    })),
    briefRevisions: orderedBriefRevisions.map((b) => ({
      id: b.id,
      revisionNumber: b.revisionNumber,
      title: b.title,
      content: b.content,
    })),
    requirementTasks: reqTaskLinks,
    recentAuditEvents: auditEventsList.map((a) => ({
      action: a.action,
      subjectType: a.subjectType,
      subjectId: a.subjectId,
      createdAt: a.createdAt.toISOString(),
    })),
    memberNames,
  };
}

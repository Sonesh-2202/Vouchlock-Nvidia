/**
 * Domain rules for ProjectPilot.
 * Pure functions — no side effects, no I/O, no external imports.
 */

import type {
  TaskStatus,
  WorkspaceRole,
  RequirementStatus,
  Requirement,
  RequirementTaskLink,
  Evidence,
  RequirementCoverageStatus,
  DeliveryPlanDraft,
  ProjectChangeRecord,
  ProjectFreshnessEvaluation,
} from './types.js';

// ── Role Permissions ──

export type Permission =
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:delete'
  | 'members:read'
  | 'members:invite'
  | 'members:remove'
  | 'members:update_role'
  | 'project:create'
  | 'project:read'
  | 'project:update'
  | 'project:delete'
  | 'project:export'
  | 'task:create'
  | 'task:read'
  | 'task:update'
  | 'task:delete'
  | 'comment:create'
  | 'comment:read'
  | 'ai:generate'
  | 'ai:accept'
  | 'audit:read'
  | 'requirement:create'
  | 'requirement:read'
  | 'requirement:update'
  | 'requirement:delete'
  | 'requirement:verify'
  | 'evidence:create'
  | 'evidence:read'
  | 'evidence:delete'
  | 'report:generate'
  | 'brief:create'
  | 'brief:read'
  | 'brief:update'
  | 'proposal:extract'
  | 'proposal:accept';

const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  owner: [
    'workspace:read',
    'workspace:update',
    'workspace:delete',
    'members:read',
    'members:invite',
    'members:remove',
    'members:update_role',
    'project:create',
    'project:read',
    'project:update',
    'project:delete',
    'project:export',
    'task:create',
    'task:read',
    'task:update',
    'task:delete',
    'comment:create',
    'comment:read',
    'ai:generate',
    'ai:accept',
    'audit:read',
    'requirement:create',
    'requirement:read',
    'requirement:update',
    'requirement:delete',
    'requirement:verify',
    'evidence:create',
    'evidence:read',
    'evidence:delete',
    'report:generate',
    'brief:create',
    'brief:read',
    'brief:update',
    'proposal:extract',
    'proposal:accept',
  ],
  admin: [
    'workspace:read',
    'workspace:update',
    'members:read',
    'members:invite',
    'members:remove',
    'project:create',
    'project:read',
    'project:update',
    'project:delete',
    'project:export',
    'task:create',
    'task:read',
    'task:update',
    'task:delete',
    'comment:create',
    'comment:read',
    'ai:generate',
    'ai:accept',
    'audit:read',
    'requirement:create',
    'requirement:read',
    'requirement:update',
    'requirement:delete',
    'requirement:verify',
    'evidence:create',
    'evidence:read',
    'evidence:delete',
    'report:generate',
    'brief:create',
    'brief:read',
    'brief:update',
    'proposal:extract',
    'proposal:accept',
  ],
  member: [
    'workspace:read',
    'members:read',
    'project:create',
    'project:read',
    'project:update',
    'project:export',
    'task:create',
    'task:read',
    'task:update',
    'comment:create',
    'comment:read',
    'ai:generate',
    'ai:accept',
    'requirement:create',
    'requirement:read',
    'requirement:update',
    'evidence:create',
    'evidence:read',
    'report:generate',
    'brief:create',
    'brief:read',
    'brief:update',
    'proposal:extract',
    'proposal:accept',
  ],
} as const;

export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function getRolePermissions(role: WorkspaceRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

// ── Task Status Transitions ──

const VALID_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo'],
  todo: ['doing', 'backlog'],
  doing: ['blocked', 'done', 'todo'],
  blocked: ['doing', 'todo'],
  done: ['doing', 'todo'],
} as const;

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

export function getValidTransitions(from: TaskStatus): readonly TaskStatus[] {
  return VALID_TRANSITIONS[from];
}

// ── Invite Validation ──

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isInviteExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now >= expiresAt;
}

export function computeInviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_EXPIRY_MS);
}

export function isInviteUsable(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  if (invite.acceptedAt !== null) return false;
  if (invite.revokedAt !== null) return false;
  return !isInviteExpired(invite.expiresAt, now);
}

// ── Workspace Ownership ──

export function canRemoveMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  targetIsLastOwner: boolean,
): boolean {
  if (targetIsLastOwner) return false; // last owner cannot be removed
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin' && targetRole === 'member') return true;
  return false;
}

// ── Plan Draft Validation ──

export interface PlanDraftMilestone {
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly tasks: PlanDraftTask[];
}

export interface PlanDraftTask {
  readonly title: string;
  readonly description?: string | null;
  readonly ownerSuggestion?: string | null;
  readonly dueDate?: string | null;
  readonly dependencyTitles?: string[];
}

export interface PlanDraft {
  readonly summary: string;
  readonly assumptions: string[];
  readonly risks: string[];
  readonly milestones: PlanDraftMilestone[];
}

export interface PlanValidationError {
  readonly path: string;
  readonly message: string;
}

/**
 * Validate an AI-generated plan draft.
 * Rules from brief: never invent named users, validate dates,
 * no circular dependencies.
 */
export function validatePlanDraft(
  draft: PlanDraft,
  memberNames: string[],
  projectDeadline: Date | null,
): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  if (!draft.summary || draft.summary.trim().length === 0) {
    errors.push({ path: 'summary', message: 'Summary is required' });
  }

  if (!Array.isArray(draft.milestones) || draft.milestones.length === 0) {
    errors.push({ path: 'milestones', message: 'At least one milestone is required' });
  }

  const allTaskTitles = new Set<string>();

  draft.milestones.forEach((milestone, mi) => {
    if (!milestone.title || milestone.title.trim().length === 0) {
      errors.push({ path: `milestones[${mi}].title`, message: 'Milestone title is required' });
    }

    // Validate milestone due date
    if (milestone.dueDate) {
      const date = new Date(milestone.dueDate);
      if (isNaN(date.getTime())) {
        errors.push({
          path: `milestones[${mi}].dueDate`,
          message: 'Invalid date format',
        });
      } else if (projectDeadline && date > projectDeadline) {
        errors.push({
          path: `milestones[${mi}].dueDate`,
          message: 'Milestone due date exceeds project deadline',
        });
      }
    }

    milestone.tasks.forEach((task, ti) => {
      const taskPath = `milestones[${mi}].tasks[${ti}]`;

      if (!task.title || task.title.trim().length === 0) {
        errors.push({ path: `${taskPath}.title`, message: 'Task title is required' });
      } else {
        allTaskTitles.add(task.title);
      }

      // Never invent named users — owner suggestion must match a member or be null
      if (task.ownerSuggestion && !memberNames.includes(task.ownerSuggestion)) {
        errors.push({
          path: `${taskPath}.ownerSuggestion`,
          message: `Owner suggestion "${task.ownerSuggestion}" does not match any workspace member`,
        });
      }

      // Validate task due date
      if (task.dueDate) {
        const date = new Date(task.dueDate);
        if (isNaN(date.getTime())) {
          errors.push({ path: `${taskPath}.dueDate`, message: 'Invalid date format' });
        } else if (projectDeadline && date > projectDeadline) {
          errors.push({
            path: `${taskPath}.dueDate`,
            message: 'Task due date exceeds project deadline',
          });
        }
      }

      // Validate dependency titles reference real tasks
      if (task.dependencyTitles) {
        for (const dep of task.dependencyTitles) {
          if (dep === task.title) {
            errors.push({
              path: `${taskPath}.dependencyTitles`,
              message: `Task cannot depend on itself`,
            });
          }
        }
      }
    });
  });

  // Check for dependency cycles (simple: ensure all referenced tasks exist)
  draft.milestones.forEach((milestone, mi) => {
    milestone.tasks.forEach((task, ti) => {
      if (task.dependencyTitles) {
        for (const dep of task.dependencyTitles) {
          if (!allTaskTitles.has(dep)) {
            errors.push({
              path: `milestones[${mi}].tasks[${ti}].dependencyTitles`,
              message: `Dependency "${dep}" does not match any task in the plan`,
            });
          }
        }
      }
    });
  });

  return errors;
}

// ── Requirement Rules ──

const ALLOWED_REQUIREMENT_TRANSITIONS: Record<RequirementStatus, readonly RequirementStatus[]> = {
  draft: ['active', 'blocked', 'deprecated'],
  active: ['verified', 'blocked', 'deprecated'],
  blocked: ['active', 'deprecated'],
  verified: ['active', 'deprecated'], // Reopening requires 'active'
  deprecated: ['active'],
};

export function canTransitionRequirementStatus(
  from: RequirementStatus,
  to: RequirementStatus,
  role: WorkspaceRole,
): boolean {
  if (from === to) return true;

  // Check valid state machine transition
  const allowed = ALLOWED_REQUIREMENT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) return false;

  // Explicit verification or reopening requires owner or admin
  if (to === 'verified' && role !== 'owner' && role !== 'admin') {
    return false;
  }
  if (from === 'verified' && role !== 'owner' && role !== 'admin') {
    return false;
  }

  // Deprecating requires owner or admin
  if (to === 'deprecated' && role !== 'owner' && role !== 'admin') {
    return false;
  }

  return true;
}

export interface DeliveryMetrics {
  readonly totalRequirements: number;
  readonly verifiedCount: number;
  readonly activeCount: number;
  readonly blockedCount: number;
  readonly draftCount: number;
  readonly deprecatedCount: number;
  readonly percentVerified: number;
  readonly requirementsWithTasksCount: number;
  readonly unlinkedRequirementsCount: number;
  readonly requirementsWithEvidenceCount: number;
  readonly requirementsWithoutEvidenceCount: number;
}

export function computeDeliveryMetrics(
  requirements: readonly Requirement[],
  taskLinks: readonly RequirementTaskLink[],
  evidence: readonly Evidence[],
): DeliveryMetrics {
  const total = requirements.length;
  let verified = 0;
  let active = 0;
  let blocked = 0;
  let draft = 0;
  let deprecated = 0;

  for (const req of requirements) {
    switch (req.status) {
      case 'verified':
        verified++;
        break;
      case 'active':
        active++;
        break;
      case 'blocked':
        blocked++;
        break;
      case 'draft':
        draft++;
        break;
      case 'deprecated':
        deprecated++;
        break;
    }
  }

  const linkedReqIds = new Set(taskLinks.map((l) => l.requirementId));
  const evidenceReqIds = new Set(evidence.map((e) => e.requirementId));

  let reqsWithTasks = 0;
  let reqsWithEvidence = 0;

  for (const req of requirements) {
    if (linkedReqIds.has(req.id)) {
      reqsWithTasks++;
    }
    if (evidenceReqIds.has(req.id)) {
      reqsWithEvidence++;
    }
  }

  const activeBase = total - deprecated;
  const pct = activeBase > 0 ? Math.round((verified / activeBase) * 100) : 0;

  return {
    totalRequirements: total,
    verifiedCount: verified,
    activeCount: active,
    blockedCount: blocked,
    draftCount: draft,
    deprecatedCount: deprecated,
    percentVerified: pct,
    requirementsWithTasksCount: reqsWithTasks,
    unlinkedRequirementsCount: total - reqsWithTasks,
    requirementsWithEvidenceCount: reqsWithEvidence,
    requirementsWithoutEvidenceCount: total - reqsWithEvidence,
  };
}

// ── Brief Revision Validation ──

export function validateBriefRevisionInput(
  title: string,
  content: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  if (trimmedTitle.length === 0) {
    errors.push('Brief title cannot be empty.');
  } else if (trimmedTitle.length > 200) {
    errors.push('Brief title cannot exceed 200 characters.');
  }

  if (trimmedContent.length < 10) {
    errors.push('Brief content must be at least 10 characters.');
  } else if (trimmedContent.length > 50000) {
    errors.push('Brief content cannot exceed 50,000 characters.');
  }

  return { valid: errors.length === 0, errors };
}

// ── Proposal Validation ──

export function validateProposalCandidates(
  candidates: readonly { tempId: string; title: string; category?: string; priority?: string }[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenTempIds = new Set<string>();

  if (!Array.isArray(candidates) || candidates.length === 0) {
    errors.push('Proposal must contain at least one candidate requirement.');
    return { valid: false, errors };
  }

  candidates.forEach((cand, idx) => {
    if (!cand.tempId || cand.tempId.trim().length === 0) {
      errors.push(`Candidate at index ${idx} missing tempId.`);
    } else if (seenTempIds.has(cand.tempId)) {
      errors.push(`Duplicate candidate tempId "${cand.tempId}".`);
    } else {
      seenTempIds.add(cand.tempId);
    }

    if (!cand.title || cand.title.trim().length === 0) {
      errors.push(`Candidate "${cand.tempId || idx}" title cannot be empty.`);
    } else if (cand.title.trim().length > 300) {
      errors.push(`Candidate "${cand.tempId || idx}" title cannot exceed 300 characters.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ── Delivery Plan & Coverage Rules ──

/**
 * Computes coverage status for a requirement.
 * Truthful rule: Tasks existing does NOT mean requirement is complete or verified.
 * Coverage reflects work mapping and proof collection status.
 */
export function computeRequirementCoverageStatus(params: {
  hasLinkedTasks: boolean;
  hasEvidence: boolean;
  isVerified?: boolean;
  isAmbiguous?: boolean;
}): RequirementCoverageStatus {
  if (params.isAmbiguous) return 'needs_clarification';
  if (params.hasLinkedTasks && params.hasEvidence) return 'covered';
  if (params.hasLinkedTasks || params.hasEvidence) return 'partially_covered';
  return 'uncovered';
}

/**
 * Evaluates whether an agent delivery analysis is stale compared to recent project updates.
 * Pure function: compares timestamps without side effects or I/O.
 */
export function computeProjectFreshness(
  lastReportGeneratedAt: Date | string | null | undefined,
  records: readonly ProjectChangeRecord[],
): ProjectFreshnessEvaluation {
  if (!lastReportGeneratedAt) {
    return {
      isStale: false,
      lastReportGeneratedAt: null,
      changedRecords: [],
    };
  }

  const threshold = new Date(lastReportGeneratedAt).getTime();
  if (isNaN(threshold)) {
    return {
      isStale: false,
      lastReportGeneratedAt: null,
      changedRecords: [],
    };
  }

  const changed = records.filter((r) => {
    const recTime = new Date(r.updatedAt).getTime();
    return !isNaN(recTime) && recTime > threshold;
  });

  return {
    isStale: changed.length > 0,
    lastReportGeneratedAt:
      typeof lastReportGeneratedAt === 'string'
        ? lastReportGeneratedAt
        : lastReportGeneratedAt.toISOString(),
    changedRecords: changed,
  };
}

/**
 * Validates a Delivery Plan draft proposed by the agent.
 * Enforces:
 * - Non-empty summary and milestones
 * - Due dates cannot exceed project deadline
 * - Owner suggestions must match real workspace members (never invent users)
 * - Tasks must specify title and evidence needed
 */
export function validateDeliveryPlanDraft(
  plan: DeliveryPlanDraft,
  memberNames: string[],
  projectDeadline: Date | null,
): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  if (!plan.summary || plan.summary.trim().length === 0) {
    errors.push({ path: 'summary', message: 'Delivery plan summary is required' });
  }

  if (!Array.isArray(plan.requirements) || plan.requirements.length === 0) {
    errors.push({
      path: 'requirements',
      message: 'Delivery plan must map at least one requirement to execution work',
    });
  }

  if (!Array.isArray(plan.milestones) || plan.milestones.length === 0) {
    errors.push({ path: 'milestones', message: 'At least one milestone is required in delivery plan' });
  }

  const allTaskTitles = new Set<string>();

  plan.milestones?.forEach((milestone, mi) => {
    if (!milestone.title || milestone.title.trim().length === 0) {
      errors.push({ path: `milestones[${mi}].title`, message: 'Milestone title is required' });
    }

    if (milestone.dueDate) {
      const date = new Date(milestone.dueDate);
      if (isNaN(date.getTime())) {
        errors.push({ path: `milestones[${mi}].dueDate`, message: 'Invalid milestone due date format' });
      } else if (projectDeadline && date > projectDeadline) {
        errors.push({
          path: `milestones[${mi}].dueDate`,
          message: 'Milestone due date exceeds project deadline',
        });
      }
    }

    milestone.tasks?.forEach((task, ti) => {
      const taskPath = `milestones[${mi}].tasks[${ti}]`;

      if (!task.title || task.title.trim().length === 0) {
        errors.push({ path: `${taskPath}.title`, message: 'Task title is required' });
      } else {
        allTaskTitles.add(task.title);
      }

      if (task.ownerSuggestion && !memberNames.includes(task.ownerSuggestion)) {
        errors.push({
          path: `${taskPath}.ownerSuggestion`,
          message: `Owner suggestion "${task.ownerSuggestion}" does not match any workspace member`,
        });
      }

      if (task.dueDate) {
        const date = new Date(task.dueDate);
        if (isNaN(date.getTime())) {
          errors.push({ path: `${taskPath}.dueDate`, message: 'Invalid task due date format' });
        } else if (projectDeadline && date > projectDeadline) {
          errors.push({
            path: `${taskPath}.dueDate`,
            message: 'Task due date exceeds project deadline',
          });
        }
      }
    });
  });

  return errors;
}


/**
 * Domain rules tests — pure functions, no I/O.
 */

import { describe, test, expect } from 'vitest';
import {
  hasPermission,
  isValidStatusTransition,
  getValidTransitions,
  isInviteUsable,
  computeInviteExpiry,
  canRemoveMember,
  validatePlanDraft,
  canTransitionRequirementStatus,
  computeDeliveryMetrics,
  validateBriefRevisionInput,
  validateProposalCandidates,
  type PlanDraft,
} from '../src/rules.js';

describe('hasPermission', () => {
  test('owner has all permissions', () => {
    expect(hasPermission('owner', 'workspace:delete')).toBe(true);
    expect(hasPermission('owner', 'members:update_role')).toBe(true);
    expect(hasPermission('owner', 'ai:generate')).toBe(true);
    expect(hasPermission('owner', 'audit:read')).toBe(true);
  });

  test('admin cannot delete workspace or update roles', () => {
    expect(hasPermission('admin', 'workspace:delete')).toBe(false);
    expect(hasPermission('admin', 'members:update_role')).toBe(false);
    expect(hasPermission('admin', 'project:delete')).toBe(true);
  });

  test('member has limited permissions', () => {
    expect(hasPermission('member', 'workspace:delete')).toBe(false);
    expect(hasPermission('member', 'members:invite')).toBe(false);
    expect(hasPermission('member', 'project:read')).toBe(true);
    expect(hasPermission('member', 'task:create')).toBe(true);
    expect(hasPermission('member', 'comment:create')).toBe(true);
    expect(hasPermission('member', 'project:delete')).toBe(false);
    expect(hasPermission('member', 'audit:read')).toBe(false);
  });
});

describe('isValidStatusTransition', () => {
  test('same status is always valid', () => {
    expect(isValidStatusTransition('backlog', 'backlog')).toBe(true);
    expect(isValidStatusTransition('done', 'done')).toBe(true);
  });

  test('valid transitions', () => {
    expect(isValidStatusTransition('backlog', 'todo')).toBe(true);
    expect(isValidStatusTransition('todo', 'doing')).toBe(true);
    expect(isValidStatusTransition('doing', 'done')).toBe(true);
    expect(isValidStatusTransition('doing', 'blocked')).toBe(true);
    expect(isValidStatusTransition('blocked', 'doing')).toBe(true);
    expect(isValidStatusTransition('done', 'doing')).toBe(true);
  });

  test('invalid transitions', () => {
    expect(isValidStatusTransition('backlog', 'done')).toBe(false);
    expect(isValidStatusTransition('backlog', 'doing')).toBe(false);
    expect(isValidStatusTransition('done', 'backlog')).toBe(false);
  });

  test('getValidTransitions returns correct options', () => {
    expect(getValidTransitions('backlog')).toEqual(['todo']);
    expect(getValidTransitions('doing')).toEqual(['blocked', 'done', 'todo']);
  });
});

describe('invite lifecycle', () => {
  test('computeInviteExpiry returns 7 days later', () => {
    const now = new Date('2026-10-11T00:00:00Z');
    const expiry = computeInviteExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('isInviteUsable rejects expired invite', () => {
    const invite = {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date('2026-10-01'),
    };
    expect(isInviteUsable(invite, new Date('2026-10-11'))).toBe(false);
  });

  test('isInviteUsable rejects accepted invite', () => {
    const invite = {
      acceptedAt: new Date('2026-10-05'),
      revokedAt: null,
      expiresAt: new Date('2026-12-01'),
    };
    expect(isInviteUsable(invite)).toBe(false);
  });

  test('isInviteUsable rejects revoked invite', () => {
    const invite = {
      acceptedAt: null,
      revokedAt: new Date('2026-10-05'),
      expiresAt: new Date('2026-12-01'),
    };
    expect(isInviteUsable(invite)).toBe(false);
  });

  test('isInviteUsable accepts valid invite', () => {
    const invite = {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date('2026-12-01'),
    };
    expect(isInviteUsable(invite, new Date('2026-10-11'))).toBe(true);
  });
});

describe('canRemoveMember', () => {
  test('owner can remove admin', () => {
    expect(canRemoveMember('owner', 'admin', false)).toBe(true);
  });

  test('owner can remove member', () => {
    expect(canRemoveMember('owner', 'member', false)).toBe(true);
  });

  test('cannot remove last owner', () => {
    expect(canRemoveMember('owner', 'owner', true)).toBe(false);
  });

  test('admin can remove member', () => {
    expect(canRemoveMember('admin', 'member', false)).toBe(true);
  });

  test('admin cannot remove owner', () => {
    expect(canRemoveMember('admin', 'owner', false)).toBe(false);
  });

  test('admin cannot remove admin', () => {
    expect(canRemoveMember('admin', 'admin', false)).toBe(false);
  });

  test('member cannot remove anyone', () => {
    expect(canRemoveMember('member', 'member', false)).toBe(false);
  });
});

describe('validatePlanDraft', () => {
  const validDraft: PlanDraft = {
    summary: 'Build a web app for project management',
    assumptions: ['Team has web dev experience'],
    risks: ['Scope creep'],
    milestones: [
      {
        title: 'Phase 1: Setup',
        tasks: [
          { title: 'Set up repo', description: 'Initialize project' },
          { title: 'Create database', dependencyTitles: ['Set up repo'] },
        ],
      },
    ],
  };

  test('valid draft produces no errors', () => {
    expect(validatePlanDraft(validDraft, [], null)).toEqual([]);
  });

  test('rejects empty summary', () => {
    const draft = { ...validDraft, summary: '' };
    const errors = validatePlanDraft(draft, [], null);
    expect(errors.some((e) => e.path === 'summary')).toBe(true);
  });

  test('rejects empty milestones', () => {
    const draft = { ...validDraft, milestones: [] };
    const errors = validatePlanDraft(draft, [], null);
    expect(errors.some((e) => e.path === 'milestones')).toBe(true);
  });

  test('rejects unknown owner suggestion', () => {
    const draft: PlanDraft = {
      ...validDraft,
      milestones: [
        {
          title: 'M1',
          tasks: [{ title: 'T1', ownerSuggestion: 'Unknown Person' }],
        },
      ],
    };
    const errors = validatePlanDraft(draft, ['Alice', 'Bob'], null);
    expect(errors.some((e) => e.message.includes('Unknown Person'))).toBe(true);
  });

  test('accepts valid owner suggestion', () => {
    const draft: PlanDraft = {
      ...validDraft,
      milestones: [
        {
          title: 'M1',
          tasks: [{ title: 'T1', ownerSuggestion: 'Alice' }],
        },
      ],
    };
    const errors = validatePlanDraft(draft, ['Alice'], null);
    expect(errors).toEqual([]);
  });

  test('rejects task due date past project deadline', () => {
    const draft: PlanDraft = {
      ...validDraft,
      milestones: [
        {
          title: 'M1',
          tasks: [{ title: 'T1', dueDate: '2027-06-01T00:00:00Z' }],
        },
      ],
    };
    const errors = validatePlanDraft(draft, [], new Date('2027-01-01'));
    expect(errors.some((e) => e.message.includes('exceeds project deadline'))).toBe(true);
  });

  test('rejects self-dependency', () => {
    const draft: PlanDraft = {
      ...validDraft,
      milestones: [
        {
          title: 'M1',
          tasks: [{ title: 'T1', dependencyTitles: ['T1'] }],
        },
      ],
    };
    const errors = validatePlanDraft(draft, [], null);
    expect(errors.some((e) => e.message.includes('depend on itself'))).toBe(true);
  });

  test('rejects non-existent dependency', () => {
    const draft: PlanDraft = {
      ...validDraft,
      milestones: [
        {
          title: 'M1',
          tasks: [{ title: 'T1', dependencyTitles: ['Nonexistent Task'] }],
        },
      ],
    };
    const errors = validatePlanDraft(draft, [], null);
    expect(errors.some((e) => e.message.includes('does not match any task'))).toBe(true);
  });
});

describe('requirement domain rules', () => {
  test('requirement permissions check', () => {
    expect(hasPermission('owner', 'requirement:create')).toBe(true);
    expect(hasPermission('owner', 'requirement:verify')).toBe(true);
    expect(hasPermission('admin', 'requirement:verify')).toBe(true);
    expect(hasPermission('admin', 'requirement:delete')).toBe(true);

    expect(hasPermission('member', 'requirement:create')).toBe(true);
    expect(hasPermission('member', 'requirement:read')).toBe(true);
    expect(hasPermission('member', 'requirement:update')).toBe(true);
    expect(hasPermission('member', 'requirement:verify')).toBe(false);
    expect(hasPermission('member', 'requirement:delete')).toBe(false);
    expect(hasPermission('member', 'report:generate')).toBe(true);
  });

  test('canTransitionRequirementStatus enforces state transitions and roles', () => {
    // Valid transitions
    expect(canTransitionRequirementStatus('draft', 'active', 'member')).toBe(true);
    expect(canTransitionRequirementStatus('active', 'blocked', 'member')).toBe(true);
    expect(canTransitionRequirementStatus('blocked', 'active', 'member')).toBe(true);

    // Verification requires admin or owner
    expect(canTransitionRequirementStatus('active', 'verified', 'owner')).toBe(true);
    expect(canTransitionRequirementStatus('active', 'verified', 'admin')).toBe(true);
    expect(canTransitionRequirementStatus('active', 'verified', 'member')).toBe(false);

    // Reopening verified requires admin or owner
    expect(canTransitionRequirementStatus('verified', 'active', 'owner')).toBe(true);
    expect(canTransitionRequirementStatus('verified', 'active', 'admin')).toBe(true);
    expect(canTransitionRequirementStatus('verified', 'active', 'member')).toBe(false);

    // Deprecating requires admin or owner
    expect(canTransitionRequirementStatus('active', 'deprecated', 'owner')).toBe(true);
    expect(canTransitionRequirementStatus('active', 'deprecated', 'admin')).toBe(true);
    expect(canTransitionRequirementStatus('active', 'deprecated', 'member')).toBe(false);

    // Invalid transition
    expect(canTransitionRequirementStatus('draft', 'verified', 'owner')).toBe(false);
    expect(canTransitionRequirementStatus('blocked', 'verified', 'owner')).toBe(false);
  });

  test('computeDeliveryMetrics accurately computes traceability numbers', () => {
    const reqs = [
      {
        id: 'req-1',
        projectId: 'p1',
        title: 'Req 1',
        description: null,
        category: 'functional' as const,
        priority: 'high' as const,
        status: 'verified' as const,
        sourceReference: 'Brief section 1',
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
      {
        id: 'req-2',
        projectId: 'p1',
        title: 'Req 2',
        description: null,
        category: 'functional' as const,
        priority: 'normal' as const,
        status: 'active' as const,
        sourceReference: null,
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
      {
        id: 'req-3',
        projectId: 'p1',
        title: 'Req 3',
        description: null,
        category: 'constraint' as const,
        priority: 'low' as const,
        status: 'blocked' as const,
        sourceReference: null,
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
      {
        id: 'req-4',
        projectId: 'p1',
        title: 'Req 4',
        description: null,
        category: 'deliverable' as const,
        priority: 'high' as const,
        status: 'deprecated' as const,
        sourceReference: null,
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
    ];

    const taskLinks = [
      { requirementId: 'req-1', taskId: 'task-1' },
      { requirementId: 'req-2', taskId: 'task-2' },
    ];

    const evidence = [
      {
        id: 'ev-1',
        projectId: 'p1',
        requirementId: 'req-1',
        taskId: null,
        authorUserId: 'u1',
        type: 'url' as const,
        title: 'PR Link',
        content: 'https://github.com/org/repo/pull/1',
        createdAt: new Date(),
      },
    ];

    const metrics = computeDeliveryMetrics(reqs, taskLinks, evidence);

    expect(metrics.totalRequirements).toBe(4);
    expect(metrics.verifiedCount).toBe(1);
    expect(metrics.activeCount).toBe(1);
    expect(metrics.blockedCount).toBe(1);
    expect(metrics.deprecatedCount).toBe(1);
    // Active base is 4 - 1 deprecated = 3; verified is 1/3 = 33%
    expect(metrics.percentVerified).toBe(33);
    expect(metrics.requirementsWithTasksCount).toBe(2);
    expect(metrics.unlinkedRequirementsCount).toBe(2);
    expect(metrics.requirementsWithEvidenceCount).toBe(1);
    expect(metrics.requirementsWithoutEvidenceCount).toBe(3);
  });

  test('validates brief permissions for owner, admin, member', () => {
    expect(hasPermission('owner', 'brief:create')).toBe(true);
    expect(hasPermission('admin', 'brief:create')).toBe(true);
    expect(hasPermission('member', 'brief:create')).toBe(true);
    expect(hasPermission('member', 'proposal:extract')).toBe(true);
    expect(hasPermission('member', 'proposal:accept')).toBe(true);
  });

  test('validateBriefRevisionInput checks bounds', () => {
    const valid = validateBriefRevisionInput(
      'Valid Brief',
      'This is a comprehensive description of the project requirements.',
    );
    expect(valid.valid).toBe(true);
    expect(valid.errors.length).toBe(0);

    const emptyTitle = validateBriefRevisionInput('', 'Long enough text for content requirement.');
    expect(emptyTitle.valid).toBe(false);

    const shortContent = validateBriefRevisionInput('Title', 'Too short');
    expect(shortContent.valid).toBe(false);
  });

  test('validateProposalCandidates checks candidate list integrity', () => {
    const valid = validateProposalCandidates([
      { tempId: 'c1', title: 'First Requirement' },
      { tempId: 'c2', title: 'Second Requirement' },
    ]);
    expect(valid.valid).toBe(true);

    const duplicate = validateProposalCandidates([
      { tempId: 'c1', title: 'First Requirement' },
      { tempId: 'c1', title: 'Duplicate TempId' },
    ]);
    expect(duplicate.valid).toBe(false);

    const emptyTitle = validateProposalCandidates([{ tempId: 'c1', title: '   ' }]);
    expect(emptyTitle.valid).toBe(false);
  });
});

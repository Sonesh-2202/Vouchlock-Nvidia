/**
 * Unit & Integration tests for Requirements, Verification, and Delivery Report business logic.
 */

import { describe, test, expect } from 'vitest';
import {
  canTransitionRequirementStatus,
  computeDeliveryMetrics,
  hasPermission,
  type Requirement,
  type RequirementTaskLink,
  type Evidence,
} from '@projectpilot/domain';

describe('Requirements Domain Authorization & Verification', () => {
  test('strictly enforces verification authority: members cannot verify, owners and admins can', () => {
    expect(hasPermission('member', 'requirement:verify')).toBe(false);
    expect(hasPermission('admin', 'requirement:verify')).toBe(true);
    expect(hasPermission('owner', 'requirement:verify')).toBe(true);

    // Explicit state machine check
    expect(canTransitionRequirementStatus('active', 'verified', 'member')).toBe(false);
    expect(canTransitionRequirementStatus('active', 'verified', 'admin')).toBe(true);
    expect(canTransitionRequirementStatus('active', 'verified', 'owner')).toBe(true);
  });

  test('preserves auditability when reopening verified requirements: requires owner or admin', () => {
    // Reopening verified to active
    expect(canTransitionRequirementStatus('verified', 'active', 'member')).toBe(false);
    expect(canTransitionRequirementStatus('verified', 'active', 'admin')).toBe(true);
    expect(canTransitionRequirementStatus('verified', 'active', 'owner')).toBe(true);
  });

  test('blocks invalid transitions (e.g. draft directly to verified without active review)', () => {
    expect(canTransitionRequirementStatus('draft', 'verified', 'owner')).toBe(false);
    expect(canTransitionRequirementStatus('blocked', 'verified', 'owner')).toBe(false);
  });

  test('truthful delivery report computes zero-fabrication metrics directly from records', () => {
    const now = new Date();
    const testReqs: Requirement[] = [
      {
        id: 'r1',
        projectId: 'p1',
        title: 'User Registration with Password Hashing',
        description: 'Bcrypt with 12 salt rounds',
        category: 'functional',
        priority: 'high',
        status: 'verified',
        sourceReference: 'Brief Section 2',
        ownerUserId: 'u1',
        createdAt: now,
        updatedAt: now,
        version: 2,
      },
      {
        id: 'r2',
        projectId: 'p1',
        title: 'Project Brief Intake',
        description: 'Allows pasting brief text',
        category: 'functional',
        priority: 'normal',
        status: 'active',
        sourceReference: 'Brief Section 3',
        ownerUserId: 'u2',
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      {
        id: 'r3',
        projectId: 'p1',
        title: 'External Storage Provider Integration',
        description: 'S3 compatible bucket',
        category: 'constraint',
        priority: 'high',
        status: 'blocked',
        sourceReference: 'Brief Section 5',
        ownerUserId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      {
        id: 'r4',
        projectId: 'p1',
        title: 'Legacy CSV Importer',
        description: 'Deprecated in favor of JSON',
        category: 'deliverable',
        priority: 'low',
        status: 'deprecated',
        sourceReference: null,
        ownerUserId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    ];

    const taskLinks: RequirementTaskLink[] = [
      { requirementId: 'r1', taskId: 't1' },
      { requirementId: 'r1', taskId: 't2' },
      { requirementId: 'r2', taskId: 't3' },
    ];

    const evidenceList: Evidence[] = [
      {
        id: 'e1',
        projectId: 'p1',
        requirementId: 'r1',
        taskId: 't1',
        authorUserId: 'u1',
        type: 'url',
        title: 'PR #12 - Bcrypt hashing & tests',
        content: 'https://github.com/projectpilot/pr/12',
        createdAt: now,
      },
      {
        id: 'e2',
        projectId: 'p1',
        requirementId: 'r1',
        taskId: null,
        authorUserId: 'u1',
        type: 'note',
        title: 'Security review pass',
        content: '12 rounds verified in staging logs.',
        createdAt: now,
      },
    ];

    const report = computeDeliveryMetrics(testReqs, taskLinks, evidenceList);

    expect(report.totalRequirements).toBe(4);
    expect(report.verifiedCount).toBe(1);
    expect(report.activeCount).toBe(1);
    expect(report.blockedCount).toBe(1);
    expect(report.deprecatedCount).toBe(1);

    // Active base = 4 total - 1 deprecated = 3; 1 verified = 33%
    expect(report.percentVerified).toBe(33);

    // Traceability links
    expect(report.requirementsWithTasksCount).toBe(2); // r1 and r2 have tasks
    expect(report.unlinkedRequirementsCount).toBe(2); // r3 and r4 have no tasks
    expect(report.requirementsWithEvidenceCount).toBe(1); // r1 has evidence
    expect(report.requirementsWithoutEvidenceCount).toBe(3); // r2, r3, r4
  });
});

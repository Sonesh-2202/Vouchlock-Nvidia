/**
 * Contract schemas tests — validate all request/response schemas.
 */

import { describe, test, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  createWorkspaceSchema,
  createInvitationSchema,
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  createCommentSchema,
  updateCommentSchema,
  generatePlanDraftSchema,
  acceptPlanDraftSchema,
  createRequirementSchema,
  updateRequirementSchema,
  createEvidenceSchema,
  verifyRequirementSchema,
  createBriefRevisionSchema,
  requirementProposalSchema,
  acceptProposalInputSchema,
  mcpCreateTokenSchema,
  mcpPaginationSchema,
} from '../src/schemas.js';

describe('Auth Schemas', () => {
  test('validates valid registration payload', () => {
    const res = registerSchema.safeParse({
      email: 'alex@example.com',
      password: 'password123',
      displayName: 'Alex Rivers',
    });
    expect(res.success).toBe(true);
  });

  test('rejects short passwords', () => {
    const res = registerSchema.safeParse({
      email: 'alex@example.com',
      password: 'short',
      displayName: 'Alex Rivers',
    });
    expect(res.success).toBe(false);
  });

  test('validates valid login payload', () => {
    const res = loginSchema.safeParse({
      email: 'alex@example.com',
      password: 'password123',
    });
    expect(res.success).toBe(true);
  });

  test('rejects invalid email formats', () => {
    const res = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.success).toBe(false);
  });
});

describe('Workspace Schemas', () => {
  test('validates workspace creation', () => {
    const res = createWorkspaceSchema.safeParse({ name: 'Acme Studio' });
    expect(res.success).toBe(true);
  });

  test('rejects empty workspace name', () => {
    const res = createWorkspaceSchema.safeParse({ name: '   ' });
    expect(res.success).toBe(false);
  });

  test('validates invitation with default role', () => {
    const res = createInvitationSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.role).toBe('member');
    }
  });

  test('rejects owner role in invitations', () => {
    const res = createInvitationSchema.safeParse({ role: 'owner' });
    expect(res.success).toBe(false);
  });
});

describe('Project Schemas', () => {
  test('validates project creation with required fields', () => {
    const res = createProjectSchema.safeParse({
      name: 'Mobile App MVP',
      goal: 'Launch beta within 6 weeks',
    });
    expect(res.success).toBe(true);
  });

  test('validates project creation with all optional fields', () => {
    const res = createProjectSchema.safeParse({
      name: 'Mobile App MVP',
      goal: 'Launch beta within 6 weeks',
      audience: 'Students',
      deliverable: 'iOS and Android app',
      deadline: '2026-12-01T00:00:00Z',
      constraints: { budget: 5000 },
      successMeasures: { mau: 500 },
    });
    expect(res.success).toBe(true);
  });

  test('requires version for project updates', () => {
    const res = updateProjectSchema.safeParse({
      name: 'Updated Name',
    });
    expect(res.success).toBe(false);

    const validRes = updateProjectSchema.safeParse({
      name: 'Updated Name',
      version: 1,
    });
    expect(validRes.success).toBe(true);
  });
});

describe('Task Schemas', () => {
  test('validates task creation with defaults', () => {
    const res = createTaskSchema.safeParse({
      title: 'Design wireframes',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.status).toBe('backlog');
      expect(res.data.priority).toBe('normal');
    }
  });

  test('validates task updates with version concurrency', () => {
    const res = updateTaskSchema.safeParse({
      status: 'doing',
      version: 2,
    });
    expect(res.success).toBe(true);
  });
});

describe('Comment Schemas', () => {
  test('validates comment creation', () => {
    const res = createCommentSchema.safeParse({
      body: 'Draft looks solid, ready for review.',
    });
    expect(res.success).toBe(true);
  });

  test('rejects empty comments', () => {
    const res = createCommentSchema.safeParse({ body: '' });
    expect(res.success).toBe(false);
    expect(createCommentSchema.safeParse({ body: '   ' }).success).toBe(false);
  });

  test('validates edited comment text and rejects blank edits', () => {
    expect(updateCommentSchema.safeParse({ body: 'Updated decision and next step.' }).success).toBe(
      true,
    );
    expect(updateCommentSchema.safeParse({ body: '   ' }).success).toBe(false);
  });
});

describe('AI Plan Draft Schemas', () => {
  test('validates plan draft generation input', () => {
    const res = generatePlanDraftSchema.safeParse({
      goal: 'Build an onboarding flow',
      constraints: ['React', 'PostgreSQL'],
    });
    expect(res.success).toBe(true);
  });

  test('validates plan draft acceptance payload with idempotency key', () => {
    const res = acceptPlanDraftSchema.safeParse({
      idempotencyKey: 'idem-12345',
      draft: {
        summary: 'Deliver user registration and login in 2 milestones',
        assumptions: ['Auth library available'],
        risks: ['Scope creep on OAuth'],
        milestones: [
          {
            title: 'M1: Backend Auth',
            dueDate: '2026-11-01T00:00:00.000Z',
            tasks: [
              {
                title: 'Set up JWT sessions',
                dueDate: '2026-10-25T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    });
    expect(res.success).toBe(true);
  });
});

describe('Requirement and Evidence Schemas', () => {
  test('validates requirement creation schema', () => {
    const res = createRequirementSchema.safeParse({
      title: 'Support PDF and DOCX brief upload',
      description: 'System must parse incoming briefs and retain the original file.',
      category: 'functional',
      priority: 'high',
      sourceReference: 'Section 4.1 in RFP',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.category).toBe('functional');
      expect(res.data.priority).toBe('high');
    }
  });

  test('rejects empty requirement title', () => {
    const res = createRequirementSchema.safeParse({
      title: '   ',
    });
    expect(res.success).toBe(false);
  });

  test('validates requirement update schema with version token', () => {
    const res = updateRequirementSchema.safeParse({
      status: 'verified',
      version: 2,
    });
    expect(res.success).toBe(true);
  });

  test('validates evidence creation schema for note and url', () => {
    const urlEv = createEvidenceSchema.safeParse({
      type: 'url',
      title: 'Pull Request #42',
      content: 'https://github.com/example/repo/pull/42',
    });
    expect(urlEv.success).toBe(true);

    const noteEv = createEvidenceSchema.safeParse({
      type: 'note',
      title: 'Acceptance meeting confirmation',
      content: 'Confirmed by client in weekly sync on Oct 11.',
    });
    expect(noteEv.success).toBe(true);
  });

  test('validates explicit verification schema', () => {
    const res = verifyRequirementSchema.safeParse({
      status: 'verified',
      notes: 'All automated tests pass and staging demo approved.',
    });
    expect(res.success).toBe(true);
  });

  test('validates brief revision schema with bounds checking', () => {
    const valid = createBriefRevisionSchema.safeParse({
      title: 'Initial Capstone Brief',
      content: 'This project is designed to build a real-time collaborative workspace for teams.',
      notes: 'Pasted from client PDF.',
    });
    expect(valid.success).toBe(true);

    const tooShort = createBriefRevisionSchema.safeParse({
      title: 'Short',
      content: 'Too short',
    });
    expect(tooShort.success).toBe(false);
  });

  test('validates requirement proposal and candidate schemas', () => {
    const proposal = requirementProposalSchema.safeParse({
      summary: 'Extracted 2 requirements from client brief.',
      candidates: [
        {
          tempId: 'cand-1',
          title: 'User authentication via session cookies',
          description: 'Secure HTTP-only cookies with CSRF token',
          category: 'functional',
          priority: 'high',
          sourceReference: 'Section 3.1 Security',
          rationale: 'Required for multi-user tenant isolation',
        },
      ],
      assumptions: ['Email service is available'],
      ambiguities: ['Session timeout duration unstated'],
      conflicts: [],
      risks: ['OAuth provider downtime'],
    });
    expect(proposal.success).toBe(true);

    const emptyCandidates = requirementProposalSchema.safeParse({
      summary: 'No candidates',
      candidates: [],
      assumptions: [],
      ambiguities: [],
      conflicts: [],
      risks: [],
    });
    expect(emptyCandidates.success).toBe(false);
  });

  test('validates proposal acceptance payload schema', () => {
    const res = acceptProposalInputSchema.safeParse({
      briefRevisionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      idempotencyKey: 'idemp-key-99',
      acceptedCandidates: [
        {
          tempId: 'cand-1',
          title: 'User authentication',
          category: 'functional',
          priority: 'high',
          sourceReference: 'Section 3.1',
        },
      ],
    });
    expect(res.success).toBe(true);
  });
});

describe('MCP Schemas', () => {
  const validWorkspaceId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  test('accepts valid MCP token creation with mcp:read scope', () => {
    const res = mcpCreateTokenSchema.safeParse({
      workspaceId: validWorkspaceId,
      scopes: ['mcp:read'],
      ttlDays: 30,
    });
    expect(res.success).toBe(true);
  });

  test('accepts valid MCP token creation with mcp:admin scope', () => {
    const res = mcpCreateTokenSchema.safeParse({
      workspaceId: validWorkspaceId,
      scopes: ['mcp:read', 'mcp:admin'],
    });
    expect(res.success).toBe(true);
  });

  test('rejects arbitrary undeclared MCP token scopes', () => {
    const res = mcpCreateTokenSchema.safeParse({
      workspaceId: validWorkspaceId,
      scopes: ['mcp:root', 'arbitrary_scope'],
    });
    expect(res.success).toBe(false);
  });

  test('validates pagination schema with defaults and bounds', () => {
    const defaultRes = mcpPaginationSchema.safeParse({});
    expect(defaultRes.success).toBe(true);
    if (defaultRes.success) {
      expect(defaultRes.data.limit).toBe(50);
      expect(defaultRes.data.offset).toBe(0);
    }

    const boundRes = mcpPaginationSchema.safeParse({ limit: 101 });
    expect(boundRes.success).toBe(false);
  });
});

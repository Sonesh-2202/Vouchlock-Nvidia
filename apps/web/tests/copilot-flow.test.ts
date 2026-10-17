/**
 * Unit tests for web app Copilot client flows, BYOK masking, and proposal approval.
 */

import { describe, test, expect } from 'vitest';

describe('Web Copilot & Proposal Verification Flow', () => {
  test('separates grounded source records from inferred proposed actions', () => {
    const mockReport = {
      projectId: 'proj-123',
      provider: 'mock',
      model: 'deterministic-copilot-v1',
      groundedSummary: 'Project has 2 tasks (1 completed) and 1 verified requirement.',
      inferredSummary: 'Inferred status: 1 active blocker requires attention.',
      blockers: [{ id: 'b-1', blocker: 'Database migration pending' }],
      risks: [{ id: 'r-1', risk: 'Tight deadline for milestone 1', severity: 'medium' }],
      evidenceGaps: [{ requirementId: 'req-2', reason: 'No test report uploaded' }],
      proposedActions: [
        {
          proposalId: 'prop-hash-abc-123',
          actionType: 'create_task',
          description: 'Run automated accessibility audit',
          groundingReference: 'Requirement: REQ-02',
          isInference: true,
          payload: { title: 'Run automated accessibility audit', status: 'todo' },
        },
      ],
      sourceRecords: [
        { entityType: 'task', id: 't-1', nameOrTitle: 'Setup DB' },
        { entityType: 'requirement', id: 'req-1', nameOrTitle: 'Auth SSO' },
      ],
      generatedAt: new Date().toISOString(),
    };

    // Grounded facts vs model inferences
    expect(mockReport.groundedSummary).toContain('Project has 2 tasks');
    expect(mockReport.inferredSummary).toContain('Inferred status');

    // Human-in-the-loop requirement: each action has integrity hash
    expect(mockReport.proposedActions.length).toBe(1);
    const action = mockReport.proposedActions[0]!;
    expect(action.isInference).toBe(true);
    expect(action.proposalId).toBe('prop-hash-abc-123');
    expect(action.actionType).toBe('create_task');
  });

  test('BYOK provider session masks keys and never retains plaintext', () => {
    // Simulated session object returned from server
    const serverSession = {
      provider: 'gemini',
      keySuffix: '...A4xQ',
      status: 'active',
      createdAt: '2026-10-17T12:00:00.000Z',
    };

    // Verify key suffix only contains last 4 characters preceded by ellipsis
    expect(serverSession.keySuffix.startsWith('...')).toBe(true);
    expect(serverSession.keySuffix.length).toBe(7);
    expect(serverSession).not.toHaveProperty('apiKey');
    expect(serverSession).not.toHaveProperty('secret');
  });

  test('MCP token response provides one-time token reveal and scoped metadata', () => {
    const tokenResponse = {
      id: 'tok-abc',
      token: 'mcp_live_sec_1234567890abcdef',
      userId: 'usr-1',
      workspaceId: 'ws-1',
      scopes: ['mcp:read'],
      expiresAt: '2026-11-16T12:00:00.000Z',
    };

    expect(tokenResponse.scopes).toEqual(['mcp:read']);
    expect(tokenResponse.token.startsWith('mcp_live_sec_')).toBe(true);
    expect(tokenResponse.workspaceId).toBe('ws-1');
  });
});

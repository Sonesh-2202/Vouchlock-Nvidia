/**
 * Unit tests for Model Context Protocol (MCP) Server:
 * - Dedicated token store, cryptographic hashing & lifecycle
 * - Workspace isolation and multi-tenant security
 * - Read-only tool discovery and execution
 * - Prompt injection resilience and boundary enforcement
 * - Metric-only delivery reporting (no raw evidence leak)
 * - Resource limits and payload protection
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mcpTokenStore } from '../src/mcp/token-store.js';
import { mcpRateLimiter } from '../src/mcp/limits.js';
import { ephemeralSessionStore } from '../src/ai/planner.js';
import { createSessionToken } from '../src/auth.js';
import {
  MCP_TOOLS,
  validateProjectAccess,
  getProjectSummaryTool,
  listRequirementsTool,
  listTasksTool,
  getDeliveryReportTool,
} from '../src/mcp/tools.js';
import {
  MCP_LIMITS,
  type McpRequestContext,
  McpAuthError,
  McpForbiddenError,
  McpNotFoundError,
  McpLimitError,
  McpError,
} from '../src/mcp/types.js';

describe('MCP Token Store & Security', () => {
  beforeEach(() => {
    mcpTokenStore.clearAll();
  });

  const userId = 'user-mcp-1111';
  const workspaceId = 'workspace-mcp-aaaa';

  test('creates scoped token with mcp_ prefix and cryptographic hash', () => {
    const created = mcpTokenStore.createToken(userId, workspaceId, ['mcp:read'], 14);

    expect(created.token.startsWith('mcp_')).toBe(true);
    expect(created.id.startsWith('tok_')).toBe(true);
    expect(created.userId).toBe(userId);
    expect(created.workspaceId).toBe(workspaceId);
    expect(created.scopes).toEqual(['mcp:read']);
    expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('verifies valid active token', () => {
    const created = mcpTokenStore.createToken(userId, workspaceId, ['mcp:read', 'mcp:admin']);
    const verified = mcpTokenStore.verifyToken(created.token);

    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe(userId);
    expect(verified!.workspaceId).toBe(workspaceId);
    expect(verified!.scopes).toContain('mcp:read');
    expect(verified!.scopes).toContain('mcp:admin');
  });

  test('rejects tokens with invalid format or unknown hash', () => {
    expect(mcpTokenStore.verifyToken('invalid_token')).toBeNull();
    expect(mcpTokenStore.verifyToken('mcp_nonexistent_hash_abcdef123456')).toBeNull();
    expect(mcpTokenStore.verifyToken('')).toBeNull();
  });

  test('revoked token is rejected immediately', () => {
    const created = mcpTokenStore.createToken(userId, workspaceId);
    expect(mcpTokenStore.verifyToken(created.token)).not.toBeNull();

    const revoked = mcpTokenStore.revokeToken(created.token);
    expect(revoked).toBe(true);

    expect(mcpTokenStore.verifyToken(created.token)).toBeNull();
  });

  test('revoking unknown token returns false', () => {
    expect(mcpTokenStore.revokeToken('mcp_not_found')).toBe(false);
  });

  test('revokeAllForUser revokes all active tokens for that user', () => {
    const tok1 = mcpTokenStore.createToken(userId, workspaceId);
    const tok2 = mcpTokenStore.createToken(userId, workspaceId);
    const otherUserTok = mcpTokenStore.createToken('other-user-999', workspaceId);

    const revokedCount = mcpTokenStore.revokeAllForUser(userId);
    expect(revokedCount).toBe(2);

    expect(mcpTokenStore.verifyToken(tok1.token)).toBeNull();
    expect(mcpTokenStore.verifyToken(tok2.token)).toBeNull();
    // Other user token remains valid
    expect(mcpTokenStore.verifyToken(otherUserTok.token)).not.toBeNull();
  });

  test('rejects expired tokens', () => {
    // TTL of negative days
    const created = mcpTokenStore.createToken(userId, workspaceId, ['mcp:read'], -1);
    expect(mcpTokenStore.verifyToken(created.token)).toBeNull();
  });
});

describe('MCP Tool Discovery', () => {
  test('advertises 4 read-only tools with complete JSON schemas', () => {
    const toolNames = Object.keys(MCP_TOOLS);
    expect(toolNames).toHaveLength(4);
    expect(toolNames).toContain('get_project_summary');
    expect(toolNames).toContain('list_requirements');
    expect(toolNames).toContain('list_tasks');
    expect(toolNames).toContain('get_delivery_report');

    for (const [name, tool] of Object.entries(MCP_TOOLS)) {
      expect(tool.name).toBe(name);
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect((tool.inputSchema as any).required).toContain('projectId');
    }
  });
});

describe('MCP Workspace Isolation & Access Hardening', () => {
  const contextA: McpRequestContext = {
    userId: 'user-alice',
    workspaceId: 'workspace-alpha',
    scopes: ['mcp:read'],
  };

  test('rejects cross-workspace project access with 403 McpForbiddenError', async () => {
    // Mock DB returning a project that belongs to workspace-beta (NOT workspace-alpha)
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'proj-beta-1',
                  workspaceId: 'workspace-beta', // MISMATCH
                  name: 'Competitor Secret Project',
                },
              ]),
          }),
        }),
      }),
    } as any;

    await expect(validateProjectAccess(mockDb, contextA, 'proj-beta-1')).rejects.toThrow(
      McpForbiddenError,
    );
  });

  test('rejects non-existent project with 404 McpNotFoundError', async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    } as any;

    await expect(validateProjectAccess(mockDb, contextA, 'proj-ghost-999')).rejects.toThrow(
      McpNotFoundError,
    );
  });

  test('rejects if caller is not an active member in project workspace', async () => {
    let callIndex = 0;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              callIndex++;
              if (callIndex === 1) {
                // Project found and matches workspace
                return Promise.resolve([
                  {
                    id: 'proj-1',
                    workspaceId: 'workspace-alpha',
                    name: 'Alpha Project',
                  },
                ]);
              }
              // Member not found in workspace
              return Promise.resolve([]);
            },
          }),
        }),
      }),
    } as any;

    await expect(validateProjectAccess(mockDb, contextA, 'proj-1')).rejects.toThrow(
      McpForbiddenError,
    );
  });

  test('rejects malformed or empty projectId argument', async () => {
    const mockDb = {} as any;
    await expect(validateProjectAccess(mockDb, contextA, '')).rejects.toThrow(McpError);
    await expect(validateProjectAccess(mockDb, contextA, null as any)).rejects.toThrow(McpError);
  });
});

describe('MCP Tool Execution Logic', () => {
  const context: McpRequestContext = {
    userId: 'user-valid',
    workspaceId: 'workspace-alpha',
    scopes: ['mcp:read'],
  };

  function createMockProjectDb(
    opts: {
      project?: any;
      member?: any;
      milestonesCount?: number;
      tasksCount?: number;
      requirementsCount?: number;
      membersCount?: number;
      tasksList?: any[];
      requirementsList?: any[];
      evidenceCount?: number;
    } = {},
  ) {
    const project =
      opts.project !== undefined
        ? opts.project
        : {
            id: 'proj-1',
            workspaceId: 'workspace-alpha',
            name: 'Alpha Launch',
            goal: 'Launch mobile client',
            status: 'active',
            deadline: new Date('2026-11-01T00:00:00Z'),
          };
    const member = opts.member !== undefined ? opts.member : { role: 'owner' };
    const tasksList = opts.tasksList ?? [];
    const requirementsList = opts.requirementsList ?? [];
    const evidenceCount = opts.evidenceCount ?? 0;

    return {
      select: (fields: any) => ({
        from: (table: any) => {
          const handler: any = {
            where: (cond: any) => {
              const getData = (limitNum?: number) => {
                if (fields && typeof fields === 'object' && 'role' in fields) {
                  return member ? [member] : [];
                }
                if (
                  fields &&
                  typeof fields === 'object' &&
                  'title' in fields &&
                  'category' in fields
                ) {
                  return limitNum !== undefined
                    ? requirementsList.slice(0, limitNum)
                    : requirementsList;
                }
                if (fields && typeof fields === 'object' && 'status' in fields) {
                  const list = tasksList.length > 0 ? tasksList : requirementsList;
                  return limitNum !== undefined ? list.slice(0, limitNum) : list;
                }
                if (fields && typeof fields === 'object' && 'count' in fields) {
                  return [{ count: 3 }];
                }
                return project ? [project] : [];
              };
              const res: any = {
                limit: (n: number) => {
                  const p = Promise.resolve(getData(n));
                  (p as any).offset = () => Promise.resolve(getData(n));
                  return p;
                },
                then: (resolve: any, reject: any) => {
                  return Promise.resolve(getData()).then(resolve, reject);
                },
              };
              return res;
            },
            leftJoin: () => ({
              where: () => Promise.resolve(tasksList),
            }),
            innerJoin: () => ({
              where: () => Promise.resolve([{ count: evidenceCount }]),
            }),
          };
          return handler;
        },
      }),
    } as any;
  }

  test('get_project_summary aggregates metadata and metric counts', async () => {
    const mockDb = createMockProjectDb();

    const summary = await getProjectSummaryTool.handler(mockDb, context, {
      projectId: 'proj-1',
    });

    expect(summary.name).toBe('Alpha Launch');
    expect(summary.goal).toBe('Launch mobile client');
    expect(summary.status).toBe('active');
    expect(summary.deadline).toBe('2026-11-01T00:00:00.000Z');
    expect(summary.milestoneCount).toBe(3);
    expect(summary.taskCount).toBe(3);
    expect(summary.requirementCount).toBe(3);
  });

  test('get_delivery_report strictly provides metrics and never leaks raw evidence text', async () => {
    let callIdx = 0;
    const tasksList = [
      { status: 'done' },
      { status: 'done' },
      { status: 'blocked' },
      { status: 'doing' },
    ];
    const requirementsList = [{ status: 'verified' }, { status: 'verified' }, { status: 'active' }];

    const mockDb = {
      select: (fields: any) => ({
        from: (table: any) => ({
          where: () => {
            const res: any = {
              limit: () => {
                if (fields && typeof fields === 'object' && 'role' in fields) {
                  return Promise.resolve([{ role: 'owner' }]);
                }
                return Promise.resolve([
                  {
                    id: 'proj-delivery-1',
                    workspaceId: 'workspace-alpha',
                    name: 'Delivery Audit',
                  },
                ]);
              },
              then: (resolve: any, reject: any) => {
                callIdx++;
                if (callIdx === 1) {
                  return Promise.resolve(tasksList).then(resolve, reject);
                }
                if (callIdx === 2) {
                  return Promise.resolve(requirementsList).then(resolve, reject);
                }
                return Promise.resolve([]).then(resolve, reject);
              },
            };
            return res;
          },
          innerJoin: () => ({
            where: () => Promise.resolve([{ count: 5 }]),
          }),
        }),
      }),
    } as any;

    const res = await getDeliveryReportTool.handler(mockDb, context, {
      projectId: 'proj-delivery-1',
    });

    expect(res.projectId).toBe('proj-delivery-1');
    expect(res.projectName).toBe('Delivery Audit');
    expect(res.tasks.total).toBe(4);
    expect(res.tasks.completed).toBe(2);
    expect(res.tasks.blocked).toBe(1);
    expect(res.completionRate).toBe(50); // 2/4 = 50%
    expect(res.requirements.total).toBe(3);
    expect(res.requirements.verified).toBe(2);
    expect(res.requirements.unverified).toBe(1);
    expect(res.evidenceCount).toBe(5);

    // Absolutely no raw evidence text field allowed in delivery report
    expect((res as any).evidence).toBeUndefined();
    expect((res as any).rawEvidence).toBeUndefined();
  });

  test('list_requirements returns requirements with status and priority metadata', async () => {
    const requirementsList = [
      {
        id: 'req-1',
        title: 'OAuth2 Authentication',
        description: 'Support Google login',
        status: 'verified',
        priority: 'high',
        category: 'functional',
        sourceReference: 'Section 4.1',
      },
    ];

    const mockDb = createMockProjectDb({ requirementsList });

    const result = await listRequirementsTool.handler(mockDb, context, {
      projectId: 'proj-1',
    });

    expect(result.projectId).toBe('proj-1');
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]!.title).toBe('OAuth2 Authentication');
    expect(result.requirements[0]!.status).toBe('verified');
  });

  test('list_tasks returns tasks with metadata and assignee displayName', async () => {
    const tasksList = [
      {
        id: 'task-1',
        title: 'Deploy to Cloud',
        description: 'Configure production deployment',
        status: 'doing',
        priority: 'high',
        dueDate: new Date('2026-10-30T00:00:00Z'),
        milestoneId: 'ms-1',
        assigneeDisplayName: 'Alice Engineer',
      },
    ];

    const mockDb = createMockProjectDb({ tasksList });

    const result = await listTasksTool.handler(mockDb, context, {
      projectId: 'proj-1',
    });

    expect(result.projectId).toBe('proj-1');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('Deploy to Cloud');
    expect(result.tasks[0]!.assigneeDisplayName).toBe('Alice Engineer');
  });

  test('prompt injection attempt inside tool arguments is safely isolated', async () => {
    const maliciousArgs = {
      projectId: 'proj-1',
      status: "active'; DROP TABLE projects; --",
    };

    const mockDb = createMockProjectDb();
    const result = await listRequirementsTool.handler(mockDb, context, maliciousArgs as any);
    expect(result.projectId).toBe('proj-1');
    expect(Array.isArray(result.requirements)).toBe(true);
  });
});

describe('MCP HTTP Endpoints & Fastify Integration', () => {
  beforeEach(() => {
    mcpTokenStore.clearAll();
  });

  const dummyDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ role: 'member' }]),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  } as any;

  test('GET /mcp/v1/tools returns 401 without Bearer token', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: dummyDb });

    const res = await app.inject({
      method: 'GET',
      url: '/mcp/v1/tools',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
    await app.close();
  });

  test('GET /mcp/v1/tools returns 401 with invalid Bearer token', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: dummyDb });

    const res = await app.inject({
      method: 'GET',
      url: '/mcp/v1/tools',
      headers: { authorization: 'Bearer mcp_invalid_token_1234' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
    await app.close();
  });

  test('GET /mcp/v1/tools returns 200 with 4 tools when valid token provided', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: dummyDb });

    const tok = mcpTokenStore.createToken('user-1', 'ws-1', ['mcp:read']);
    const res = await app.inject({
      method: 'GET',
      url: '/mcp/v1/tools',
      headers: { authorization: `Bearer ${tok.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tools).toBeDefined();
    expect(body.tools).toHaveLength(4);
    const names = body.tools.map((t: any) => t.name);
    expect(names).toContain('get_project_summary');
    expect(names).toContain('list_requirements');
    expect(names).toContain('list_tasks');
    expect(names).toContain('get_delivery_report');
    await app.close();
  });

  test('POST /mcp/v1/call returns 404 for unknown tool', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: dummyDb });

    const tok = mcpTokenStore.createToken('user-1', 'ws-1', ['mcp:read']);
    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/call',
      headers: { authorization: `Bearer ${tok.token}` },
      payload: {
        name: 'non_existent_tool',
        arguments: {},
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('tool_not_found');
    await app.close();
  });

  test('POST /mcp/v1/call returns 400 for invalid payload', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: dummyDb });

    const tok = mcpTokenStore.createToken('user-1', 'ws-1', ['mcp:read']);
    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/call',
      headers: { authorization: `Bearer ${tok.token}` },
      payload: {
        // missing name
        arguments: {},
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  test('POST /mcp/v1/revoke revokes token and immediately invalidates it', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: dummyDb });

    const tok = mcpTokenStore.createToken('user-1', 'ws-1', ['mcp:read']);

    const revokeRes = await app.inject({
      method: 'POST',
      url: '/mcp/v1/revoke',
      headers: { authorization: `Bearer ${tok.token}` },
    });

    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().success).toBe(true);

    // Now verification must fail with 401
    const followUpRes = await app.inject({
      method: 'GET',
      url: '/mcp/v1/tools',
      headers: { authorization: `Bearer ${tok.token}` },
    });

    expect(followUpRes.statusCode).toBe(401);
    await app.close();
  });
});

describe('MCP Scope Escalation & Role Enforcement', () => {
  beforeEach(() => {
    mcpTokenStore.clearAll();
  });

  const memberDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ role: 'member' }]),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  } as any;

  const adminDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ role: 'admin' }]),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  } as any;

  test('ordinary member cannot request mcp:admin scope (returns 403)', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app, config } = await buildApp({ db: memberDb });
    const sessionToken = await createSessionToken('user-member', config.jwtSecret);

    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/tokens',
      cookies: { [config.sessionCookieName]: sessionToken },
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        scopes: ['mcp:read', 'mcp:admin'],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
    expect(res.json().error.message).toContain('Only workspace owners and admins');
    await app.close();
  });

  test('workspace admin or owner CAN request mcp:admin scope (returns 201)', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app, config } = await buildApp({ db: adminDb });
    const sessionToken = await createSessionToken('user-admin', config.jwtSecret);

    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/tokens',
      cookies: { [config.sessionCookieName]: sessionToken },
      payload: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        scopes: ['mcp:read', 'mcp:admin'],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().scopes).toContain('mcp:admin');
    await app.close();
  });
});

describe('MCP Cross-User Revocation Prevention', () => {
  beforeEach(() => {
    mcpTokenStore.clearAll();
  });

  test('user cannot revoke another users token (returns 403)', async () => {
    const { buildApp } = await import('../src/app.js');
    const dummyDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ role: 'member' }]),
          }),
        }),
      }),
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as any;

    const { app, config } = await buildApp({ db: dummyDb });

    // User A creates a token
    const tokenA = mcpTokenStore.createToken('user-a', 'ws-1', ['mcp:read']);

    // User B attempts to revoke User A's token
    const sessionTokenB = await createSessionToken('user-b', config.jwtSecret);
    const res = await app.inject({
      method: 'POST',
      url: '/mcp/v1/revoke',
      cookies: { [config.sessionCookieName]: sessionTokenB },
      payload: {
        tokenId: tokenA.id,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
    expect(res.json().error.message).toContain(
      'Cannot revoke MCP tokens belonging to another user',
    );

    // Token A is still valid
    expect(mcpTokenStore.verifyToken(tokenA.token)).not.toBeNull();
    await app.close();
  });
});

describe('MCP Token Persistence & Multi-Instance Synchronization', () => {
  test('persists tokens to disk and syncs across simulated instances', () => {
    mcpTokenStore.clearAll();
    const tok = mcpTokenStore.createToken('user-persist', 'ws-persist', ['mcp:read']);
    expect(mcpTokenStore.verifyToken(tok.token)).not.toBeNull();

    // Simulate process cold restart / separate instance reading from shared disk persistence
    mcpTokenStore.clearMemory();
    mcpTokenStore.syncFromStorage();
    const verified = mcpTokenStore.verifyToken(tok.token);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe('user-persist');
    expect(verified!.workspaceId).toBe('ws-persist');

    // Revocation in one instance persists to disk
    mcpTokenStore.revokeToken(tok.token, 'user-persist');
    mcpTokenStore.clearMemory();
    mcpTokenStore.syncFromStorage();
    expect(mcpTokenStore.verifyToken(tok.token)).toBeNull();
  });
});

describe('MCP Rate Limiting & Concurrency Enforcement', () => {
  beforeEach(() => {
    mcpRateLimiter.reset();
  });

  test('enforces max concurrent calls per token', () => {
    const key = 'test-token-key-1';
    // Max concurrent is 3
    mcpRateLimiter.acquire(key);
    mcpRateLimiter.acquire(key);
    mcpRateLimiter.acquire(key);
    expect(mcpRateLimiter.getConcurrentCalls(key)).toBe(3);

    // 4th concurrent call throws McpLimitError
    expect(() => mcpRateLimiter.acquire(key)).toThrow(McpLimitError);

    // Release 1 slot
    mcpRateLimiter.release(key);
    expect(mcpRateLimiter.getConcurrentCalls(key)).toBe(2);

    // Now acquiring succeeds again
    expect(() => mcpRateLimiter.acquire(key)).not.toThrow();
  });

  test('enforces max tool calls per session window', () => {
    const key = 'test-token-key-2';
    // Max calls is 20
    for (let i = 0; i < 20; i++) {
      mcpRateLimiter.acquire(key);
      mcpRateLimiter.release(key);
    }
    expect(mcpRateLimiter.getCallCount(key)).toBe(20);

    // 21st call in window throws McpLimitError
    expect(() => mcpRateLimiter.acquire(key)).toThrow(McpLimitError);
  });
});

describe('MCP Pagination & Request Cancellation', () => {
  const reqList = [
    { id: 'req-1', title: 'R1', status: 'verified', priority: 'high', category: 'f' },
    { id: 'req-2', title: 'R2', status: 'verified', priority: 'high', category: 'f' },
    { id: 'req-3', title: 'R3', status: 'verified', priority: 'high', category: 'f' },
  ];

  const dbMock = {
    select: (fields: any) => ({
      from: () => ({
        where: () => {
          const getData = (limitNum?: number) => {
            if (fields && typeof fields === 'object' && 'role' in fields)
              return [{ role: 'member' }];
            if (fields && typeof fields === 'object' && 'title' in fields) {
              return limitNum !== undefined ? reqList.slice(0, limitNum) : reqList;
            }
            return [{ id: 'proj-1', workspaceId: 'ws-1', name: 'P1' }];
          };
          const p = Promise.resolve(getData());
          (p as any).limit = (n: number) => {
            const lp = Promise.resolve(getData(n));
            (lp as any).offset = () => Promise.resolve(getData(n));
            return lp;
          };
          (p as any).offset = () => Promise.resolve(getData());
          return p;
        },
      }),
    }),
  } as any;

  const ctx: McpRequestContext = {
    userId: 'u1',
    workspaceId: 'ws-1',
    scopes: ['mcp:read'],
  };

  test('list_requirements returns pagination metadata and bounds result count', async () => {
    const res = await listRequirementsTool.handler(dbMock, ctx, {
      projectId: 'proj-1',
      limit: 2,
      offset: 0,
    });
    expect(res.requirements.length).toBe(2);
    expect(res.pagination).toBeDefined();
    expect(res.pagination.limit).toBe(2);
    expect(res.pagination.offset).toBe(0);
    expect(res.pagination.count).toBe(2);
  });

  test('aborted signal cancels tool execution immediately with 499', async () => {
    const ac = new AbortController();
    ac.abort();
    const cancelledCtx: McpRequestContext = { ...ctx, signal: ac.signal };

    await expect(
      listRequirementsTool.handler(dbMock, cancelledCtx, { projectId: 'proj-1' }),
    ).rejects.toThrow(McpError);
  });
});

describe('BYOK Ephemeral Key Lifecycle & Logout Cleanup', () => {
  beforeEach(() => {
    ephemeralSessionStore.clearAll();
  });

  test('ephemeral keys expire after TTL and are pruned', async () => {
    // 50ms TTL
    (ephemeralSessionStore as any).sessionTtlMs = 50;
    try {
      ephemeralSessionStore.setSession('user-ttl', 'openai', 'sk-ephemeral-1', 'ws-1');
      expect(ephemeralSessionStore.getSessionKey('user-ttl', 'openai', 'ws-1')).toBe(
        'sk-ephemeral-1',
      );

      // Wait 60ms for TTL to expire
      await new Promise((r) => setTimeout(r, 60));
      expect(ephemeralSessionStore.getSessionKey('user-ttl', 'openai', 'ws-1')).toBeUndefined();
    } finally {
      (ephemeralSessionStore as any).sessionTtlMs = 24 * 60 * 60 * 1000;
    }
  });

  test('isolated by user and workspace', () => {
    ephemeralSessionStore.setSession('user-1', 'openai', 'sk-key-u1', 'ws-1');
    expect(ephemeralSessionStore.getSessionKey('user-2', 'openai', 'ws-1')).toBeUndefined();
    expect(ephemeralSessionStore.getSessionKey('user-1', 'openai', 'ws-2')).toBeUndefined();
  });

  test('auth logout cleans up all ephemeral keys for the user', async () => {
    const { buildApp } = await import('../src/app.js');
    const dummyDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      insert: () => ({ values: () => Promise.resolve() }),
      delete: () => ({ where: () => Promise.resolve() }),
    } as any;

    const { app, config } = await buildApp({ db: dummyDb });
    const sessionToken = await createSessionToken('user-logout', config.jwtSecret);

    ephemeralSessionStore.setSession('user-logout', 'openai', 'sk-logout-key', 'ws-1');
    expect(ephemeralSessionStore.getSessionKey('user-logout', 'openai', 'ws-1')).toBe(
      'sk-logout-key',
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { [config.sessionCookieName]: sessionToken },
    });

    expect(res.statusCode).toBe(200);
    expect(ephemeralSessionStore.getSessionKey('user-logout', 'openai', 'ws-1')).toBeUndefined();
    await app.close();
  });
});

describe('Official MCP Client Interoperability', () => {
  const mcpMockDb = {
    select: (fields: any) => ({
      from: () => ({
        where: () => {
          const getData = (limitNum?: number) => {
            if (fields && typeof fields === 'object' && 'role' in fields)
              return [{ role: 'member' }];
            if (fields && typeof fields === 'object' && 'count' in fields) return [{ count: 2 }];
            if (fields && typeof fields === 'object' && 'title' in fields && 'category' in fields) {
              return [
                {
                  id: 'req-1',
                  title: 'OAuth Requirements',
                  status: 'verified',
                  priority: 'high',
                  category: 'functional',
                },
              ];
            }
            if (fields && typeof fields === 'object' && 'status' in fields) {
              return [{ id: 'task-1', title: 'Setup DB', status: 'done', priority: 'high' }];
            }
            return [
              {
                id: 'proj-1',
                workspaceId: 'ws-1',
                name: 'Alpha Launch',
                goal: 'Launch Alpha',
                status: 'active',
                deadline: new Date('2026-11-01T00:00:00.000Z'),
              },
            ];
          };
          const p = Promise.resolve(getData());
          (p as any).limit = (n: number) => {
            const lp = Promise.resolve(getData(n));
            (lp as any).offset = () => Promise.resolve(getData(n));
            return lp;
          };
          (p as any).offset = () => Promise.resolve(getData());
          return p;
        },
        leftJoin: () => ({
          where: () =>
            Promise.resolve([
              { id: 'task-1', title: 'Setup DB', status: 'done', priority: 'high' },
            ]),
        }),
        innerJoin: () => ({
          where: () => Promise.resolve([{ count: 2 }]),
        }),
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  } as any;

  test('official client connects, initializes, discovers tools, and calls each tool over Streamable HTTP', async () => {
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({ db: mcpMockDb });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const token = mcpTokenStore.createToken('user-mcp-e2e', 'ws-1', ['mcp:read']);

    try {
      const transport = new StreamableHTTPClientTransport(new URL('/mcp', address), {
        requestInit: {
          headers: {
            authorization: `Bearer ${token.token}`,
          },
        },
      });

      const client = new Client(
        { name: 'test-mcp-client', version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);

      const toolsResult = await client.listTools();
      expect(toolsResult.tools.length).toBe(4);
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain('get_project_summary');
      expect(toolNames).toContain('list_requirements');
      expect(toolNames).toContain('list_tasks');
      expect(toolNames).toContain('get_delivery_report');

      // Call tool 1: get_project_summary
      const summaryRes = await client.callTool({
        name: 'get_project_summary',
        arguments: { projectId: 'proj-1' },
      });
      expect(summaryRes.content).toBeDefined();
      expect((summaryRes.content as any)[0].text).toContain('Alpha Launch');

      // Call tool 2: list_requirements
      const reqRes = await client.callTool({
        name: 'list_requirements',
        arguments: { projectId: 'proj-1', limit: 5 },
      });
      expect(reqRes.content).toBeDefined();
      expect((reqRes.content as any)[0].text).toContain('OAuth Requirements');

      // Call tool 3: list_tasks
      const taskRes = await client.callTool({
        name: 'list_tasks',
        arguments: { projectId: 'proj-1', limit: 5 },
      });
      expect(taskRes.content).toBeDefined();
      expect((taskRes.content as any)[0].text).toContain('Setup DB');

      // Call tool 4: get_delivery_report
      const deliveryRes = await client.callTool({
        name: 'get_delivery_report',
        arguments: { projectId: 'proj-1' },
      });
      expect(deliveryRes.content).toBeDefined();
      expect((deliveryRes.content as any)[0].text).toContain('Alpha Launch');
      expect((deliveryRes.content as any)[0].text).not.toContain('rawEvidence');

      await client.close();
    } finally {
      await app.close();
    }
  });
});

describe('Copilot Approval-Before-Write Enforcement', () => {
  test('rejects unverified proposal content hash on approval (returns 400)', async () => {
    const { buildApp } = await import('../src/app.js');
    const dummyDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: '22222222-2222-4222-8222-222222222222',
                  workspaceId: '11111111-1111-4111-8111-111111111111',
                  status: 'active',
                  role: 'admin',
                },
              ]),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([{ id: 'new-task-1' }]),
        }),
      }),
    } as any;

    const { app, config } = await buildApp({ db: dummyDb });
    const sessionToken = await createSessionToken('user-approver', config.jwtSecret);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/copilot/approve',
      cookies: { [config.sessionCookieName]: sessionToken },
      payload: {
        projectId: '22222222-2222-4222-8222-222222222222',
        proposalId: 'tampered-proposal-id-00000000000',
        action: {
          proposalId: 'tampered-proposal-id-00000000000',
          actionType: 'create_task',
          description: 'Malicious task creation',
          isInference: true,
          groundingReference: 'req-1',
          payload: { title: 'Malicious task' },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_proposal_id');
    await app.close();
  });
});

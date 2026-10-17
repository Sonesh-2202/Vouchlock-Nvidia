/**
 * AI Groundedness, Assistive Rules, and Provider Failure Recovery Tests
 * Validates deterministic domain behavior, zero hallucinated facts, traceable provenance,
 * manual operations without AI credentials, and strict server-side provider security.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarness, type TestHarness } from './test-db.js';
import {
  extractRequirementsProposal,
  OpenAiProvider,
  AiProviderAuthError,
  AiProviderValidationError,
  getAiProvider,
} from '../src/ai/planner.js';
import type { AppConfig } from '../src/config.js';

describe('AI Groundedness, Error Recovery & Assistive Guardrails', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.resetDatabase();
  });

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('proves manual planning and verification work completely with AI disabled', async () => {
    // 1. Register and setup project manually
    const regRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'manual@projectpilot.local',
        password: 'Password123!',
        displayName: 'Manual Planner',
      },
    });
    const cookie = regRes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headers = { cookie: `pp_session=${cookie}` };

    const wsRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'Manual Workspace' },
    });
    const workspaceId = wsRes.json().workspace.id;

    const projRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${workspaceId}/projects`,
      headers,
      payload: {
        name: 'Manual Flight Control',
        goal: 'Completely deterministic workflow without any external AI calls',
      },
    });
    const projectId = projRes.json().project.id;

    // 2. Create manual requirement
    const reqRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/requirements`,
      headers,
      payload: {
        title: 'Deterministic State Engine',
        description: 'Hardened transitions with explicit human sign-off',
        category: 'functional',
        priority: 'high',
        sourceReference: 'Manual System Spec v1.0',
      },
    });
    expect(reqRes.statusCode).toBe(201);
    const reqId = reqRes.json().requirement.id;

    // 3. Move requirement to active
    const patchRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/requirements/${reqId}`,
      headers,
      payload: { version: 1, status: 'active' },
    });
    expect(patchRes.statusCode).toBe(200);

    // 4. Create and link task
    const taskRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/projects/${projectId}/tasks`,
      headers,
      payload: {
        title: 'Run test harness',
        priority: 'normal',
      },
    });
    const taskId = taskRes.json().task.id;

    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqId}/tasks`,
      headers,
      payload: { taskId },
    });

    // 5. Attach evidence
    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqId}/evidence`,
      headers,
      payload: {
        type: 'note',
        title: 'Offline Manual Proof',
        content: 'Verified 100% without external API provider dependency.',
      },
    });

    // 6. Authorize verification
    const verifyRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqId}/verify`,
      headers,
      payload: {
        status: 'verified',
        notes: 'Signed off by owner.',
      },
    });
    expect(verifyRes.statusCode).toBe(200);

    // 7. Report calculation
    const reportRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/delivery-report`,
      headers,
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json();
    expect(report.metrics.totalRequirements).toBe(1);
    expect(report.metrics.percentVerified).toBe(100);
  });

  it('separates facts, assumptions, and risks without inventing owners or dates', async () => {
    const studentBrief = `
Course Capstone: Autonomous Waste Sorting Robot
Goal: Construct an embedded vision system capable of identifying recyclable containers.
Deliverable: Working prototype and evaluation report.
Constraints:
- Must run inference on Raspberry Pi 5 under 15W power.
- Model latency must be under 200ms per frame.
Notes:
- Budget is constrained to $300 total grant money.
- Team members: Maya Lin (Vision Lead), Carlos Ruiz (Hardware Lead).
- Final demo is scheduled for December 15.
`;

    const result = await extractRequirementsProposal({ briefText: studentBrief }, 'mock');

    // 1. Proposals contain structured candidates
    expect(result.proposal.candidates.length).toBeGreaterThan(0);

    // 2. Traceability: candidate sourceReference points to source section
    for (const cand of result.proposal.candidates) {
      expect(cand.sourceReference).toBeDefined();
      expect(typeof cand.sourceReference).toBe('string');
      // No invented owners: mock candidates do not assign arbitrary strangers
      expect(cand.ownerUserId).toBeUndefined();
    }

    // 3. Assumptions and risks are separated into dedicated audit arrays
    expect(result.proposal.assumptions.length).toBeGreaterThan(0);
    expect(result.proposal.risks.length).toBeGreaterThan(0);
    expect(Array.isArray(result.proposal.assumptions)).toBe(true);
    expect(Array.isArray(result.proposal.risks)).toBe(true);
  });

  it('refuses to fabricate success or silently switch to mock when OpenAI is requested without credentials', async () => {
    // Attempting to resolve provider with openai and empty key must fail
    expect(() =>
      getAiProvider({
        aiProvider: 'openai',
        aiApiKey: '',
        aiModel: 'gpt-4o',
      } as unknown as AppConfig),
    ).toThrow(AiProviderAuthError);

    // Creating an app configured with missing OpenAI key
    const customHarnessApp = await (
      await import('../src/app.js')
    ).buildApp({
      config: {
        aiProvider: 'openai',
        aiApiKey: '',
        logLevel: 'silent',
      },
      db: harness.db,
    });

    // Register user on that app
    const regRes = await customHarnessApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'openaifail@test.local',
        password: 'Password123!',
        displayName: 'OpenAI Tester',
      },
    });
    const cookie = regRes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headers = { cookie: `pp_session=${cookie}` };

    const wsRes = await customHarnessApp.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'AI Fail Workspace' },
    });
    const workspaceId = wsRes.json().workspace.id;

    const projRes = await customHarnessApp.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${workspaceId}/projects`,
      headers,
      payload: { name: 'AI Fail Project', goal: 'Test missing credentials' },
    });
    const projectId = projRes.json().project.id;

    const briefRes = await customHarnessApp.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/briefs`,
      headers,
      payload: { title: 'Test Brief', content: 'Sample brief text' },
    });
    const briefRevisionId = briefRes.json().revision.id;

    // Proposal extraction MUST return 401 ai_auth_error, NEVER 200 with fake mock output
    const extractRes = await customHarnessApp.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/proposals/extract`,
      headers,
      payload: { briefRevisionId },
    });
    expect(extractRes.statusCode).toBe(401);
    expect(extractRes.json().error.code).toBe('ai_auth_error');
    expect(extractRes.json().error.message).toContain('AI_API_KEY is missing');

    await customHarnessApp.app.close();
  });

  it('validates provider schema and redacts secrets from error messages', async () => {
    // Malformed JSON response from OpenAI
    const fakeFetchMalformed: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"this_is_not_valid_schema": true}',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const malformedProvider = new OpenAiProvider({
      apiKey: 'sk-super-secret-key-12345',
      fetchTransport: fakeFetchMalformed,
    });

    await expect(
      malformedProvider.generatePlan({
        goal: 'Test malformed output',
        memberNames: ['Test'],
      }),
    ).rejects.toThrow(AiProviderValidationError);

    // Redaction of API key from error outputs
    const secretKey = 'sk-live-secret-never-expose-in-logs';
    const fakeFetchError: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          error: { message: `Invalid authentication header with ${secretKey}` },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const errorProvider = new OpenAiProvider({
      apiKey: secretKey,
      fetchTransport: fakeFetchError,
    });

    try {
      await errorProvider.generatePlan({
        goal: 'Secret test',
        memberNames: ['Test'],
      });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const errObj = err as Error;
      expect(errObj.message).not.toContain(secretKey);
      expect(errObj.message).toContain('[REDACTED_SECRET]');
    }
  });
});

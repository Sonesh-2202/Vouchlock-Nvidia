/**
 * Unit tests for AI planner service, OpenAI provider adapter, and domain validation integration.
 */

import { describe, test, expect } from 'vitest';
import {
  generatePlan,
  extractRequirementsProposal,
  computeInputHash,
  computeBriefHash,
  getAiProvider,
  OpenAiProvider,
  AiProviderAuthError,
  AiProviderError,
  AiProviderRateLimitError,
  AiProviderValidationError,
} from '../src/ai/planner.js';
import type { AppConfig } from '../src/config.js';

describe('AI Planner Service & Providers', () => {
  const baseInput = {
    goal: 'Build an onboarding flow for student teams',
    audience: 'University students and faculty advisors',
    deliverable: 'Web SPA with registration and invite system',
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days ahead
    memberNames: ['Alex Rivers', 'Sam Chen'],
  };

  test('computes deterministic input and brief hashes', () => {
    const hash1 = computeInputHash(baseInput);
    const hash2 = computeInputHash(baseInput);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex

    const bHash1 = computeBriefHash('My brief text');
    const bHash2 = computeBriefHash('My brief text');
    expect(bHash1).toBe(bHash2);
    expect(bHash1.length).toBe(64);
  });

  test('generates valid plan with mock provider', async () => {
    const result = await generatePlan(baseInput, 'mock');

    expect(result.provider).toBe('mock');
    expect(result.validationErrors).toEqual([]);
    expect(result.draft.milestones.length).toBe(3);
    expect(result.draft.summary).toContain('Build an onboarding flow');

    for (const milestone of result.draft.milestones) {
      expect(milestone.tasks.length).toBeGreaterThan(0);
      expect(milestone.dueDate).toBeDefined();

      for (const task of milestone.tasks) {
        if (task.ownerSuggestion) {
          expect(baseInput.memberNames).toContain(task.ownerSuggestion);
        }
        if (task.dueDate) {
          expect(new Date(task.dueDate).getTime()).toBeLessThanOrEqual(
            baseInput.deadline.getTime() + 1000,
          );
        }
      }
    }
  });

  test('extracts requirement proposal with mock provider without inventing owners or dates', async () => {
    const briefText =
      'Build a project delivery ledger with explicit human verification and evidence attachments for student capstones.';
    const result = await extractRequirementsProposal({ briefText }, 'mock');

    expect(result.provider).toBe('mock');
    expect(result.proposal.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.proposal.candidates[0]!.sourceReference).toBeDefined();
    expect(result.proposal.assumptions.length).toBeGreaterThan(0);
    expect(result.proposal.risks.length).toBeGreaterThan(0);
  });

  test('refuses to silently fall back to mock when OpenAI is requested without credentials', () => {
    expect(() =>
      getAiProvider({
        aiProvider: 'openai',
        aiApiKey: '',
        aiModel: 'gpt-4o',
      } as unknown as AppConfig),
    ).toThrow(AiProviderAuthError);

    expect(() =>
      getAiProvider({
        aiProvider: 'anthropic',
        aiApiKey: 'dummy',
        aiModel: 'claude-3-5-sonnet',
      } as unknown as AppConfig),
    ).toThrow(AiProviderError);
  });

  test('OpenAiProvider generates structured plan when transport returns valid schema', async () => {
    const mockPlanResponse = {
      summary: 'Verified OpenAI draft plan',
      assumptions: ['Environment is prepared'],
      risks: ['Timeline delays'],
      milestones: [
        {
          title: 'Phase 1: Foundation',
          description: 'Technical baseline',
          dueDate: baseInput.deadline.toISOString(),
          tasks: [
            {
              title: 'Init repository',
              description: 'Initial commit',
              ownerSuggestion: 'Alex Rivers',
              dueDate: baseInput.deadline.toISOString(),
              dependencyTitles: [],
            },
          ],
        },
      ],
    };

    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(mockPlanResponse) } }],
          usage: { prompt_tokens: 150, completion_tokens: 300, total_tokens: 450 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const provider = new OpenAiProvider({
      apiKey: 'sk-test-mock-key',
      fetchTransport: fakeFetch,
    });

    const result = await provider.generatePlan(baseInput);
    expect(result.provider).toBe('openai');
    expect(result.data.summary).toBe('Verified OpenAI draft plan');
    expect(result.usage?.totalTokens).toBe(450);
  });

  test('OpenAiProvider extracts requirements proposal and validates candidates', async () => {
    const mockProposalResponse = {
      summary: 'Extracted proposal from OpenAI',
      candidates: [
        {
          tempId: 'c1',
          title: 'Explicit verification engine',
          description: 'Stamp-based human signoff',
          category: 'functional',
          priority: 'high',
          sourceReference: 'Section 4.1 Verification',
          rationale: 'Core integrity requirement',
        },
      ],
      assumptions: ['Client available weekly'],
      ambiguities: ['Performance SLAs unstated'],
      conflicts: [],
      risks: ['Storage quota exhaustion'],
    };

    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(mockProposalResponse) } }],
          usage: { prompt_tokens: 110, completion_tokens: 220, total_tokens: 330 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const provider = new OpenAiProvider({
      apiKey: 'sk-test-mock-key',
      fetchTransport: fakeFetch,
    });

    const result = await provider.extractRequirements({
      briefText: 'Section 4.1 Verification: require human stamp.',
    });
    expect(result.provider).toBe('openai');
    expect(result.data.candidates.length).toBe(1);
    expect(result.data.candidates[0]!.title).toBe('Explicit verification engine');
    expect(result.usage?.totalTokens).toBe(330);
  });

  test('OpenAiProvider handles 401 unauthorized with redacted secret', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { message: 'Incorrect API key provided: sk-secret-123456789' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );

    const provider = new OpenAiProvider({
      apiKey: 'sk-secret-123456789',
      fetchTransport: fakeFetch,
    });

    await expect(provider.generatePlan(baseInput)).rejects.toThrow(AiProviderAuthError);
    try {
      await provider.generatePlan(baseInput);
    } catch (err: unknown) {
      const errObj = err as Error;
      expect(errObj.message).not.toContain('sk-secret-123456789');
      expect(errObj.message).toContain('[REDACTED_SECRET]');
    }
  });

  test('OpenAiProvider retries bounded on 429 rate limit then throws if exhausted', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new OpenAiProvider({
      apiKey: 'sk-test-key',
      maxRetries: 1, // 1 retry = 2 total attempts
      fetchTransport: fakeFetch,
    });

    await expect(provider.generatePlan(baseInput)).rejects.toThrow(AiProviderRateLimitError);
    expect(callCount).toBe(2);
  });

  test('OpenAiProvider rejects malformed or invalid schema JSON safely', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary": "incomplete json' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const provider = new OpenAiProvider({
      apiKey: 'sk-test-key',
      fetchTransport: fakeFetch,
    });

    await expect(provider.generatePlan(baseInput)).rejects.toThrow(AiProviderValidationError);
  });
});

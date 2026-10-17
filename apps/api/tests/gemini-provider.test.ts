import { describe, expect, test, vi } from 'vitest';
import { GeminiProvider, verifyGeminiApiKey } from '../src/ai/gemini-provider.js';
import { AiProviderAuthError } from '../src/ai/types.js';

const planInput = {
  goal: 'Prepare a small launch plan',
  memberNames: [],
};

const validPlan = {
  summary: 'A grounded launch plan',
  assumptions: [],
  risks: [],
  milestones: [
    {
      title: 'Prepare',
      description: 'Prepare the release',
      dueDate: null,
      tasks: [
        {
          title: 'Review the launch checklist',
          description: 'Confirm release requirements',
          ownerSuggestion: null,
          dueDate: null,
          dependencyTitles: [],
        },
      ],
    },
  ],
};

describe('Google Gemini BYOK adapter', () => {
  test('checks the key against Google without putting the key in the URL', async () => {
    const fetchTransport = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    await verifyGeminiApiKey('test-gemini-key', 'gemini-3.8-flash', fetchTransport);

    const [url, init] = fetchTransport.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash',
    );
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-gemini-key');
    expect(String(url)).not.toContain('test-gemini-key');
  });

  test('rejects invalid API keys with a safe provider error', async () => {
    const fetchTransport: typeof fetch = async () => new Response('{}', { status: 403 });
    await expect(verifyGeminiApiKey('test-gemini-key', undefined, fetchTransport)).rejects.toThrow(
      AiProviderAuthError,
    );
  });

  test('returns validated structured plan output through the Gemini compatible endpoint', async () => {
    let observedUrl = '';
    let observedKey = '';
    const fetchTransport: typeof fetch = async (input, init) => {
      observedUrl = String(input);
      observedKey = new Headers(init?.headers).get('Authorization') || '';
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validPlan) } }],
          usage: { prompt_tokens: 4, completion_tokens: 8, total_tokens: 12 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await new GeminiProvider({
      apiKey: 'test-gemini-key',
      fetchTransport,
    }).generatePlan(planInput);
    expect(observedUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(observedKey).toBe('Bearer test-gemini-key');
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-3.8-flash');
    expect(result.data.summary).toBe('A grounded launch plan');
  });

  test('falls back to alternate Gemini model when primary model returns 503 overloaded', async () => {
    const modelsRequested: string[] = [];
    const fetchTransport: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      modelsRequested.push(body.model);
      if (body.model === 'gemini-3.8-flash') {
        return new Response(
          JSON.stringify({
            error: { code: 503, message: 'The model is overloaded. Please try again later.' },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validPlan) } }],
          usage: { prompt_tokens: 4, completion_tokens: 8, total_tokens: 12 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key',
      maxRetries: 0,
      fetchTransport,
    });
    const result = await provider.generatePlan(planInput);
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(modelsRequested).toContain('gemini-3.8-flash');
    expect(modelsRequested).toContain('gemini-2.5-flash');
  });

  test('throws retryable ai_server_error when all Gemini models return 503', async () => {
    const fetchTransport: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 503, message: 'The model is overloaded.' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });

    const provider = new GeminiProvider({
      apiKey: 'test-gemini-key',
      maxRetries: 0,
      fallbackModels: ['gemini-2.5-flash'],
      fetchTransport,
    });
    await expect(provider.generatePlan(planInput)).rejects.toThrow(
      /Google Gemini server error \(503\)/,
    );
  });
});

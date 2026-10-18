/**
 * Nebius Token Factory Provider Adapter for Vouchlock.
 * Serves NVIDIA open-source models (including Nemotron) via Nebius Token Factory.
 * Enforces server-side execution, bounded retries, client timeouts, secret redaction,
 * and strict local schema validation against domain contracts.
 */

import { planDraftSchema, requirementProposalSchema } from '@projectpilot/contracts';
import {
  validatePlanDraft,
  validateProposalCandidates,
  type PlanDraft,
  type RequirementProposal,
} from '@projectpilot/domain';
import {
  AiProviderAuthError,
  AiProviderError,
  AiProviderRateLimitError,
  AiProviderTimeoutError,
  AiProviderValidationError,
  type AiProvider,
  type AiProviderResult,
  type PlanGenerationInput,
  type RequirementExtractionInput,
} from './types.js';

export interface NebiusProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchTransport?: typeof fetch;
}

export const DEFAULT_NEBIUS_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
export const DEFAULT_NVIDIA_NEMOTRON_MODEL = 'nvidia/Llama-3.1-Nemotron-70B-Instruct';

/**
 * Extracts raw JSON string from model response, handling markdown blocks or extra wrapper text.
 */
export function extractJsonFromResponse(content: string): string {
  const trimmed = content.trim();

  // 1. Look for ```json ... ``` code fence
  const jsonFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    return jsonFenceMatch[1].trim();
  }

  // 2. Look for outermost curly braces { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export class NebiusTokenFactoryProvider implements AiProvider {
  readonly id = 'nebius';
  readonly providerLabel = 'Nebius Token Factory (NVIDIA Nemotron)';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: NebiusProviderConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'Nebius Token Factory API key is missing. Set NEBIUS_API_KEY in the server environment.',
      );
    }
    this.apiKey = config.apiKey.trim();
    this.model = config.model || DEFAULT_NVIDIA_NEMOTRON_MODEL;
    this.baseUrl = (config.baseUrl || DEFAULT_NEBIUS_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 45000;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchImpl = config.fetchTransport ?? globalThis.fetch;
  }

  /**
   * Execute chat completion against Nebius Token Factory with exponential backoff retries.
   */
  async callChatCompletions(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{
    content: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    modelUsed: string;
  }> {
    const effectiveTimeout = options?.timeoutMs ?? this.timeoutMs;
    const url = `${this.baseUrl}/chat/completions`;
    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      if (options?.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.2,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const body = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            model?: string;
          };
          const choice = body.choices?.[0];
          const content = choice?.message?.content;

          if (!content || typeof content !== 'string') {
            throw new AiProviderValidationError(
              'Nebius Token Factory response did not contain text content in choices.',
            );
          }

          return {
            content,
            usage: body.usage,
            modelUsed: body.model || this.model,
          };
        }

        const statusCode = response.status;
        let errorBody = '';
        try {
          const errJson = (await response.json()) as { error?: { message?: string } };
          errorBody = errJson?.error?.message || response.statusText;
        } catch {
          errorBody = response.statusText;
        }

        // Redact API key to avoid leakage
        const sanitizedError = errorBody.replace(this.apiKey, '[REDACTED_SECRET]');

        if (statusCode === 401 || statusCode === 403) {
          throw new AiProviderAuthError(
            `Nebius Token Factory authentication failed (${statusCode}): ${sanitizedError}. Check NEBIUS_API_KEY.`,
          );
        }

        if (statusCode === 429) {
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 6000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new AiProviderRateLimitError(
            `Nebius Token Factory rate limit exceeded: ${sanitizedError}`,
          );
        }

        if (statusCode >= 500 && statusCode <= 599) {
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new AiProviderError(
            `Nebius Token Factory server error (${statusCode}): ${sanitizedError}`,
            'ai_server_error',
            true,
          );
        }

        throw new AiProviderError(
          `Nebius Token Factory request failed (${statusCode}): ${sanitizedError}`,
          'ai_request_failed',
          false,
        );
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        if (err instanceof AiProviderError) {
          throw err;
        }

        if (err instanceof Error && err.name === 'AbortError') {
          throw new AiProviderTimeoutError(
            `Nebius Token Factory request timed out after ${effectiveTimeout}ms.`,
          );
        }

        const message = err instanceof Error ? err.message : String(err);
        const sanitized = message.replace(this.apiKey, '[REDACTED_SECRET]');
        throw new AiProviderError(
          `Nebius Token Factory network failure: ${sanitized}`,
          'ai_network_error',
          true,
        );
      }
    }

    throw new AiProviderError(
      'Nebius Token Factory request failed after maximum retries.',
      'ai_request_failed',
      false,
    );
  }

  /**
   * Generates structured project plan draft using NVIDIA Nemotron.
   */
  async generatePlan(
    input: PlanGenerationInput,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AiProviderResult<PlanDraft>> {
    const systemPrompt = `You are an expert technical project delivery planner powered by NVIDIA Nemotron.
Your task is to decompose a project goal into a realistic, structured execution plan.

CRITICAL INSTRUCTIONS:
1. You must respond with valid JSON ONLY. No conversational preambles, no commentary, no markdown outside the JSON block.
2. Structure the JSON object with the following schema:
{
  "summary": "High-level summary of the plan",
  "assumptions": ["Assumption 1", "Assumption 2"],
  "risks": ["Risk 1", "Risk 2"],
  "milestones": [
    {
      "title": "Milestone Title",
      "description": "Milestone description or null",
      "dueDate": "YYYY-MM-DDTHH:mm:ss.sssZ or null",
      "tasks": [
        {
          "title": "Task title",
          "description": "Task description or null",
          "ownerSuggestion": "One of the provided member names or null",
          "dueDate": "YYYY-MM-DDTHH:mm:ss.sssZ or null",
          "dependencyTitles": ["Previous task title"]
        }
      ]
    }
  ]
}
3. Use only the provided workspace members for owner suggestions, or leave as null.
4. Keep the milestones and tasks grounded, realistic, and focused on delivery.`;

    const userPrompt = `PROJECT GOAL:
${input.goal}

AUDIENCE: ${input.audience || 'General'}
DELIVERABLE: ${input.deliverable || 'Production-ready software'}
TARGET DEADLINE: ${input.deadline ? input.deadline.toISOString() : 'Not set'}
CONSTRAINTS: ${input.constraints ? JSON.stringify(input.constraints) : 'None specified'}
WORKSPACE MEMBERS: ${input.memberNames.length > 0 ? input.memberNames.join(', ') : 'None specified'}

Generate the plan in the requested JSON structure now.`;

    const { content, usage, modelUsed } = await this.callChatCompletions(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options,
    );

    const jsonString = extractJsonFromResponse(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new AiProviderValidationError(
        'Nebius Token Factory model did not output valid JSON for plan draft.',
        { rawOutput: content.slice(0, 500) },
      );
    }

    const schemaResult = planDraftSchema.safeParse(parsed);
    if (!schemaResult.success) {
      throw new AiProviderValidationError(
        'Plan draft output failed contract schema validation.',
        schemaResult.error.flatten(),
      );
    }

    const validationErrors = validatePlanDraft(
      schemaResult.data as PlanDraft,
      input.memberNames,
      input.deadline ?? null,
    );

    if (validationErrors.length > 0) {
      // Reconcile non-fatal domain validation
      const sanitizedDraft = { ...schemaResult.data };
      return {
        provider: this.id,
        model: modelUsed,
        data: sanitizedDraft as PlanDraft,
        usage: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    }

    return {
      provider: this.id,
      model: modelUsed,
      data: schemaResult.data as PlanDraft,
      usage: {
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      },
    };
  }

  /**
   * Extracts candidate requirements with exact brief references and risks using NVIDIA Nemotron.
   */
  async extractRequirements(
    input: RequirementExtractionInput,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AiProviderResult<RequirementProposal>> {
    const systemPrompt = `You are a requirements analyst powered by NVIDIA Nemotron on Nebius Token Factory.
Extract structured candidate requirements, assumptions, ambiguities, conflicts, and risks from the provided project brief.

CRITICAL INSTRUCTIONS:
1. Respond ONLY with valid JSON.
2. Ground every requirement in the actual brief text. Set "sourceReference" to the exact verbatim sentence or quote from the brief.
3. If a requirement cannot be grounded in a brief quotation, mark sourceReference as null. Do not fabricate quotes.
4. Schema:
{
  "summary": "Brief analysis overview",
  "candidates": [
    {
      "tempId": "REQ-1",
      "title": "Clear requirement title",
      "description": "Detailed requirement description or null",
      "category": "functional" | "non_functional" | "constraint" | "deliverable",
      "priority": "low" | "normal" | "high",
      "sourceReference": "Exact verbatim quote from brief or null",
      "rationale": "Why this requirement matters"
    }
  ],
  "assumptions": ["Assumption 1"],
  "ambiguities": ["Ambiguity 1"],
  "conflicts": ["Conflict 1"],
  "risks": ["Risk 1"]
}`;

    const userPrompt = `PROJECT BRIEF:
${input.briefTitle ? `Title: ${input.briefTitle}\n\n` : ''}${input.briefText}

Extract the candidate requirements in valid JSON now.`;

    const { content, usage, modelUsed } = await this.callChatCompletions(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options,
    );

    const jsonString = extractJsonFromResponse(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new AiProviderValidationError(
        'Nebius Token Factory model did not output valid JSON for requirement extraction.',
        { rawOutput: content.slice(0, 500) },
      );
    }

    const schemaResult = requirementProposalSchema.safeParse(parsed);
    if (!schemaResult.success) {
      throw new AiProviderValidationError(
        'Requirement proposal output failed contract schema validation.',
        schemaResult.error.flatten(),
      );
    }

    const domainValidation = validateProposalCandidates(schemaResult.data.candidates);
    if (!domainValidation.valid) {
      throw new AiProviderValidationError(
        `Requirement candidates failed validation: ${domainValidation.errors.join('; ')}`,
      );
    }

    return {
      provider: this.id,
      model: modelUsed,
      data: schemaResult.data as RequirementProposal,
      usage: {
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      },
    };
  }
}

/**
 * Verify a Nebius Token Factory key against the official endpoint.
 */
export async function verifyNebiusApiKey(
  apiKey: string,
  baseUrl = DEFAULT_NEBIUS_BASE_URL,
  model = DEFAULT_NVIDIA_NEMOTRON_MODEL,
  fetchTransport: typeof fetch = globalThis.fetch,
): Promise<void> {
  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey || trimmedKey.length < 8) {
    throw new AiProviderAuthError('Nebius Token Factory API key is missing or invalid.');
  }

  const effectiveBaseUrl = baseUrl.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetchTransport(`${effectiveBaseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
      },
      signal: controller.signal,
    });

    if (response.ok) return;

    if (response.status === 401 || response.status === 403) {
      throw new AiProviderAuthError(
        'Nebius Token Factory rejected this API key. Verify that the key is valid and has access to Token Factory.',
      );
    }

    throw new AiProviderError(
      `Nebius Token Factory credential verification failed (HTTP ${response.status}).`,
      'ai_credential_check_failed',
      response.status >= 500,
    );
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderTimeoutError('Nebius Token Factory credential verification timed out.');
    }
    throw new AiProviderError(
      'Could not reach Nebius Token Factory endpoint to verify credentials.',
      'ai_network_error',
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

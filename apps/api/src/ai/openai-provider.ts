/**
 * Real OpenAI Provider Adapter for ProjectPilot.
 * Uses structured JSON outputs with local schema validation.
 * Enforces timeouts, bounded exponential backoff retries, error redaction,
 * and never silently falls back to mocks when configured.
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

export interface OpenAiProviderConfig {
  apiKey: string;
  model?: string;
  fallbackModels?: string[];
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchTransport?: typeof fetch;
  providerId?: string;
  providerLabel?: string;
}

const PLAN_DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          dueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                ownerSuggestion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                dueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                dependencyTitles: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'description', 'ownerSuggestion', 'dueDate', 'dependencyTitles'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'description', 'dueDate', 'tasks'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'assumptions', 'risks', 'milestones'],
  additionalProperties: false,
};

const REQUIREMENT_PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tempId: { type: 'string' },
          title: { type: 'string' },
          description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          category: {
            type: 'string',
            enum: ['functional', 'non_functional', 'constraint', 'deliverable'],
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
          },
          sourceReference: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          rationale: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: [
          'tempId',
          'title',
          'description',
          'category',
          'priority',
          'sourceReference',
          'rationale',
        ],
        additionalProperties: false,
      },
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    ambiguities: { type: 'array', items: { type: 'string' } },
    conflicts: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'candidates', 'assumptions', 'ambiguities', 'conflicts', 'risks'],
  additionalProperties: false,
};

export class OpenAiProvider implements AiProvider {
  readonly id: string;
  private readonly providerLabel: string;
  private readonly apiKey: string;
  readonly model: string;
  private readonly fallbackModels: string[];
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAiProviderConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new AiProviderAuthError(`${config.providerLabel ?? 'OpenAI'} API key is missing.`);
    }
    this.apiKey = config.apiKey.trim();
    this.id = config.providerId ?? 'openai';
    this.providerLabel = config.providerLabel ?? 'OpenAI';
    this.model = config.model || 'gpt-4o';
    this.fallbackModels = config.fallbackModels ?? [];
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchImpl = config.fetchTransport ?? globalThis.fetch;
  }

  async callChatCompletions(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    schemaName?: string,
    jsonSchema?: Record<string, unknown>,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{
    content: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    modelUsed?: string;
  }> {
    const effectiveTimeout = options?.timeoutMs ?? this.timeoutMs;
    const url = `${this.baseUrl}/chat/completions`;

    const candidateModels = [this.model, ...this.fallbackModels.filter((m) => m !== this.model)];
    let lastError: Error | null = null;

    for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
      const currentModel = candidateModels[modelIdx]!;
      const isLastModel = modelIdx === candidateModels.length - 1;
      const maxAttempts = this.maxRetries + 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

        // Listen to external caller signal if supplied
        if (options?.signal) {
          options.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        try {
          const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
              ...(this.id === 'gemini' ? { 'x-goog-api-key': this.apiKey } : {}),
            },
            body: JSON.stringify({
              model: currentModel,
              messages,
              ...(schemaName && jsonSchema
                ? {
                    response_format: {
                      type: 'json_schema',
                      json_schema: {
                        name: schemaName,
                        strict: true,
                        schema: jsonSchema,
                      },
                    },
                  }
                : {}),
              temperature: 0.2,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const body = (await response.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };
            const choice = body.choices?.[0];
            const content = choice?.message?.content;

            if (!content || typeof content !== 'string') {
              throw new AiProviderValidationError(
                `${this.providerLabel} response did not contain valid text content in choice.`,
              );
            }

            return { content, usage: body.usage, modelUsed: currentModel };
          }

          const statusCode = response.status;
          let errorBody = '';
          try {
            const errJson = (await response.json()) as { error?: { message?: string } };
            errorBody = errJson?.error?.message || response.statusText;
          } catch {
            errorBody = response.statusText;
          }

          // Redact any accidental leakage
          const sanitizedError = errorBody.replace(this.apiKey, '[REDACTED_SECRET]');

          if (statusCode === 401 || statusCode === 403) {
            throw new AiProviderAuthError(
              `${this.providerLabel} authentication failed (${statusCode}): ${sanitizedError}`,
            );
          }

          if (statusCode === 429) {
            if (attempt < maxAttempts) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            if (!isLastModel) {
              lastError = new AiProviderRateLimitError(
                `${this.providerLabel} rate limit exceeded on ${currentModel}: ${sanitizedError}`,
              );
              break;
            }
            throw new AiProviderRateLimitError(
              `${this.providerLabel} rate limit exceeded: ${sanitizedError}`,
            );
          }

          if (statusCode >= 500 && statusCode <= 599) {
            if (attempt < maxAttempts) {
              const delay = Math.min(500 * Math.pow(2, attempt - 1), 3000);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            if (!isLastModel) {
              lastError = new AiProviderError(
                `${this.providerLabel} server error (${statusCode}) on ${currentModel}: ${sanitizedError}`,
                'ai_server_error',
                true,
              );
              break;
            }
            throw new AiProviderError(
              `${this.providerLabel} server error (${statusCode}): ${sanitizedError}`,
              'ai_server_error',
              true,
            );
          }

          if (statusCode === 404 && !isLastModel) {
            break;
          }

          throw new AiProviderError(
            `${this.providerLabel} request failed (${statusCode}): ${sanitizedError}`,
            'ai_request_failed',
            false,
          );
        } catch (err: unknown) {
          clearTimeout(timeoutId);

          if (err instanceof AiProviderError) {
            if ((err.code === 'ai_server_error' || err.code === 'ai_rate_limit') && !isLastModel) {
              lastError = err;
              break;
            }
            throw err;
          }

          if (err instanceof Error && err.name === 'AbortError') {
            if (!isLastModel) {
              break;
            }
            throw new AiProviderTimeoutError(
              `${this.providerLabel} request timed out after ${effectiveTimeout}ms.`,
            );
          }

          if (!isLastModel) {
            break;
          }

          throw new AiProviderError(
            `${this.providerLabel} network request failed: ${err instanceof Error ? err.message : String(err)}`,
            'ai_network_error',
            true,
          );
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new AiProviderError(
      `${this.providerLabel} service is currently unavailable. Please retry shortly.`,
      'ai_server_error',
      true,
    );
  }

  async callChatCompletionsJson(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    schemaName: string,
    jsonSchema: Record<string, unknown>,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{
    content: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    modelUsed?: string;
  }> {
    return this.callChatCompletions(messages, schemaName, jsonSchema, options);
  }

  async generatePlan(
    input: PlanGenerationInput,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AiProviderResult<PlanDraft>> {
    const systemPrompt = `You are a project planning engine for Vouchlock.
Your job is to produce a structured, phased delivery plan based solely on the user's provided goal, deliverable, audience, deadline, constraints, and known workspace members.
Rules:
1. Owner suggestions MUST ONLY be selected from the provided workspace members list or set to null. NEVER invent names.
2. Milestones and task due dates MUST NOT exceed the project deadline if provided.
3. Task dependency titles MUST strictly refer to other task titles defined in this plan. No self-dependencies.
4. Output must be truthful and grounded. Do not add exaggerated claims.`;

    const userPrompt = JSON.stringify({
      goal: input.goal.trim(),
      audience: input.audience?.trim() || null,
      deliverable: input.deliverable?.trim() || null,
      deadline: input.deadline ? input.deadline.toISOString() : null,
      constraints: input.constraints || null,
      successMeasures: input.successMeasures || null,
      availableWorkspaceMembers: input.memberNames,
    });

    const response = await this.callChatCompletions(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'project_plan_draft',
      PLAN_DRAFT_JSON_SCHEMA,
      options,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new AiProviderValidationError('OpenAI returned invalid JSON for plan draft.');
    }

    const zodResult = planDraftSchema.safeParse(parsed);
    if (!zodResult.success) {
      throw new AiProviderValidationError(
        'OpenAI response failed schema validation for plan draft.',
        zodResult.error.format(),
      );
    }

    const draft = zodResult.data as unknown as PlanDraft;
    const domainErrors = validatePlanDraft(draft, input.memberNames, input.deadline ?? null);
    if (domainErrors.length > 0) {
      throw new AiProviderValidationError(
        `OpenAI generated plan violated domain rules: ${domainErrors.map((e) => e.message).join('; ')}`,
        domainErrors,
      );
    }

    return {
      provider: this.id,
      model: response.modelUsed || this.model,
      data: draft,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async extractRequirements(
    input: RequirementExtractionInput,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AiProviderResult<RequirementProposal>> {
    const systemPrompt = `You are a project requirement extraction engine for Vouchlock.
Given an unstructured project brief or assignment specification, extract candidate requirements for human review.
Rules:
1. Every candidate MUST include an exact sourceReference quote or section from the brief.
2. Categories must be one of: functional, non_functional, constraint, deliverable.
3. Priorities must be one of: low, normal, high.
4. NEVER invent assignees, due dates, or verification records.
5. Identify explicit assumptions, ambiguities, conflicts, and risks present in the text.`;

    const userPrompt = JSON.stringify({
      title: input.briefTitle || 'Project Brief',
      briefText: input.briefText,
    });

    const response = await this.callChatCompletions(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      'requirement_extraction_proposal',
      REQUIREMENT_PROPOSAL_JSON_SCHEMA,
      options,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new AiProviderValidationError(
        'OpenAI returned invalid JSON for requirement extraction proposal.',
      );
    }

    const zodResult = requirementProposalSchema.safeParse(parsed);
    if (!zodResult.success) {
      throw new AiProviderValidationError(
        'OpenAI response failed schema validation for requirement proposal.',
        zodResult.error.format(),
      );
    }

    const proposal = zodResult.data as unknown as RequirementProposal;
    const validation = validateProposalCandidates(proposal.candidates);
    if (!validation.valid) {
      throw new AiProviderValidationError(
        `OpenAI generated proposal violated candidate rules: ${validation.errors.join('; ')}`,
        validation.errors,
      );
    }

    return {
      provider: this.id,
      model: response.modelUsed || this.model,
      data: proposal,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

/**
 * Validates OpenAI credentials against OpenAI API without running a full plan generation.
 */
export async function verifyOpenAiApiKey(
  apiKey: string,
  model = 'gpt-4o-mini',
  options: { baseUrl?: string; fetchTransport?: typeof fetch } = {},
): Promise<void> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new AiProviderAuthError('OpenAI API key cannot be blank.');
  }

  const fetchTransport = options.fetchTransport || fetch;
  const baseUrl = options.baseUrl || 'https://api.openai.com/v1';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetchTransport(
      `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
        },
        signal: controller.signal,
      },
    );

    if (response.ok) return;

    if (response.status === 401) {
      throw new AiProviderAuthError(
        'OpenAI rejected this API key. Verify that your key is valid and has active billing.',
      );
    }

    if (response.status === 429) {
      throw new AiProviderRateLimitError(
        'OpenAI rate limit exceeded or quota exhausted for this API key.',
      );
    }

    if (response.status === 404) {
      // Check general /models listing endpoint to see if key works
      const listResponse = await fetchTransport(`${baseUrl.replace(/\/$/, '')}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${trimmedKey}` },
        signal: controller.signal,
      });

      if (listResponse.ok) return;

      if (listResponse.status === 401) {
        throw new AiProviderAuthError(
          'OpenAI rejected this API key. Verify that your key is valid and has active billing.',
        );
      }

      throw new AiProviderError(
        `OpenAI model "${model}" is not available for this key.`,
        'ai_model_not_found',
        false,
      );
    }

    throw new AiProviderError(
      `OpenAI credential check failed (HTTP ${response.status}).`,
      'ai_credential_check_failed',
      response.status >= 500,
    );
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderTimeoutError('OpenAI credential check timed out.');
    }
    throw new AiProviderError(
      'Could not reach OpenAI to verify this key.',
      'ai_network_error',
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * AI Planner Service — generates structured project plans and requirement proposals from briefs.
 * Supports mock provider (deterministic, zero external API keys required)
 * and real server-side provider adapters (OpenAI structured JSON output) when configured.
 * Never silently turns a live provider request into mock output.
 */

import { createHash } from 'crypto';
import type { PlanDraft, PlanValidationError, RequirementProposal } from '@projectpilot/domain';
import { validatePlanDraft } from '@projectpilot/domain';
import type { AppConfig } from '../config.js';
import { MockAiProvider } from './mock-provider.js';
import { OpenAiProvider } from './openai-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { getProviderDescriptor } from './registry.js';
import {
  AiProviderAuthError,
  AiProviderError,
  type AiProvider,
  type AiUsageMetadata,
  type PlanGenerationInput,
  type RequirementExtractionInput,
} from './types.js';

export * from './types.js';
export * from './registry.js';
export * from './ephemeral-store.js';
export { MockAiProvider } from './mock-provider.js';
export { OpenAiProvider, verifyOpenAiApiKey } from './openai-provider.js';
export { GeminiProvider, verifyGeminiApiKey } from './gemini-provider.js';

export interface PlanGenerationResult {
  provider: string;
  model: string;
  inputHash: string;
  draft: PlanDraft;
  validationErrors: PlanValidationError[];
  usage?: AiUsageMetadata;
}

export interface ProposalExtractionResult {
  provider: string;
  model: string;
  inputHash: string;
  proposal: RequirementProposal;
  usage?: AiUsageMetadata;
}

/**
 * Compute SHA-256 hash of prompt inputs to ensure deduplication and auditability.
 */
export function computeInputHash(input: PlanGenerationInput): string {
  const content = JSON.stringify({
    goal: input.goal.trim(),
    audience: input.audience?.trim() ?? '',
    deliverable: input.deliverable?.trim() ?? '',
    deadline: input.deadline ? input.deadline.toISOString() : '',
    constraints: input.constraints ?? {},
    memberNames: [...input.memberNames].sort(),
  });
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hash of brief text for requirement proposal deduplication.
 */
export function computeBriefHash(briefText: string): string {
  return createHash('sha256').update(briefText.trim()).digest('hex');
}

/**
 * Resolves the configured AI provider instance.
 * Throws explicit error if provider is misconfigured or credentials missing.
 * Accepts optional sessionApiKey for ephemeral BYOK overrides.
 */
export function getAiProvider(
  config: AppConfig | string,
  customProvider?: AiProvider,
  sessionApiKey?: string,
): AiProvider {
  if (customProvider) {
    return customProvider;
  }

  const providerType = typeof config === 'string' ? config : config.aiProvider || 'gemini';
  const apiKey = sessionApiKey || (typeof config === 'string' ? '' : config.aiApiKey || '');
  const configuredModel = typeof config === 'string' ? '' : config.aiModel || '';
  const model =
    configuredModel && (providerType !== 'gemini' || configuredModel.startsWith('gemini-'))
      ? configuredModel
      : providerType === 'gemini'
        ? 'gemini-3.8-flash'
        : 'gpt-4o';

  const descriptor = getProviderDescriptor(providerType);
  if (!descriptor) {
    throw new AiProviderError(
      `Unsupported AI provider: "${providerType}". Must be "mock" or "openai".`,
      'unknown_provider',
      false,
    );
  }

  if (descriptor.id === 'mock') {
    return new MockAiProvider();
  }

  if (descriptor.id === 'openai') {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'AI_PROVIDER is set to "openai" but AI_API_KEY is missing. Configure a valid key in your server environment or switch AI_PROVIDER=mock.',
      );
    }
    return new OpenAiProvider({
      apiKey,
      model,
    });
  }

  if (descriptor.id === 'gemini') {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'Google Gemini API key is missing. Add your Google AI Studio key in Settings.',
      );
    }
    return new GeminiProvider({ apiKey, model });
  }

  if (!descriptor.tested) {
    throw new AiProviderError(
      `Anthropic provider is not configured in this release slice. Use AI_PROVIDER=openai or AI_PROVIDER=mock.`,
      'unsupported_provider',
      false,
    );
  }

  throw new AiProviderError(
    `Unsupported AI provider: "${providerType}". Must be "mock" or "openai".`,
    'unknown_provider',
    false,
  );
}

/**
 * Generates an actionable, structured project plan draft.
 */
export async function generatePlan(
  input: PlanGenerationInput,
  config: AppConfig | string = 'mock',
  customProvider?: AiProvider,
  options?: { timeoutMs?: number; signal?: AbortSignal; sessionApiKey?: string },
): Promise<PlanGenerationResult> {
  const inputHash = computeInputHash(input);
  const provider = getAiProvider(config, customProvider, options?.sessionApiKey);

  const result = await provider.generatePlan(input, options);
  const validationErrors = validatePlanDraft(
    result.data,
    input.memberNames,
    input.deadline ?? null,
  );

  return {
    provider: result.provider,
    model: result.model,
    inputHash,
    draft: result.data,
    validationErrors,
    usage: result.usage,
  };
}

/**
 * Extracts structured candidate requirements and risks from an unstructured project brief.
 */
export async function extractRequirementsProposal(
  input: RequirementExtractionInput,
  config: AppConfig | string = 'mock',
  customProvider?: AiProvider,
  options?: { timeoutMs?: number; signal?: AbortSignal; sessionApiKey?: string },
): Promise<ProposalExtractionResult> {
  const inputHash = computeBriefHash(input.briefText);
  const provider = getAiProvider(config, customProvider, options?.sessionApiKey);

  const result = await provider.extractRequirements(input, options);

  return {
    provider: result.provider,
    model: result.model,
    inputHash,
    proposal: result.data,
    usage: result.usage,
  };
}

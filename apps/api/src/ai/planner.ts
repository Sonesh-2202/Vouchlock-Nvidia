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
import {
  NebiusTokenFactoryProvider,
  verifyNebiusApiKey,
  DEFAULT_NVIDIA_NEMOTRON_MODEL,
  DEFAULT_NEBIUS_BASE_URL,
} from './nebius-provider.js';
import { OpenAiProvider, verifyOpenAiApiKey } from './openai-provider.js';
import { GeminiProvider, verifyGeminiApiKey } from './gemini-provider.js';
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
export {
  NebiusTokenFactoryProvider,
  verifyNebiusApiKey,
  DEFAULT_NVIDIA_NEMOTRON_MODEL,
  DEFAULT_NEBIUS_BASE_URL,
} from './nebius-provider.js';
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
 * Defaults to Nebius Token Factory (NVIDIA Nemotron).
 * Routes to personal BYOK providers (OpenAI, Gemini) when explicitly selected by the user.
 * Never silently falls back between providers.
 */
export function getAiProvider(
  config: AppConfig | string,
  customProvider?: AiProvider,
  sessionApiKey?: string,
  providerOverride?: string,
): AiProvider {
  if (customProvider) {
    return customProvider;
  }

  const isConfigObj = typeof config === 'object' && config !== null;
  const requestedProvider =
    providerOverride ||
    (isConfigObj ? config.aiProvider : config) ||
    'nebius';
  const providerType = requestedProvider.toLowerCase().trim();

  if (providerType === 'mock') {
    return new MockAiProvider();
  }

  const descriptor = getProviderDescriptor(providerType);
  if (!descriptor) {
    throw new AiProviderError(
      `Unsupported AI provider: "${providerType}". Supported options are "nebius" (default hackathon runtime), "openai" (BYOK), and "gemini" (BYOK).`,
      'unknown_provider',
      false,
    );
  }

  if (!descriptor.tested) {
    throw new AiProviderError(
      `Provider "${descriptor.label}" (${providerType}) is not yet supported in this release slice.`,
      'unsupported_provider',
      false,
    );
  }

  if (providerType === 'nebius') {
    const apiKey =
      sessionApiKey ||
      (isConfigObj ? config.nebiusApiKey : '') ||
      process.env['NEBIUS_API_KEY'] ||
      process.env['NEBIUS_TOKEN_FACTORY_API_KEY'] ||
      '';

    const model =
      (isConfigObj ? config.nebiusModelId : '') ||
      process.env['NEBIUS_MODEL_ID'] ||
      process.env['NEBIUS_TOKEN_FACTORY_MODEL_ID'] ||
      DEFAULT_NVIDIA_NEMOTRON_MODEL;

    const baseUrl =
      (isConfigObj ? config.nebiusBaseUrl : '') ||
      process.env['NEBIUS_BASE_URL'] ||
      process.env['NEBIUS_TOKEN_FACTORY_BASE_URL'] ||
      DEFAULT_NEBIUS_BASE_URL;

    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'Nebius Token Factory API key is missing. Configure NEBIUS_API_KEY in the server environment, or provide an ephemeral session key.',
      );
    }

    return new NebiusTokenFactoryProvider({
      apiKey,
      model,
      baseUrl,
    });
  }

  if (providerType === 'openai') {
    const apiKey =
      sessionApiKey ||
      (isConfigObj ? config.openaiApiKey : '') ||
      process.env['OPENAI_API_KEY'] ||
      '';

    const model =
      (isConfigObj ? config.openaiModel : '') ||
      process.env['OPENAI_MODEL'] ||
      'gpt-4o';

    const baseUrl =
      (isConfigObj ? config.openaiBaseUrl : '') ||
      process.env['OPENAI_BASE_URL'] ||
      'https://api.openai.com/v1';

    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'OpenAI API key is missing. Please configure an ephemeral BYOK session key for OpenAI in Settings.',
      );
    }

    return new OpenAiProvider({
      apiKey,
      model,
      baseUrl,
    });
  }

  if (providerType === 'gemini') {
    const apiKey =
      sessionApiKey ||
      (isConfigObj ? config.aiApiKey : '') ||
      process.env['AI_API_KEY'] ||
      process.env['GEMINI_API_KEY'] ||
      '';

    const model =
      (isConfigObj ? config.aiModel : '') ||
      process.env['AI_MODEL'] ||
      'gemini-3.8-flash';

    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'Google Gemini API key is missing. Please configure an ephemeral BYOK session key for Google Gemini in Settings.',
      );
    }

    return new GeminiProvider({
      apiKey,
      model,
    });
  }

  throw new AiProviderError(
    `Unsupported AI provider: "${providerType}".`,
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
  options?: { timeoutMs?: number; signal?: AbortSignal; sessionApiKey?: string; providerOverride?: string },
): Promise<PlanGenerationResult> {
  const inputHash = computeInputHash(input);
  const provider = getAiProvider(config, customProvider, options?.sessionApiKey, options?.providerOverride);

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
  options?: { timeoutMs?: number; signal?: AbortSignal; sessionApiKey?: string; providerOverride?: string },
): Promise<ProposalExtractionResult> {
  const inputHash = computeBriefHash(input.briefText);
  const provider = getAiProvider(config, customProvider, options?.sessionApiKey, options?.providerOverride);

  const result = await provider.extractRequirements(input, options);

  return {
    provider: result.provider,
    model: result.model,
    inputHash,
    proposal: result.data,
    usage: result.usage,
  };
}

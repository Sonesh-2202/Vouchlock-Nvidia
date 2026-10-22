/**
 * AI Planner Service — generates structured project plans and requirement proposals from briefs.
 * Supports mock provider (deterministic, zero external API keys required)
 * and real server-side provider adapters (Nebius Token Factory with dynamic discovery, OpenAI structured JSON output) when configured.
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
  DEFAULT_NEBIUS_BASE_URL,
} from './nebius-provider.js';
import { OpenAiProvider, verifyOpenAiApiKey } from './openai-provider.js';
import { GeminiProvider, verifyGeminiApiKey } from './gemini-provider.js';
import { getProviderDescriptor } from './registry.js';
import { modelCatalogService } from './model-catalog.js';
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
export * from './model-catalog.js';
export { MockAiProvider } from './mock-provider.js';
export {
  NebiusTokenFactoryProvider,
  verifyNebiusApiKey,
  DEFAULT_NEBIUS_BASE_URL,
} from './nebius-provider.js';
export { OpenAiProvider, verifyOpenAiApiKey } from './openai-provider.js';
export { GeminiProvider, verifyGeminiApiKey } from './gemini-provider.js';

export interface PlanGenerationResult {
  provider: string;
  model: string;
  modelRole?: string;
  routingReason?: string;
  inputHash: string;
  draft: PlanDraft;
  validationErrors: PlanValidationError[];
  usage?: AiUsageMetadata;
}

export interface ProposalExtractionResult {
  provider: string;
  model: string;
  modelRole?: string;
  routingReason?: string;
  inputHash: string;
  proposal: RequirementProposal;
  usage?: AiUsageMetadata;
}

export interface ProviderResolutionResult {
  provider: AiProvider;
  modelId: string;
  modelRole: string;
  routingReason: string;
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
 * Resolves the configured AI provider instance dynamically.
 * For Nebius Token Factory: dynamically queries the live account catalog to discover and assign
 * confirmed NVIDIA Nemotron models matching the target profile (Nano/Super for fast, Super for balanced, Ultra for deep reasoning).
 * Routes to personal BYOK providers (OpenAI, Gemini) when explicitly selected by the user.
 * Never silently falls back between providers or invents model IDs.
 */
export async function resolveAiProvider(
  config: AppConfig | string,
  customProvider?: AiProvider,
  sessionApiKey?: string,
  providerOverride?: string,
  options?: {
    modelOverride?: string;
    roleProfile?: 'fast' | 'balanced' | 'deep_reasoning';
    workspaceId?: string;
    userId?: string;
    defaultRole?: 'fast' | 'balanced' | 'deep_reasoning';
  },
): Promise<ProviderResolutionResult> {
  if (customProvider) {
    return {
      provider: customProvider,
      modelId: 'custom',
      modelRole: 'custom',
      routingReason: 'Custom injected provider',
    };
  }

  const isConfigObj = typeof config === 'object' && config !== null;
  const requestedProvider =
    providerOverride || (isConfigObj ? config.aiProvider : config) || 'nebius';
  const providerType = requestedProvider.toLowerCase().trim();

  if (providerType === 'mock') {
    return {
      provider: new MockAiProvider(),
      modelId: 'mock-deterministic',
      modelRole: 'mock',
      routingReason: 'Deterministic local mock provider',
    };
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

    const targetRole = options?.roleProfile || options?.defaultRole || 'balanced';

    // Resolve model ID via dynamic catalog discovery
    const resolved = await modelCatalogService.resolveModel(targetRole, {
      apiKey,
      baseUrl,
      modelOverride: options?.modelOverride || (isConfigObj ? config.nebiusModelId : undefined),
      workspaceId: options?.workspaceId,
      userId: options?.userId,
    });

    return {
      provider: new NebiusTokenFactoryProvider({
        apiKey,
        model: resolved.modelId,
        baseUrl,
      }),
      modelId: resolved.modelId,
      modelRole: resolved.modelRole,
      routingReason: resolved.routingReason,
    };
  }

  if (providerType === 'openai') {
    const apiKey =
      sessionApiKey ||
      (isConfigObj ? config.openaiApiKey : '') ||
      process.env['OPENAI_API_KEY'] ||
      '';

    const model =
      options?.modelOverride ||
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

    return {
      provider: new OpenAiProvider({
        apiKey,
        model,
        baseUrl,
      }),
      modelId: model,
      modelRole: 'byok_openai',
      routingReason: `BYOK OpenAI configuration: "${model}"`,
    };
  }

  if (providerType === 'gemini') {
    const apiKey =
      sessionApiKey ||
      (isConfigObj ? config.aiApiKey : '') ||
      process.env['AI_API_KEY'] ||
      process.env['GEMINI_API_KEY'] ||
      '';

    const model =
      options?.modelOverride ||
      (isConfigObj ? config.aiModel : '') ||
      process.env['AI_MODEL'] ||
      'gemini-3.8-flash';

    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiProviderAuthError(
        'Google Gemini API key is missing. Please configure an ephemeral BYOK session key for Google Gemini in Settings.',
      );
    }

    return {
      provider: new GeminiProvider({
        apiKey,
        model,
      }),
      modelId: model,
      modelRole: 'byok_gemini',
      routingReason: `BYOK Google Gemini configuration: "${model}"`,
    };
  }

  throw new AiProviderError(
    `Unsupported AI provider: "${providerType}".`,
    'unknown_provider',
    false,
  );
}

/**
 * Synchronous backward-compatible resolver for simple cases or tests where model is known.
 */
export function getAiProvider(
  config: AppConfig | string,
  customProvider?: AiProvider,
  sessionApiKey?: string,
  providerOverride?: string,
  modelOverride?: string,
): AiProvider {
  if (customProvider) return customProvider;

  const isConfigObj = typeof config === 'object' && config !== null;
  const requestedProvider =
    providerOverride || (isConfigObj ? config.aiProvider : config) || 'nebius';
  const providerType = requestedProvider.toLowerCase().trim();

  if (providerType === 'mock') {
    return new MockAiProvider();
  }

  if (providerType === 'nebius') {
    const apiKey =
      sessionApiKey ||
      (isConfigObj ? config.nebiusApiKey : '') ||
      process.env['NEBIUS_API_KEY'] ||
      process.env['NEBIUS_TOKEN_FACTORY_API_KEY'] ||
      '';
    const baseUrl =
      (isConfigObj ? config.nebiusBaseUrl : '') ||
      process.env['NEBIUS_BASE_URL'] ||
      DEFAULT_NEBIUS_BASE_URL;
    const model =
      modelOverride ||
      (isConfigObj ? config.nebiusModelId : '') ||
      process.env['NEBIUS_MODEL_ID'] ||
      '';

    if (!model) {
      throw new AiProviderError(
        'Nebius model ID must be supplied or dynamically discovered from the live catalog.',
        'missing_model',
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
    return new OpenAiProvider({
      apiKey,
      model: modelOverride || (isConfigObj ? config.openaiModel : '') || 'gpt-4o',
      baseUrl: isConfigObj ? config.openaiBaseUrl : undefined,
    });
  }

  if (providerType === 'gemini') {
    const apiKey =
      sessionApiKey || (isConfigObj ? config.aiApiKey : '') || process.env['AI_API_KEY'] || '';
    return new GeminiProvider({
      apiKey,
      model: modelOverride || (isConfigObj ? config.aiModel : '') || 'gemini-3.8-flash',
    });
  }

  if (providerType === 'anthropic') {
    throw new AiProviderError(
      'Anthropic Claude adapter is unvalidated in current test matrix.',
      'unsupported_provider',
      false,
    );
  }

  throw new AiProviderError(
    `Unsupported AI provider: "${providerType}".`,
    'unknown_provider',
    false,
  );
}

/**
 * Generates an actionable, structured project plan draft.
 * Routes to Deep Reasoning profile (Nemotron 3 Ultra candidate) for complex multi-stage dependency planning.
 */
export interface PlannerExecutionOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  sessionApiKey?: string;
  providerOverride?: string;
  modelOverride?: string;
  roleProfile?: 'fast' | 'balanced' | 'deep_reasoning';
  workspaceId?: string;
  userId?: string;
}

export async function generatePlan(
  input: PlanGenerationInput,
  config: AppConfig | string = 'mock',
  customProviderOrOptions?: AiProvider | PlannerExecutionOptions,
  maybeOptions?: PlannerExecutionOptions,
): Promise<PlanGenerationResult> {
  const isCustomProvider =
    customProviderOrOptions &&
    typeof (customProviderOrOptions as AiProvider).generatePlan === 'function';
  const customProvider = isCustomProvider ? (customProviderOrOptions as AiProvider) : undefined;
  const options = isCustomProvider
    ? maybeOptions
    : (customProviderOrOptions as PlannerExecutionOptions | undefined);

  const inputHash = computeInputHash(input);
  const resolved = await resolveAiProvider(
    config,
    customProvider,
    options?.sessionApiKey,
    options?.providerOverride,
    {
      modelOverride: options?.modelOverride,
      roleProfile: options?.roleProfile,
      defaultRole: 'deep_reasoning', // Plan generation involves complex dependencies -> deep reasoning profile
      workspaceId: options?.workspaceId,
      userId: options?.userId,
    },
  );

  const result = await resolved.provider.generatePlan(input, options);
  const validationErrors = validatePlanDraft(
    result.data,
    input.memberNames,
    input.deadline ?? null,
  );

  return {
    provider: result.provider,
    model: result.model,
    modelRole: resolved.modelRole,
    routingReason: resolved.routingReason,
    inputHash,
    draft: result.data,
    validationErrors,
    usage: result.usage,
  };
}

/**
 * Extracts structured candidate requirements and risks from an unstructured project brief.
 * Routes to Fast / Everyday profile (Nemotron Nano/Super candidate) for bounded brief extraction.
 */
export async function extractRequirementsProposal(
  input: RequirementExtractionInput,
  config: AppConfig | string = 'mock',
  customProviderOrOptions?: AiProvider | PlannerExecutionOptions,
  maybeOptions?: PlannerExecutionOptions,
): Promise<ProposalExtractionResult> {
  const isCustomProvider =
    customProviderOrOptions &&
    typeof (customProviderOrOptions as AiProvider).extractRequirements === 'function';
  const customProvider = isCustomProvider ? (customProviderOrOptions as AiProvider) : undefined;
  const options = isCustomProvider
    ? maybeOptions
    : (customProviderOrOptions as PlannerExecutionOptions | undefined);

  const inputHash = computeBriefHash(input.briefText);
  const resolved = await resolveAiProvider(
    config,
    customProvider,
    options?.sessionApiKey,
    options?.providerOverride,
    {
      modelOverride: options?.modelOverride,
      roleProfile: options?.roleProfile,
      defaultRole: 'fast', // Brief candidate extraction is routine & bounded -> fast profile
      workspaceId: options?.workspaceId,
      userId: options?.userId,
    },
  );

  const result = await resolved.provider.extractRequirements(input, options);

  return {
    provider: result.provider,
    model: result.model,
    modelRole: resolved.modelRole,
    routingReason: resolved.routingReason,
    inputHash,
    proposal: result.data,
    usage: result.usage,
  };
}

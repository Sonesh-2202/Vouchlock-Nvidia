/**
 * AI Provider interface and error types for ProjectPilot.
 */

import type { PlanDraft, RequirementProposal } from '@projectpilot/domain';

export interface PlanGenerationInput {
  goal: string;
  audience?: string | null;
  deliverable?: string | null;
  deadline?: Date | null;
  constraints?: Record<string, unknown> | string[] | null;
  successMeasures?: Record<string, unknown> | null;
  memberNames: string[];
}

export interface RequirementExtractionInput {
  briefText: string;
  briefTitle?: string;
}

export interface AiUsageMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiProviderResult<T> {
  provider: string;
  model: string;
  data: T;
  usage?: AiUsageMetadata;
}

export class AiProviderError extends Error {
  readonly code: string;
  readonly isRetryable: boolean;

  constructor(message: string, code = 'ai_provider_error', isRetryable = false) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.isRetryable = isRetryable;
  }
}

export class AiProviderAuthError extends AiProviderError {
  constructor(message = 'AI provider authentication failed. Check configured API key.') {
    super(message, 'ai_auth_error', false);
    this.name = 'AiProviderAuthError';
  }
}

export class AiProviderRateLimitError extends AiProviderError {
  constructor(message = 'AI provider rate limit reached. Please retry shortly.') {
    super(message, 'ai_rate_limit_error', true);
    this.name = 'AiProviderRateLimitError';
  }
}

export class AiProviderTimeoutError extends AiProviderError {
  constructor(message = 'AI provider request timed out.') {
    super(message, 'ai_timeout_error', true);
    this.name = 'AiProviderTimeoutError';
  }
}

export class AiProviderValidationError extends AiProviderError {
  readonly validationIssues?: unknown;

  constructor(message: string, issues?: unknown) {
    super(message, 'ai_validation_error', false);
    this.name = 'AiProviderValidationError';
    this.validationIssues = issues;
  }
}

export interface AiProvider {
  readonly id: string;
  generatePlan(
    input: PlanGenerationInput,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AiProviderResult<PlanDraft>>;

  extractRequirements(
    input: RequirementExtractionInput,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<AiProviderResult<RequirementProposal>>;
}

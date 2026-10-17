/**
 * Provider Registry — single source of truth for supported AI providers.
 * Providers are marked `tested: true` only when their adapter passes the full test matrix.
 * Arbitrary provider strings throw typed `unknown_provider`.
 */

export interface ProviderDescriptor {
  readonly id: string;
  readonly label: string;
  readonly tested: boolean;
  readonly requiresApiKey: boolean;
  readonly description?: string;
}

export const PROVIDER_REGISTRY = {
  mock: {
    id: 'mock',
    label: 'Mock (Deterministic)',
    tested: true,
    requiresApiKey: false,
    description: 'Deterministic test engine with zero network calls and zero credentials required.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    tested: true,
    requiresApiKey: true,
    description: 'Production adapter supporting live OpenAI models via structured JSON schema.',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    tested: true,
    requiresApiKey: true,
    description: 'Google AI Studio Gemini API using structured outputs. API keys are session-only.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    tested: false, // gated on Anthropic adapter passing the 9-test matrix
    requiresApiKey: true,
    description: 'Anthropic Messages API adapter (planned; pending full test matrix validation).',
  },
} as const satisfies Record<string, ProviderDescriptor>;

export type SupportedProviderId = keyof typeof PROVIDER_REGISTRY;

export function getProviderDescriptor(id: string): ProviderDescriptor | undefined {
  return (PROVIDER_REGISTRY as Record<string, ProviderDescriptor | undefined>)[id];
}

export function isProviderTested(id: string): boolean {
  const desc = getProviderDescriptor(id);
  return desc?.tested === true;
}

export function listSupportedProviders(): ProviderDescriptor[] {
  return Object.values(PROVIDER_REGISTRY);
}

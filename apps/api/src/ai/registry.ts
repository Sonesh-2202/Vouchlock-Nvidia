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
  readonly advertised?: boolean;
}

export const PROVIDER_REGISTRY = {
  nebius: {
    id: 'nebius',
    label: 'NVIDIA Nemotron (Nebius Token Factory)',
    tested: true,
    requiresApiKey: true,
    advertised: true,
    description:
      'Serverless inference endpoint hosting NVIDIA open-source Nemotron models via Nebius Token Factory.',
  },
  mock: {
    id: 'mock',
    label: 'Internal Mock Fixture',
    tested: true,
    requiresApiKey: false,
    advertised: false, // Internal-only fixture, isolated from live product selection
    description: 'Deterministic test engine with zero network calls and zero credentials required.',
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

/**
 * Returns only production-advertised providers for user-facing and API consumers.
 * Internal mock fixtures are excluded from product selection.
 */
export function listSupportedProviders(): ProviderDescriptor[] {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.advertised !== false);
}

import { createHash } from 'node:crypto';
import type {
  DiscoveredModel,
  ModelCatalogResponse,
  ModelPreferences,
  ModelRoleProfile,
} from '@projectpilot/contracts';
import {
  AiProviderAuthError,
  AiProviderError,
  AiProviderRateLimitError,
  AiProviderTimeoutError,
} from './types.js';

interface CacheEntry {
  data: ModelCatalogResponse;
  expiresAt: number;
}

export class NebiusModelCatalogService {
  private cache = new Map<string, CacheEntry>();
  private preferences = new Map<string, ModelPreferences>(); // Keyed by workspaceId or userId
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 300_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generates a cryptographic hash of the credential + baseUrl to ensure strict credential isolation.
   * Model catalog responses are strictly scoped to the exact key that requested them.
   */
  private getCacheKey(apiKey: string, baseUrl: string): string {
    return createHash('sha256')
      .update(`${apiKey.trim()}:${baseUrl.trim().toLowerCase()}`)
      .digest('hex');
  }

  /**
   * Fetches the live model catalog from Nebius Token Factory (GET /v1/models).
   * Parses official metadata and categorizes models into Fast (Nano/Super), Balanced (Super), and Deep Reasoning (Ultra).
   */
  async fetchCatalog(
    apiKey: string,
    baseUrl = 'https://api.tokenfactory.nebius.com/v1',
    options?: { forceRefresh?: boolean; timeoutMs?: number; fetchTransport?: typeof fetch },
  ): Promise<ModelCatalogResponse> {
    const trimmedKey = (apiKey || '').trim();
    if (!trimmedKey || trimmedKey.length < 8) {
      throw new AiProviderAuthError(
        'Nebius Token Factory API key is missing or invalid. Please check your credentials.',
      );
    }

    const effectiveBaseUrl = baseUrl.replace(/\/+$/, '');
    const cacheKey = this.getCacheKey(trimmedKey, effectiveBaseUrl);
    const now = Date.now();

    // Check cache unless forceRefresh is explicitly requested
    if (!options?.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return {
          ...cached.data,
          cached: true,
        };
      }
    }

    const timeoutMs = options?.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchFn = options?.fetchTransport ?? globalThis.fetch;

    let response: Response;
    try {
      response = await fetchFn(`${effectiveBaseUrl}/models?verbose=true`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (response.status === 400 || response.status === 422) {
        response = await fetchFn(`${effectiveBaseUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      }
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AiProviderTimeoutError(
          `Connection timed out while fetching model catalog from Nebius Token Factory (${effectiveBaseUrl}/models).`,
        );
      }
      throw new AiProviderError(
        `Network error while contacting Nebius Token Factory: ${err instanceof Error ? err.message : String(err)}`,
        'catalog_network_error',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }

      if (response.status === 401 || response.status === 403) {
        throw new AiProviderAuthError(
          `Nebius Token Factory authentication failed (HTTP ${response.status}). Verify your API key has catalog permissions.`,
        );
      }
      if (response.status === 429) {
        throw new AiProviderRateLimitError(
          'Nebius Token Factory rate limit exceeded while querying model catalog. Please retry shortly.',
        );
      }
      throw new AiProviderError(
        `Nebius Token Factory catalog query failed with HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
        'catalog_api_error',
      );
    }

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch {
      throw new AiProviderError(
        'Nebius Token Factory returned invalid JSON for model catalog.',
        'catalog_invalid_json',
      );
    }

    // Parse models list
    const rawList =
      rawData &&
      typeof rawData === 'object' &&
      'data' in rawData &&
      Array.isArray((rawData as { data: unknown }).data)
        ? (rawData as { data: unknown[] }).data
        : Array.isArray(rawData)
          ? rawData
          : [];

    const models: DiscoveredModel[] = [];

    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      const id = typeof m['id'] === 'string' ? m['id'].trim() : '';
      if (!id) continue;

      const lowerId = id.toLowerCase();
      const ownedBy = typeof m['owned_by'] === 'string' ? m['owned_by'] : undefined;
      const lowerOwnedBy = (ownedBy || '').toLowerCase();

      // Check if this model is an NVIDIA Nemotron open-source model
      const isNvidiaVendor =
        lowerOwnedBy.includes('nvidia') ||
        lowerId.startsWith('nvidia/') ||
        lowerId.includes('/nvidia') ||
        lowerId.includes('nemotron');

      const isNemotron = lowerId.includes('nemotron');

      const vendor = isNvidiaVendor ? 'NVIDIA' : ownedBy || 'unknown';
      const family = isNemotron ? 'Nemotron' : isNvidiaVendor ? 'NVIDIA' : 'unknown';

      // Role classification based STRICTLY on confirmed metadata/identifiers.
      // - Fast / Everyday: Nemotron Nano
      // - Balanced: Nemotron Super
      // - Deep Reasoning: Nemotron 3 Ultra
      // Do NOT infer Ultra from parameter counts (e.g. 70b).
      // Do NOT infer Nano from 8b/mini/small unless explicitly identified as Nemotron Nano.
      let roleSuggestion: ModelRoleProfile = 'unclassified';
      if (isNemotron) {
        if (lowerId.includes('nano')) {
          roleSuggestion = 'fast';
        } else if (lowerId.includes('ultra')) {
          roleSuggestion = 'deep_reasoning';
        } else if (lowerId.includes('super')) {
          roleSuggestion = 'balanced';
        }
      }

      // Extract optional metadata only if present in the response
      const contextLength =
        typeof m['context_length'] === 'number'
          ? m['context_length']
          : typeof m['max_context_length'] === 'number'
            ? m['max_context_length']
            : undefined;

      const quantization = typeof m['quantization'] === 'string' ? m['quantization'] : undefined;

      let pricing: { prompt?: string | number; completion?: string | number } | undefined;
      if (m['pricing'] && typeof m['pricing'] === 'object') {
        const p = m['pricing'] as Record<string, unknown>;
        pricing = {
          prompt:
            typeof p['prompt'] === 'string' || typeof p['prompt'] === 'number'
              ? (p['prompt'] as string | number)
              : undefined,
          completion:
            typeof p['completion'] === 'string' || typeof p['completion'] === 'number'
              ? (p['completion'] as string | number)
              : undefined,
        };
      }

      const tags: string[] = [];
      if (Array.isArray(m['tags'])) {
        for (const t of m['tags']) {
          if (typeof t === 'string') tags.push(t);
        }
      }

      const displayName =
        typeof m['display_name'] === 'string' && m['display_name'].trim().length > 0
          ? (m['display_name'] as string).trim()
          : typeof m['name'] === 'string' && m['name'].trim().length > 0
            ? (m['name'] as string).trim()
            : id;

      models.push({
        id,
        displayName,
        vendor,
        family,
        isNemotron,
        roleSuggestion,
        contextLength,
        pricing,
        quantization,
        tags,
        rawMetadata: m,
      });
    }

    const nemotronModels = models.filter((m) => m.isNemotron);

    // Compute automatic role candidates based strictly on live discovered metadata.
    // Do NOT assign any model to a role merely because it is the only Nemotron model in the catalog.
    const fastCandidate = nemotronModels.find((m) => m.roleSuggestion === 'fast') || null;
    const balancedCandidate = nemotronModels.find((m) => m.roleSuggestion === 'balanced') || null;
    const deepReasoningCandidate =
      nemotronModels.find((m) => m.roleSuggestion === 'deep_reasoning') || null;

    const catalogResult: ModelCatalogResponse = {
      provider: 'nebius',
      models,
      nemotronModels,
      roleAssignments: {
        fast: fastCandidate,
        balanced: balancedCandidate,
        deep_reasoning: deepReasoningCandidate,
      },
      fetchedAt: new Date().toISOString(),
      cached: false,
      source: 'nebius_token_factory_catalog',
    };

    // Cache successful response (do not cache errors or credentials)
    this.cache.set(cacheKey, {
      data: catalogResult,
      expiresAt: now + this.defaultTtlMs,
    });

    return catalogResult;
  }

  /**
   * Resolves the exact model to use for a given role or override from live catalog.
   * Throws clear error if the model cannot be resolved or is not in the live catalog.
   */
  async resolveModel(
    role: 'fast' | 'balanced' | 'deep_reasoning',
    params: {
      apiKey: string;
      baseUrl?: string;
      modelOverride?: string;
      workspaceId?: string;
      userId?: string;
    },
  ): Promise<{
    modelId: string;
    modelRole: string;
    routingReason: string;
    displayName: string;
    isNemotron: boolean;
  }> {
    const catalog = await this.fetchCatalog(params.apiKey, params.baseUrl);

    // 1. Direct explicit model override
    if (params.modelOverride && params.modelOverride.trim().length > 0) {
      const explicitId = params.modelOverride.trim();
      const match = catalog.models.find((m) => m.id === explicitId);
      if (!match) {
        throw new AiProviderError(
          `Requested model "${explicitId}" is not present in the live Nebius Token Factory catalog for your account. Please refresh the catalog or select an available model.`,
          'requested_model_unavailable',
          false,
        );
      }
      return {
        modelId: match.id,
        modelRole: match.roleSuggestion !== 'unclassified' ? match.roleSuggestion : 'user_pinned',
        routingReason: `Explicit model override: "${match.id}" (${match.displayName})`,
        displayName: match.displayName,
        isNemotron: match.isNemotron,
      };
    }

    // 2. Check workspace/user saved preferences
    const prefKey = params.workspaceId || params.userId || '';
    const prefs = prefKey ? this.preferences.get(prefKey) : undefined;

    if (prefs?.selectedModelId && prefs.selectedModelId.trim().length > 0) {
      const savedId = prefs.selectedModelId.trim();
      const savedModel = catalog.models.find((m) => m.id === savedId);
      if (savedModel) {
        return {
          modelId: savedModel.id,
          modelRole:
            savedModel.roleSuggestion !== 'unclassified'
              ? savedModel.roleSuggestion
              : 'user_preferred',
          routingReason: `User-selected preferred model: "${savedModel.id}" (${savedModel.displayName})`,
          displayName: savedModel.displayName,
          isNemotron: savedModel.isNemotron,
        };
      } else {
        // Saved model is no longer available in catalog — never silently substitute!
        throw new AiProviderError(
          `Previously selected model "${savedId}" is no longer available in the live Nebius Token Factory catalog. Vouchlock will not silently substitute an unconfirmed model. Please refresh the catalog and select a replacement model in Settings.`,
          'selected_model_unavailable',
          false,
        );
      }
    }

    // 3. Custom role assignment in preferences
    if (prefs?.customRoleAssignments && prefs.customRoleAssignments[role]) {
      const assignedId = prefs.customRoleAssignments[role]!;
      const assignedModel = catalog.models.find((m) => m.id === assignedId);
      if (assignedModel) {
        return {
          modelId: assignedModel.id,
          modelRole: role,
          routingReason: `Custom role assignment for "${role}": "${assignedModel.id}" (${assignedModel.displayName})`,
          displayName: assignedModel.displayName,
          isNemotron: assignedModel.isNemotron,
        };
      } else {
        throw new AiProviderError(
          `Model "${assignedId}" assigned to role "${role}" is no longer listed in your live Nebius Token Factory catalog. Please refresh the catalog and update your role assignment in Settings.`,
          'assigned_role_model_unavailable',
          false,
        );
      }
    }

    // 4. Role-based automatic discovery
    const roleCandidate = catalog.roleAssignments[role];
    if (roleCandidate) {
      return {
        modelId: roleCandidate.id,
        modelRole: role,
        routingReason: `Discovered NVIDIA Nemotron candidate for "${role}" profile: "${roleCandidate.id}" (${roleCandidate.displayName})`,
        displayName: roleCandidate.displayName,
        isNemotron: roleCandidate.isNemotron,
      };
    }

    // 5. Fail truthfully if no suitable model is classified for this role.
    // Do NOT fall back to an arbitrary model or nemotronModels[0]!
    const roleLabel =
      role === 'deep_reasoning'
        ? 'Deep Reasoning (Nemotron 3 Ultra)'
        : role === 'fast'
          ? 'Fast / Everyday (Nemotron Nano / Super)'
          : 'Balanced (Nemotron Super)';

    throw new AiProviderError(
      `No model discovered in your authenticated Nebius Token Factory catalog satisfies the "${roleLabel}" profile. Automatic routing is unavailable until an appropriate model is discovered or you configure an explicit model assignment in Settings.`,
      'role_profile_unavailable',
      false,
    );
  }

  /**
   * Stores user/workspace model preferences in process memory.
   * Note: Scoped in-memory for active server process lifetime.
   */
  setPreferences(key: string, prefs: ModelPreferences): void {
    this.preferences.set(key, prefs);
  }

  /**
   * Retrieves user/workspace model preferences.
   */
  getPreferences(key: string): ModelPreferences | undefined {
    return this.preferences.get(key);
  }

  /**
   * Clear cache for testing or manual invalidation.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const modelCatalogService = new NebiusModelCatalogService();

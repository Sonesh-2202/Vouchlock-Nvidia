import { AiProviderAuthError, AiProviderError, AiProviderTimeoutError } from './types.js';
import { OpenAiProvider, type OpenAiProviderConfig } from './openai-provider.js';

const GEMINI_COMPATIBLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export const DEFAULT_GEMINI_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

export interface GeminiProviderConfig extends Omit<
  OpenAiProviderConfig,
  'baseUrl' | 'providerId' | 'providerLabel'
> {
  baseUrl?: string;
}

/** Google AI Studio adapter using Google's documented OpenAI-compatible endpoint. */
export class GeminiProvider extends OpenAiProvider {
  constructor(config: GeminiProviderConfig) {
    super({
      ...config,
      providerId: 'gemini',
      providerLabel: 'Google Gemini',
      model: config.model || DEFAULT_GEMINI_MODEL,
      fallbackModels: config.fallbackModels ?? DEFAULT_GEMINI_FALLBACK_MODELS,
      baseUrl: config.baseUrl || GEMINI_COMPATIBLE_ENDPOINT,
    });
  }
}

/** Verify a Google AI Studio key and model without generating billable content. */
export async function verifyGeminiApiKey(
  apiKey: string,
  model = DEFAULT_GEMINI_MODEL,
  fetchTransport: typeof fetch = globalThis.fetch,
): Promise<void> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey || trimmedKey.length < 8) {
    throw new AiProviderAuthError('Google AI Studio API key is missing or invalid.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchTransport(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
      { method: 'GET', headers: { 'x-goog-api-key': trimmedKey }, signal: controller.signal },
    );
    if (response.ok) return;
    if (response.status === 401 || response.status === 403) {
      throw new AiProviderAuthError(
        'Google rejected this API key. Check that it is valid and enabled for the Gemini API.',
      );
    }
    if (response.status === 404) {
      // If the specific model path returns 404, verify if the API key is valid on the models list
      const listResponse = await fetchTransport(
        'https://generativelanguage.googleapis.com/v1beta/models',
        { method: 'GET', headers: { 'x-goog-api-key': trimmedKey }, signal: controller.signal },
      );
      if (listResponse.ok) return;
      if (listResponse.status === 401 || listResponse.status === 403) {
        throw new AiProviderAuthError(
          'Google rejected this API key. Check that it is valid and enabled for the Gemini API.',
        );
      }
      throw new AiProviderError(
        `Gemini model "${model}" is unavailable for this key.`,
        'ai_model_not_found',
        false,
      );
    }
    throw new AiProviderError(
      `Google Gemini credential check failed (HTTP ${response.status}).`,
      'ai_credential_check_failed',
      response.status >= 500,
    );
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderTimeoutError('Google Gemini credential check timed out.');
    }
    throw new AiProviderError(
      'Could not reach Google Gemini to verify this key.',
      'ai_network_error',
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

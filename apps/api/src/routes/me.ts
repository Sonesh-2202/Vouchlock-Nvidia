/**
 * User personal routes (/api/v1/me).
 * Handles ephemeral BYOK provider sessions, provider discovery, and user settings.
 * All operations derive user identity from verified JWT session.
 * Secret keys are strictly session-scoped in memory and NEVER written to disk, database, or logs.
 */

import type { FastifyInstance } from 'fastify';
import { setProviderSessionSchema } from '@projectpilot/contracts';
import { authenticate } from '../auth.js';
import {
  ephemeralSessionStore,
  listSupportedProviders,
  getProviderDescriptor,
  verifyNebiusApiKey,
  verifyOpenAiApiKey,
  verifyGeminiApiKey,
} from '../ai/planner.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface MeRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

export async function meRoutes(app: FastifyInstance, opts: MeRouteOpts) {
  const { config, logger } = opts;

  // GET /api/v1/me/providers/available — list supported providers in registry
  app.get('/providers/available', async (request, reply) => {
    await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const providers = listSupportedProviders().map((p) => ({
      id: p.id,
      label: p.label,
      tested: p.tested,
      requiresApiKey: p.requiresApiKey,
      description: p.description,
    }));
    return { providers };
  });

  // GET /api/v1/me/providers — list active ephemeral sessions (masked suffixes only)
  app.get('/providers', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const query = request.query as { workspaceId?: string };
    const sessions = ephemeralSessionStore.listSessions(userId, query.workspaceId);
    return { sessions };
  });

  // POST /api/v1/me/provider-session — submit ephemeral key for session
  app.post('/provider-session', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const parsed = setProviderSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid provider session payload',
          details: parsed.error.flatten(),
        },
      });
    }

    const { provider, apiKey, workspaceId } = parsed.data;
    const descriptor = getProviderDescriptor(provider);

    if (!descriptor) {
      return reply.code(400).send({
        error: {
          code: 'unknown_provider',
          message: `Provider "${provider}" is not recognized.`,
        },
      });
    }

    if (!descriptor.tested) {
      return reply.code(422).send({
        error: {
          code: 'unsupported_provider',
          message: `Provider "${descriptor.label}" (${provider}) is not yet supported in this release slice.`,
        },
      });
    }

    try {
      const session = ephemeralSessionStore.setSession(userId, provider, apiKey, workspaceId);
      logger.info(
        { userId, provider: session.provider, keySuffix: session.keySuffix },
        'ephemeral provider session established',
      );

      // Return session metadata without secret
      return reply.code(200).send({
        session: {
          provider: session.provider,
          keySuffix: session.keySuffix,
          status: session.status,
          workspaceId: session.workspaceId,
          createdAt: session.createdAt,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({
        error: {
          code: 'session_error',
          message: msg,
        },
      });
    }
  });

  // DELETE /api/v1/me/provider-session/:provider — revoke ephemeral key
  app.delete('/provider-session/:provider', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const params = request.params as { provider: string };
    const query = request.query as { workspaceId?: string };

    const deleted = ephemeralSessionStore.deleteSession(userId, params.provider, query.workspaceId);
    logger.info(
      { userId, provider: params.provider, deleted },
      'ephemeral provider session revoked',
    );

    return reply.code(204).send();
  });

  // POST /api/v1/me/provider-test — validate credentials for a provider
  app.post('/provider-test', async (request, reply) => {
    await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const parsed = setProviderSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid test payload',
          details: parsed.error.flatten(),
        },
      });
    }

    const { provider, apiKey } = parsed.data;
    const descriptor = getProviderDescriptor(provider);

    if (!descriptor) {
      return reply.code(400).send({
        error: {
          code: 'unknown_provider',
          message: `Provider "${provider}" is not recognized.`,
        },
      });
    }

    if (!descriptor.tested) {
      return reply.code(422).send({
        error: {
          code: 'unsupported_provider',
          message: `Provider "${descriptor.label}" (${provider}) is not yet validated in this release slice.`,
        },
      });
    }

    if (descriptor.requiresApiKey) {
      const trimmed = (apiKey || '').trim();
      if (!trimmed || trimmed.length < 8) {
        return reply.code(400).send({
          error: {
            code: 'invalid_key',
            message: 'API key format is invalid or too short.',
          },
        });
      }
    }

    if (provider === 'nebius') {
      try {
        await verifyNebiusApiKey(
          apiKey || '',
          config.nebiusBaseUrl,
          config.nebiusModelId,
        );
      } catch (err) {
        const error = err as { code?: string; message?: string };
        const status =
          error.code === 'ai_auth_error'
            ? 401
            : error.code === 'ai_rate_limit'
              ? 429
              : error.code === 'ai_model_not_found'
                ? 422
                : 502;
        return reply.code(status).send({
          error: {
            code: error.code || 'provider_check_failed',
            message: error.message || 'Could not verify Nebius Token Factory credentials.',
          },
        });
      }
    } else if (provider === 'openai') {
      try {
        await verifyOpenAiApiKey(
          apiKey || '',
          config.openaiModel || 'gpt-4o',
          config.openaiBaseUrl || 'https://api.openai.com/v1',
        );
      } catch (err) {
        const error = err as { code?: string; message?: string };
        const status =
          error.code === 'ai_auth_error'
            ? 401
            : error.code === 'ai_rate_limit'
              ? 429
              : error.code === 'ai_model_not_found'
                ? 422
                : 502;
        return reply.code(status).send({
          error: {
            code: error.code || 'provider_check_failed',
            message: error.message || 'Could not verify OpenAI credentials.',
          },
        });
      }
    } else if (provider === 'gemini') {
      try {
        await verifyGeminiApiKey(
          apiKey || '',
          config.aiModel || 'gemini-3.8-flash',
        );
      } catch (err) {
        const error = err as { code?: string; message?: string };
        const status =
          error.code === 'ai_auth_error'
            ? 401
            : error.code === 'ai_rate_limit'
              ? 429
              : error.code === 'ai_model_not_found'
                ? 422
                : 502;
        return reply.code(status).send({
          error: {
            code: error.code || 'provider_check_failed',
            message: error.message || 'Could not verify Google Gemini credentials.',
          },
        });
      }
    } else if (provider === 'mock') {
      // Mock fixture passes immediately
    } else {
      return reply.code(422).send({
        error: {
          code: 'unsupported_provider',
          message: `Provider "${provider}" is not supported. Supported providers are "nebius" (default), "openai" (BYOK), and "gemini" (BYOK).`,
        },
      });
    }

    return reply.code(200).send({
      ok: true,
      provider,
      message: `Credentials for "${descriptor.label}" verified successfully.`,
    });
  });
}

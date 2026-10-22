/**
 * Model Catalog & Role Preferences Routes (/api/v1/models)
 * Provides dynamic model discovery via live Nebius Token Factory GET /v1/models.
 * Scoped strictly to the authenticated account's credentials and workspace authorization.
 * Supports manual catalog refresh and strict live catalog validation before preference persistence.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { modelPreferencesSchema, type ModelCatalogResponse } from '@projectpilot/contracts';
import { hasPermission } from '@projectpilot/domain';
import { authenticate } from '../auth.js';
import { ephemeralSessionStore } from '../ai/planner.js';
import { modelCatalogService } from '../ai/model-catalog.js';
import { workspaceMembers } from '../db/schema.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface ModelRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

/** Check user's role in a workspace, returning null if not a member. */
async function getMemberRole(db: Database, workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return member?.role ?? null;
}

export async function modelRoutes(app: FastifyInstance, opts: ModelRouteOpts) {
  const { config, db, logger } = opts;

  // GET /api/v1/models/catalog — live discovery from Nebius Token Factory
  app.get('/catalog', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const query = request.query as {
      refresh?: string;
      provider?: string;
      workspaceId?: string;
    };

    const provider = query.provider || 'nebius';
    if (provider !== 'nebius') {
      return reply.code(400).send({
        error: {
          code: 'unsupported_catalog_provider',
          message: `Dynamic model discovery is currently configured for Nebius Token Factory (hackathon path). Provider "${provider}" does not support catalog discovery.`,
        },
      });
    }

    // Verify workspace membership if workspaceId is provided
    if (query.workspaceId) {
      const role = await getMemberRole(db, query.workspaceId, userId);
      if (!role) {
        return reply.code(404).send({
          error: {
            code: 'workspace_not_found',
            message: 'Workspace not found or access denied.',
          },
        });
      }
    }

    // Determine credential to use: ephemeral session key takes precedence, otherwise server default
    const sessionKey = query.workspaceId
      ? ephemeralSessionStore.getSessionKey(userId, 'nebius', query.workspaceId)
      : ephemeralSessionStore.getSessionKey(userId, 'nebius');

    const effectiveApiKey = sessionKey || config.nebiusApiKey;

    if (!effectiveApiKey || effectiveApiKey.trim().length === 0) {
      return reply.code(401).send({
        error: {
          code: 'nebius_credentials_missing',
          message:
            'No Nebius Token Factory API key configured. Provide an ephemeral Nebius API key in Settings or set NEBIUS_API_KEY in the server environment.',
        },
      });
    }

    const forceRefresh = query.refresh === 'true' || query.refresh === '1';

    try {
      const catalog = await modelCatalogService.fetchCatalog(
        effectiveApiKey,
        config.nebiusBaseUrl,
        {
          forceRefresh,
        },
      );

      logger.info(
        {
          userId,
          workspaceId: query.workspaceId,
          forceRefresh,
          cached: catalog.cached,
          totalModels: catalog.models.length,
          nemotronModels: catalog.nemotronModels.length,
        },
        'model catalog discovered successfully',
      );

      return reply.code(200).send(catalog);
    } catch (err: unknown) {
      logger.error({ err, userId }, 'failed to discover models from Nebius Token Factory');
      const errorObj = err as { code?: string; message?: string };
      const statusCode =
        errorObj.code === 'ai_auth_error'
          ? 401
          : errorObj.code === 'ai_rate_limit'
            ? 429
            : errorObj.code === 'ai_timeout'
              ? 504
              : 502;

      return reply.code(statusCode).send({
        error: {
          code: errorObj.code || 'model_catalog_fetch_failed',
          message:
            errorObj.message ||
            'Could not retrieve live model catalog from Nebius Token Factory. Please check connectivity and credentials.',
        },
      });
    }
  });

  // GET /api/v1/models/preferences — retrieve model & role routing preferences
  app.get('/preferences', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const query = request.query as { workspaceId?: string };

    let prefKey = userId;
    if (query.workspaceId) {
      const role = await getMemberRole(db, query.workspaceId, userId);
      if (!role) {
        return reply.code(404).send({
          error: {
            code: 'workspace_not_found',
            message: 'Workspace not found or access denied.',
          },
        });
      }
      prefKey = query.workspaceId;
    }

    const prefs = modelCatalogService.getPreferences(prefKey) || {};
    return reply.code(200).send({
      preferences: prefs,
    });
  });

  // POST /api/v1/models/preferences — save model & role routing preferences
  app.post('/preferences', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);
    const query = request.query as { workspaceId?: string };

    let prefKey = userId;
    let effectiveApiKey =
      ephemeralSessionStore.getSessionKey(userId, 'nebius') || config.nebiusApiKey;

    if (query.workspaceId) {
      const role = await getMemberRole(db, query.workspaceId, userId);
      if (!role) {
        return reply.code(404).send({
          error: {
            code: 'workspace_not_found',
            message: 'Workspace not found or access denied.',
          },
        });
      }

      if (!hasPermission(role, 'workspace:update') && !hasPermission(role, 'ai:generate')) {
        return reply.code(403).send({
          error: {
            code: 'forbidden',
            message: 'Insufficient permission to update workspace model preferences.',
          },
        });
      }

      prefKey = query.workspaceId;
      const sessionKey =
        ephemeralSessionStore.getSessionKey(userId, 'nebius', query.workspaceId) ||
        ephemeralSessionStore.getSessionKey(userId, 'nebius');
      effectiveApiKey = sessionKey || config.nebiusApiKey;
    }

    const parsed = modelPreferencesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid model preferences payload',
          details: parsed.error.flatten(),
        },
      });
    }

    const { selectedModelId, selectedRoleProfile, customRoleAssignments } = parsed.data;

    // Validate against live catalog using the exact credential that will make inference calls
    if (!effectiveApiKey || effectiveApiKey.trim().length === 0) {
      return reply.code(422).send({
        error: {
          code: 'nebius_credentials_missing',
          message:
            'Cannot save model preferences: Nebius Token Factory API key is not configured on the server or in active session. A live catalog check is required before persisting preferences.',
        },
      });
    }

    let catalog: ModelCatalogResponse;
    try {
      catalog = await modelCatalogService.fetchCatalog(effectiveApiKey, config.nebiusBaseUrl);
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      const statusCode =
        errorObj.code === 'ai_auth_error' ? 401 : errorObj.code === 'ai_rate_limit' ? 429 : 502;
      return reply.code(statusCode).send({
        error: {
          code: errorObj.code || 'catalog_validation_failed',
          message: `Model preferences could not be validated against the live Nebius Token Factory catalog: ${errorObj.message || 'Catalog validation failed.'}`,
        },
      });
    }

    // Validate selectedModelId against live catalog
    if (selectedModelId) {
      const found = catalog.models.some((m) => m.id === selectedModelId);
      if (!found) {
        return reply.code(422).send({
          error: {
            code: 'model_not_in_catalog',
            message: `Model ID "${selectedModelId}" is not present in the live Nebius Token Factory catalog for your account. Please select a listed model.`,
          },
        });
      }
    }

    // Validate customRoleAssignments against live catalog
    if (customRoleAssignments) {
      for (const [roleName, modelId] of Object.entries(customRoleAssignments)) {
        if (modelId) {
          const found = catalog.models.some((m) => m.id === modelId);
          if (!found) {
            return reply.code(422).send({
              error: {
                code: 'model_not_in_catalog',
                message: `Model ID "${modelId}" assigned to role "${roleName}" is not present in the live Nebius Token Factory catalog for your account.`,
              },
            });
          }
        }
      }
    }

    // Only persist after successful validation
    modelCatalogService.setPreferences(prefKey, {
      selectedModelId,
      selectedRoleProfile,
      customRoleAssignments,
    });

    logger.info(
      { userId, prefKey, selectedModelId, selectedRoleProfile },
      'model preferences updated',
    );

    return reply.code(200).send({
      ok: true,
      preferences: modelCatalogService.getPreferences(prefKey),
    });
  });
}

import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads .env from current working directory or monorepo root if present.
 */
export function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(candidate);
          break;
        }
      } catch {
        // Ignore parsing errors or already loaded
      }
    }
  }
}

export function parseCorsOrigins(raw?: string): string[] | string | boolean {
  if (!raw || raw.trim() === '') {
    return 'http://localhost:5173';
  }
  const trimmed = raw.trim();
  if (trimmed === '*') return true;
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'http://localhost:5173';
  if (parts.length === 1) return parts[0]!;
  return parts;
}

const INSECURE_SECRET_PLACEHOLDERS = new Set([
  'dev-secret-key-change-in-production-at-least-32-chars',
  'projectpilot_session_secret_32chars_min_length!',
  'replace_with_a_secure_session_secret_at_least_32_chars_long',
  'replace_with_a_secure_jwt_secret_at_least_32_chars_long',
  'replace_with_a_secure_session_secret',
]);

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: string;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly sessionCookieName: string;
  readonly corsOrigin: string[] | string | boolean;
  readonly aiProvider: string;
  readonly nebiusApiKey: string;
  readonly nebiusModelId: string;
  readonly nebiusBaseUrl: string;
  readonly nebiusJobsApiKey?: string;
  readonly nebiusJobsEndpoint?: string;
  readonly nebiusJobsRegion?: string;
  readonly nebiusJobsProjectId?: string;
  readonly nebiusCatalogTtlMs: number;
  readonly openaiApiKey?: string;
  readonly openaiModel?: string;
  readonly openaiBaseUrl?: string;
  readonly aiApiKey: string;
  readonly aiModel: string;
  readonly logLevel: string;
  readonly logRedact: boolean;
}

export function loadConfig(): AppConfig {
  loadEnv();
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const isProd = nodeEnv === 'production';

  // 1. Secret reconciliation (JWT_SECRET or SESSION_SECRET)
  const rawSecret = process.env['JWT_SECRET'] || process.env['SESSION_SECRET'];
  let jwtSecret: string;
  if (!rawSecret) {
    if (isProd) {
      throw new Error(
        'Missing required environment variable: JWT_SECRET (or SESSION_SECRET) must be set in production.',
      );
    }
    jwtSecret = 'dev-secret-key-change-in-production-at-least-32-chars';
  } else {
    if (isProd) {
      if (rawSecret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters long in production.');
      }
      if (INSECURE_SECRET_PLACEHOLDERS.has(rawSecret.trim())) {
        throw new Error(
          'JWT_SECRET must not use insecure default placeholders in production. Provide a unique cryptographically secure secret.',
        );
      }
    }
    jwtSecret = rawSecret;
  }

  // 2. Database URL
  const databaseUrl =
    process.env['DATABASE_URL'] ||
    (isProd
      ? (() => {
          throw new Error('Missing required environment variable: DATABASE_URL');
        })()
      : 'postgresql://postgres:postgres@localhost:5432/projectpilot');

  // Hosting platforms such as Render inject PORT at runtime. It must take
  // precedence over the Docker/local API_PORT default.
  const portStr = process.env['PORT'] || process.env['API_PORT'] || (isProd ? '4000' : '3001');

  // 4. Host
  const host = process.env['API_HOST'] || '0.0.0.0';

  // 5. Session cookie
  const sessionCookieName = process.env['SESSION_COOKIE_NAME'] || 'pp_session';

  // 6. CORS Origin
  const corsOrigin = parseCorsOrigins(
    process.env['CORS_ORIGIN'] ||
      (isProd && process.env['RENDER_EXTERNAL_HOSTNAME']
        ? `https://${process.env['RENDER_EXTERNAL_HOSTNAME']}`
        : isProd
          ? 'http://localhost,http://localhost:80'
          : 'http://localhost:5173'),
  );

  // 7. AI Provider: default to nebius (NVIDIA Nemotron via Nebius Token Factory)
  const aiProvider = (
    process.env['AI_PROVIDER'] ||
    process.env['PLANNER_PROVIDER'] ||
    'nebius'
  ).toLowerCase();

  // 8. Nebius Token Factory API Key (server-side default, never leaked to client)
  const nebiusApiKey =
    process.env['NEBIUS_API_KEY'] || process.env['NEBIUS_TOKEN_FACTORY_API_KEY'] || '';

  // 9. NVIDIA Open-Source Model on Nebius Token Factory (dynamically discovered from live catalog)
  const nebiusModelId =
    process.env['NEBIUS_MODEL_ID'] || process.env['NEBIUS_TOKEN_FACTORY_MODEL_ID'] || '';

  // 10. Nebius Token Factory Base URL
  const nebiusBaseUrl = (
    process.env['NEBIUS_BASE_URL'] ||
    process.env['NEBIUS_TOKEN_FACTORY_BASE_URL'] ||
    'https://api.tokenfactory.nebius.com/v1'
  ).replace(/\/+$/, '');

  // 11. Nebius Serverless Jobs & Catalog Cache TTL
  // Cloud jobs require dedicated Nebius AI Cloud control-plane IAM credentials.
  // Strictly avoid using the Token Factory inference key as a fallback.
  const nebiusJobsApiKey = process.env['NEBIUS_JOBS_API_KEY'] || '';
  const nebiusJobsEndpoint = process.env['NEBIUS_JOBS_ENDPOINT'] || '';
  const nebiusJobsRegion = process.env['NEBIUS_REGION'] || '';
  const nebiusJobsProjectId = process.env['NEBIUS_PROJECT_ID'] || '';
  const nebiusCatalogTtlMs = parseInt(process.env['NEBIUS_CATALOG_TTL_MS'] || '300000', 10);

  // 12. Optional server-side BYOK fallback configuration for development/testing
  const openaiApiKey = process.env['OPENAI_API_KEY'] || '';
  const openaiModel = process.env['OPENAI_MODEL'] || 'gpt-4o';
  const openaiBaseUrl = process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1';
  const aiApiKey =
    process.env['AI_API_KEY'] || (aiProvider === 'openai' ? openaiApiKey : nebiusApiKey);
  const aiModel =
    process.env['AI_MODEL'] || (aiProvider === 'openai' ? openaiModel : nebiusModelId);

  // 13. Logging
  const logLevel = process.env['LOG_LEVEL'] || 'info';
  const logRedact = process.env['LOG_REDACT'] !== 'false';

  return {
    port: parseInt(portStr, 10),
    host,
    nodeEnv,
    databaseUrl,
    jwtSecret,
    sessionCookieName,
    corsOrigin,
    aiProvider,
    nebiusApiKey,
    nebiusModelId,
    nebiusBaseUrl,
    nebiusJobsApiKey,
    nebiusJobsEndpoint,
    nebiusJobsRegion,
    nebiusJobsProjectId,
    nebiusCatalogTtlMs,
    openaiApiKey,
    openaiModel,
    openaiBaseUrl,
    aiApiKey,
    aiModel,
    logLevel,
    logRedact,
  };
}

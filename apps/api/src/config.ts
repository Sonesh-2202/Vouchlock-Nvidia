import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads .env from current working directory or monorepo root if present.
 */
export function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../.env'),
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
  readonly aiProvider: 'mock' | 'openai' | 'anthropic' | 'gemini';
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

  // 3. Port reconciliation (API_PORT or PORT, default 4000 in prod, 3001 in dev)
  const portStr = process.env['API_PORT'] || process.env['PORT'] || (isProd ? '4000' : '3001');

  // 4. Host
  const host = process.env['API_HOST'] || '0.0.0.0';

  // 5. Session cookie
  const sessionCookieName = process.env['SESSION_COOKIE_NAME'] || 'pp_session';

  // 6. CORS Origin
  const corsOrigin = parseCorsOrigins(
    process.env['CORS_ORIGIN'] ||
      (isProd ? 'http://localhost,http://localhost:80' : 'http://localhost:5173'),
  );

  // 7. AI Provider reconciliation (AI_PROVIDER or PLANNER_PROVIDER)
  const rawProvider = (
    process.env['AI_PROVIDER'] ||
    process.env['PLANNER_PROVIDER'] ||
    'gemini'
  ).toLowerCase();
  const aiProvider = (
    rawProvider === 'openai' || rawProvider === 'anthropic' || rawProvider === 'gemini'
      ? rawProvider
      : 'gemini'
  ) as 'mock' | 'openai' | 'anthropic' | 'gemini';

  // 8. AI API Key reconciliation (GEMINI_API_KEY, AI_API_KEY or OPENAI_API_KEY)
  const aiApiKey =
    process.env['GEMINI_API_KEY'] ||
    process.env['AI_API_KEY'] ||
    process.env['OPENAI_API_KEY'] ||
    '';

  // 9. AI Model reconciliation (AI_MODEL or OPENAI_MODEL)
  const aiModel =
    process.env['AI_MODEL'] ||
    process.env['OPENAI_MODEL'] ||
    (aiProvider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o');

  // 10. Logging
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
    aiApiKey,
    aiModel,
    logLevel,
    logRedact,
  };
}

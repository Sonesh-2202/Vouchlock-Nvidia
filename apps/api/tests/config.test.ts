/**
 * Unit tests for API config and logger modules.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, loadEnv, parseCorsOrigins } from '../src/config.js';
import { createLogger } from '../src/logger.js';

describe('API Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('loads valid default configurations', () => {
    const config = loadConfig();
    expect(config.port).toBeTypeOf('number');
    expect(config.host).toBe('0.0.0.0');
    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(16);
    expect(config.sessionCookieName).toBe('pp_session');
    expect(config.logRedact).toBe(true);
  });

  test('loadEnv executes safely without crashing', () => {
    expect(() => loadEnv()).not.toThrow();
  });

  test('parses comma-separated CORS origins into an array', () => {
    expect(parseCorsOrigins('http://localhost,http://localhost:80')).toEqual([
      'http://localhost',
      'http://localhost:80',
    ]);
    expect(parseCorsOrigins('*')).toBe(true);
    expect(parseCorsOrigins('http://example.com')).toBe('http://example.com');
  });

  test('reconciles PORT and API_PORT environment variables', () => {
    process.env['PORT'] = '4000';
    delete process.env['API_PORT'];
    const config = loadConfig();
    expect(config.port).toBe(4000);

    process.env['API_PORT'] = '4500';
    delete process.env['PORT'];
    const config2 = loadConfig();
    expect(config2.port).toBe(4500);
  });

  test('reconciles SESSION_SECRET as alias for JWT_SECRET', () => {
    delete process.env['JWT_SECRET'];
    process.env['SESSION_SECRET'] = 'custom-session-secret-longer-than-32-chars-for-test';
    const config = loadConfig();
    expect(config.jwtSecret).toBe('custom-session-secret-longer-than-32-chars-for-test');
  });

  test('rejects missing or insecure secret in production mode', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['JWT_SECRET'];
    delete process.env['SESSION_SECRET'];
    expect(() => loadConfig()).toThrow(/Missing required environment variable/);

    process.env['JWT_SECRET'] = 'short';
    expect(() => loadConfig()).toThrow(/at least 32 characters/);

    process.env['JWT_SECRET'] = 'replace_with_a_secure_session_secret_at_least_32_chars_long';
    expect(() => loadConfig()).toThrow(/insecure default placeholders/);
  });

  test('reconciles PLANNER_PROVIDER and OPENAI_API_KEY aliases', () => {
    process.env['PLANNER_PROVIDER'] = 'openai';
    delete process.env['AI_PROVIDER'];
    process.env['OPENAI_API_KEY'] = 'sk-mock-key';
    delete process.env['AI_API_KEY'];
    process.env['OPENAI_MODEL'] = 'gpt-4o-mini';
    delete process.env['AI_MODEL'];

    const config = loadConfig();
    expect(config.aiProvider).toBe('openai');
    expect(config.aiApiKey).toBe('sk-mock-key');
    expect(config.aiModel).toBe('gpt-4o-mini');
  });
});

describe('Logger Redaction', () => {
  test('creates logger with configured redact paths', () => {
    const logger = createLogger('silent', ['password', 'token', 'secret']);
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

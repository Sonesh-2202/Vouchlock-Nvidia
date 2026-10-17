/**
 * Unit tests for Provider Registry and Ephemeral BYOK Session Management.
 * Verifies key masking, isolation, provider gating, and secret redaction.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  PROVIDER_REGISTRY,
  getProviderDescriptor,
  isProviderTested,
  listSupportedProviders,
  getAiProvider,
  AiProviderAuthError,
  AiProviderError,
  ephemeralSessionStore,
} from '../src/ai/planner.js';

describe('Provider Registry', () => {
  test('contains registered providers with accurate readiness descriptors', () => {
    expect(PROVIDER_REGISTRY.mock.tested).toBe(true);
    expect(PROVIDER_REGISTRY.mock.requiresApiKey).toBe(false);

    expect(PROVIDER_REGISTRY.openai.tested).toBe(true);
    expect(PROVIDER_REGISTRY.openai.requiresApiKey).toBe(true);

    expect(PROVIDER_REGISTRY.anthropic.tested).toBe(false);
    expect(PROVIDER_REGISTRY.anthropic.requiresApiKey).toBe(true);
  });

  test('getProviderDescriptor returns descriptor for valid providers and undefined for unknown', () => {
    expect(getProviderDescriptor('mock')?.id).toBe('mock');
    expect(getProviderDescriptor('openai')?.id).toBe('openai');
    expect(getProviderDescriptor('anthropic')?.id).toBe('anthropic');
    expect(getProviderDescriptor('unknown-llm')).toBeUndefined();
  });

  test('isProviderTested accurately gates unvalidated providers', () => {
    expect(isProviderTested('mock')).toBe(true);
    expect(isProviderTested('openai')).toBe(true);
    expect(isProviderTested('anthropic')).toBe(false);
    expect(isProviderTested('unknown')).toBe(false);
  });

  test('listSupportedProviders includes all descriptors', () => {
    const list = listSupportedProviders();
    expect(list.length).toBeGreaterThanOrEqual(3);
    const ids = list.map((p) => p.id);
    expect(ids).toContain('mock');
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
  });

  test('getAiProvider throws unknown_provider on arbitrary provider string', () => {
    expect(() => getAiProvider('cohere')).toThrow(AiProviderError);
    try {
      getAiProvider('cohere');
    } catch (err) {
      const e = err as AiProviderError;
      expect(e.code).toBe('unknown_provider');
    }
  });

  test('getAiProvider throws unsupported_provider on unvalidated anthropic adapter', () => {
    expect(() => getAiProvider('anthropic')).toThrow(AiProviderError);
    try {
      getAiProvider('anthropic');
    } catch (err) {
      const e = err as AiProviderError;
      expect(e.code).toBe('unsupported_provider');
    }
  });
});

describe('Ephemeral BYOK Store', () => {
  beforeEach(() => {
    ephemeralSessionStore.clearAll();
  });

  const userA = 'user-uuid-1111';
  const userB = 'user-uuid-2222';
  const workspaceA = 'workspace-uuid-aaaa';
  const workspaceB = 'workspace-uuid-bbbb';

  test('stores ephemeral session and returns masked suffix, NEVER plaintext key', () => {
    const rawKey = 'sk-proj-super-secret-key-1234abcd';
    const result = ephemeralSessionStore.setSession(userA, 'openai', rawKey, workspaceA);

    expect(result.provider).toBe('openai');
    expect(result.keySuffix).toBe('...abcd');
    expect(result.status).toBe('active');
    expect(result.workspaceId).toBe(workspaceA);
    // Plaintext key must NOT be on result object
    expect((result as Record<string, unknown>).apiKey).toBeUndefined();
  });

  test('enforces user and workspace scoping', () => {
    const rawKeyA = 'sk-key-for-workspace-a-1234';
    const rawKeyB = 'sk-key-for-workspace-b-5678';

    ephemeralSessionStore.setSession(userA, 'openai', rawKeyA, workspaceA);
    ephemeralSessionStore.setSession(userA, 'openai', rawKeyB, workspaceB);

    // User A in workspace A gets key A
    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceA)).toBe(rawKeyA);
    // User A in workspace B gets key B
    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceB)).toBe(rawKeyB);
    // User B cannot access User A's keys
    expect(ephemeralSessionStore.getSessionKey(userB, 'openai', workspaceA)).toBeUndefined();
    expect(ephemeralSessionStore.getSessionKey(userB, 'openai', workspaceB)).toBeUndefined();
  });

  test('listSessions never includes key material', () => {
    ephemeralSessionStore.setSession(userA, 'openai', 'sk-secret-12345678', workspaceA);
    const sessions = ephemeralSessionStore.listSessions(userA, workspaceA);

    expect(sessions.length).toBe(1);
    expect(sessions[0]!.provider).toBe('openai');
    expect(sessions[0]!.keySuffix).toBe('...5678');
    expect((sessions[0] as Record<string, unknown>).apiKey).toBeUndefined();
  });

  test('rejects unvalidated providers in ephemeral session', () => {
    expect(() => ephemeralSessionStore.setSession(userA, 'anthropic', 'sk-ant-test')).toThrow(
      AiProviderError,
    );

    try {
      ephemeralSessionStore.setSession(userA, 'anthropic', 'sk-ant-test');
    } catch (err) {
      const e = err as AiProviderError;
      expect(e.code).toBe('unsupported_provider');
    }
  });

  test('deleteSession removes the key from memory', () => {
    ephemeralSessionStore.setSession(userA, 'openai', 'sk-secret-12345678', workspaceA);
    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceA)).toBe(
      'sk-secret-12345678',
    );

    const deleted = ephemeralSessionStore.deleteSession(userA, 'openai', workspaceA);
    expect(deleted).toBe(true);
    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceA)).toBeUndefined();
  });

  test('clearUserSessions clears all keys for that user only', () => {
    ephemeralSessionStore.setSession(userA, 'openai', 'sk-user-a', workspaceA);
    ephemeralSessionStore.setSession(userB, 'openai', 'sk-user-b', workspaceA);

    ephemeralSessionStore.clearUserSessions(userA);

    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceA)).toBeUndefined();
    expect(ephemeralSessionStore.getSessionKey(userB, 'openai', workspaceA)).toBe('sk-user-b');
  });

  test('getAiProvider resolves with ephemeral session key when provided', () => {
    // When config has no key, but session key is supplied, provider is created
    const provider = getAiProvider(
      { aiProvider: 'openai', aiApiKey: '', aiModel: 'gpt-4o' } as any,
      undefined,
      'sk-ephemeral-session-key',
    );
    expect(provider.id).toBe('openai');
  });

  test('encryptCredential and decryptCredential perform authenticated AES-256-GCM round-trip', async () => {
    const { encryptCredential, decryptCredential } = await import('../src/ai/ephemeral-store.js');
    const secretKey = 'sk-test-super-secret-api-key-for-gcm-verification';
    const encrypted = encryptCredential(secretKey);

    expect(encrypted).not.toBe(secretKey);
    expect(encrypted).not.toContain(secretKey);

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(secretKey);
  });

  test('decryptCredential rejects tampered ciphertext or altered auth tag', async () => {
    const { encryptCredential, decryptCredential } = await import('../src/ai/ephemeral-store.js');
    const secretKey = 'sk-test-super-secret-key';
    const encrypted = encryptCredential(secretKey);

    const buffer = Buffer.from(encrypted, 'base64');
    // Tamper with the last byte of ciphertext
    buffer[buffer.length - 1] = buffer[buffer.length - 1]! ^ 0xff;
    const tampered = buffer.toString('base64');

    expect(() => decryptCredential(tampered)).toThrow();
  });

  test('key rotation updates the stored encrypted key and suffix without lingering old key', () => {
    const initialKey = 'sk-old-initial-key-1111';
    const rotatedKey = 'sk-new-rotated-key-9999';

    const first = ephemeralSessionStore.setSession(userA, 'openai', initialKey, workspaceA);
    expect(first.keySuffix).toBe('...1111');
    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceA)).toBe(initialKey);

    // Rotate
    const second = ephemeralSessionStore.setSession(userA, 'openai', rotatedKey, workspaceA);
    expect(second.keySuffix).toBe('...9999');
    expect(ephemeralSessionStore.getSessionKey(userA, 'openai', workspaceA)).toBe(rotatedKey);

    // Only one active session exists for this provider/workspace
    const sessions = ephemeralSessionStore.listSessions(userA, workspaceA);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.keySuffix).toBe('...9999');
  });
});

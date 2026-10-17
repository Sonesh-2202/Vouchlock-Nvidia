/**
 * Ephemeral Provider Session Store
 * Secure in-memory storage for user BYOK credentials.
 * Credentials are encrypted using authenticated AES-256-GCM with server-side secrets
 * and are strictly session-scoped. Plaintext keys are never persisted to database,
 * localStorage, cookies, analytics, or log files.
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { getProviderDescriptor, isProviderTested } from './registry.js';
import { AiProviderError } from './types.js';

export function resolveEncryptionKey(secretOverride?: string): Buffer {
  const secret =
    secretOverride ||
    process.env['ENCRYPTION_SECRET'] ||
    process.env['JWT_SECRET'] ||
    process.env['SESSION_SECRET'] ||
    'vouchlock-default-fallback-encryption-secret-32-chars-minimum!';
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypt credential using authenticated AES-256-GCM.
 * Output payload structure: base64(IV[12] + AuthTag[16] + Ciphertext)
 */
export function encryptCredential(plaintext: string, secretOverride?: string): string {
  const key = resolveEncryptionKey(secretOverride);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt credential using authenticated AES-256-GCM.
 * Validates integrity via AuthTag before returning plaintext.
 */
export function decryptCredential(packedBase64: string, secretOverride?: string): string {
  const key = resolveEncryptionKey(secretOverride);
  const buffer = Buffer.from(packedBase64, 'base64');
  if (buffer.length < 28) {
    throw new Error('Invalid encrypted credential payload: too short');
  }
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

export interface EphemeralSessionRecord {
  readonly userId: string;
  readonly workspaceId?: string;
  readonly provider: string;
  readonly encryptedKey: string;
  readonly keySuffix: string;
  readonly status: 'active';
  readonly createdAt: Date;
}

export interface EphemeralSessionPublic {
  readonly provider: string;
  readonly keySuffix: string;
  readonly status: 'active';
  readonly workspaceId?: string;
  readonly createdAt: string;
}

class EphemeralStore {
  // Key format: `${userId}:${workspaceId ?? '*'}:${provider}`
  private store = new Map<string, EphemeralSessionRecord>();
  public readonly sessionTtlMs = 24 * 60 * 60 * 1000; // 24-hour explicit expiry

  private buildKey(userId: string, provider: string, workspaceId?: string): string {
    return `${userId}:${workspaceId ?? '*'}:${provider.toLowerCase().trim()}`;
  }

  private isExpired(record: EphemeralSessionRecord): boolean {
    return Date.now() - record.createdAt.getTime() > this.sessionTtlMs;
  }

  /**
   * Save an ephemeral API key for the current user session.
   * Encrypts the key using authenticated AES-256-GCM before storing in memory.
   * Never echoes the full key back.
   */
  public setSession(
    userId: string,
    provider: string,
    apiKey: string,
    workspaceId?: string,
  ): EphemeralSessionPublic {
    const normalizedProvider = provider.toLowerCase().trim();
    const descriptor = getProviderDescriptor(normalizedProvider);

    if (!descriptor) {
      throw new AiProviderError(
        `Unknown provider: "${provider}". Must be one of configured providers.`,
        'unknown_provider',
        false,
      );
    }

    if (!descriptor.tested) {
      throw new AiProviderError(
        `Provider "${provider}" is not yet validated in this release slice.`,
        'unsupported_provider',
        false,
      );
    }

    const trimmedKey = apiKey.trim();
    if (descriptor.requiresApiKey && trimmedKey.length === 0) {
      throw new AiProviderError(
        `API key is required for provider "${provider}".`,
        'missing_credentials',
        false,
      );
    }

    const keySuffix = trimmedKey.length >= 4 ? `...${trimmedKey.slice(-4)}` : '...****';
    const encryptedKey = encryptCredential(trimmedKey);

    const record: EphemeralSessionRecord = {
      userId,
      workspaceId,
      provider: normalizedProvider,
      encryptedKey,
      keySuffix,
      status: 'active',
      createdAt: new Date(),
    };

    const key = this.buildKey(userId, normalizedProvider, workspaceId);
    this.store.set(key, record);

    return {
      provider: record.provider,
      keySuffix: record.keySuffix,
      status: record.status,
      workspaceId: record.workspaceId,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Retrieve active ephemeral key for provider resolution.
   * Checks workspace-scoped key first, falls back to user default if available.
   * Decrypts authenticated ciphertext on demand.
   * Automatically prunes expired sessions.
   */
  public getSessionKey(userId: string, provider: string, workspaceId?: string): string | undefined {
    const normalizedProvider = provider.toLowerCase().trim();

    if (workspaceId) {
      const scopedKey = this.buildKey(userId, normalizedProvider, workspaceId);
      const scoped = this.store.get(scopedKey);
      if (scoped) {
        if (this.isExpired(scoped)) {
          this.store.delete(scopedKey);
        } else {
          return decryptCredential(scoped.encryptedKey);
        }
      }
    }

    const unscopedKey = this.buildKey(userId, normalizedProvider, undefined);
    const unscoped = this.store.get(unscopedKey);
    if (unscoped) {
      if (this.isExpired(unscoped)) {
        this.store.delete(unscopedKey);
      } else {
        return decryptCredential(unscoped.encryptedKey);
      }
    }

    return undefined;
  }

  /**
   * List active ephemeral sessions for user without leaking secret material.
   * Prunes expired sessions during listing.
   */
  public listSessions(userId: string, workspaceId?: string): EphemeralSessionPublic[] {
    const results: EphemeralSessionPublic[] = [];
    const expiredKeys: string[] = [];

    for (const [key, record] of this.store.entries()) {
      if (record.userId !== userId) continue;
      if (this.isExpired(record)) {
        expiredKeys.push(key);
        continue;
      }
      if (workspaceId && record.workspaceId && record.workspaceId !== workspaceId) continue;

      results.push({
        provider: record.provider,
        keySuffix: record.keySuffix,
        status: record.status,
        workspaceId: record.workspaceId,
        createdAt: record.createdAt.toISOString(),
      });
    }

    for (const expiredKey of expiredKeys) {
      this.store.delete(expiredKey);
    }

    return results;
  }

  /**
   * Revoke and delete a session key from memory.
   */
  public deleteSession(userId: string, provider: string, workspaceId?: string): boolean {
    const normalizedProvider = provider.toLowerCase().trim();
    const key = this.buildKey(userId, normalizedProvider, workspaceId);
    return this.store.delete(key);
  }

  /**
   * Clear all sessions for a user on logout.
   */
  public clearUserSessions(userId: string): void {
    for (const [key, record] of this.store.entries()) {
      if (record.userId === userId) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Reset store (primarily for unit testing).
   */
  public clearAll(): void {
    this.store.clear();
  }
}

export const ephemeralSessionStore = new EphemeralStore();

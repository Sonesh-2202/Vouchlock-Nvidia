/**
 * MCP Token Store
 * Manages separate, cryptographically hashed access tokens for external MCP assistants.
 * Tokens are distinct from web session cookies and scoped strictly to user and workspace.
 * Implements persistent storage (database + disk), ownership checks, expiration, and revocation.
 */

import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { mcpTokens } from '../db/schema.js';
import { McpForbiddenError, McpError } from './types.js';

export const VALID_MCP_SCOPES = ['mcp:read', 'mcp:admin'] as const;
export type ValidMcpScope = (typeof VALID_MCP_SCOPES)[number];

export interface McpTokenRecord {
  id: string;
  userId: string;
  workspaceId: string;
  tokenHash: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
}

export interface CreatedMcpToken {
  id: string;
  token: string;
  userId: string;
  workspaceId: string;
  scopes: string[];
  expiresAt: string;
}

export interface McpTokenStoreOptions {
  storageFile?: string;
  disablePersistence?: boolean;
}

export class McpTokenStore {
  // Keyed by tokenHash (SHA-256)
  private tokensByHash = new Map<string, McpTokenRecord>();
  private storageFilePath: string | null = null;
  private disablePersistence = false;

  constructor(options?: McpTokenStoreOptions) {
    this.disablePersistence = options?.disablePersistence ?? false;
    if (!this.disablePersistence) {
      this.storageFilePath =
        options?.storageFile ??
        process.env['MCP_TOKEN_STORAGE_PATH'] ??
        path.resolve(process.cwd(), '.data/mcp-tokens.json');
      this.loadFromDisk();
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
  }

  private loadFromDisk(): void {
    if (!this.storageFilePath) return;
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.tokensByHash.clear();
          for (const item of parsed) {
            this.tokensByHash.set(item.tokenHash, {
              id: item.id,
              userId: item.userId,
              workspaceId: item.workspaceId,
              tokenHash: item.tokenHash,
              scopes: item.scopes,
              createdAt: new Date(item.createdAt),
              expiresAt: new Date(item.expiresAt),
              revokedAt: item.revokedAt ? new Date(item.revokedAt) : undefined,
              lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : undefined,
            });
          }
        }
      }
    } catch {
      // Graceful fallback to memory on corrupted or inaccessible storage
    }
  }

  private saveToDisk(): void {
    if (!this.storageFilePath || this.disablePersistence) return;
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.tokensByHash.values()).map((r) => ({
        id: r.id,
        userId: r.userId,
        workspaceId: r.workspaceId,
        tokenHash: r.tokenHash,
        scopes: r.scopes,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : undefined,
        lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : undefined,
      }));
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Non-fatal if disk write fails
    }
  }

  /**
   * Reload token state from disk to synchronize with other instances.
   */
  public syncFromStorage(): void {
    if (!this.disablePersistence) {
      this.loadFromDisk();
    }
  }

  /**
   * Create a new scoped MCP token for an external assistant.
   * Scopes are strictly validated against the declared enum.
   * Returns plaintext token once for display; only cryptographic hash is retained.
   */
  public createToken(
    userId: string,
    workspaceId: string,
    scopes: string[] = ['mcp:read'],
    ttlDays = 30,
    db?: Database,
  ): CreatedMcpToken {
    // Validate scopes against declared enum
    for (const scope of scopes) {
      if (!VALID_MCP_SCOPES.includes(scope as ValidMcpScope)) {
        throw new McpError(
          `Invalid MCP scope: "${scope}". Allowed: ${VALID_MCP_SCOPES.join(', ')}`,
          'validation_error',
          400,
        );
      }
    }

    const rawToken = `mcp_${randomBytes(24).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const id = `tok_${randomBytes(8).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const record: McpTokenRecord = {
      id,
      userId,
      workspaceId,
      tokenHash,
      scopes: [...scopes],
      createdAt: now,
      expiresAt,
    };

    this.tokensByHash.set(tokenHash, record);
    this.saveToDisk();

    // Persist to Postgres database if available
    if (db && typeof db.insert === 'function') {
      Promise.resolve(
        db.insert(mcpTokens).values({
          id,
          userId,
          workspaceId,
          tokenHash,
          scopes,
          createdAt: now,
          expiresAt,
        }),
      ).catch(() => {});
    }

    return {
      id,
      token: rawToken,
      userId,
      workspaceId,
      scopes,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Verify an incoming MCP token from Authorization: Bearer <token>.
   * Performs non-enumerating validation and updates lastUsedAt.
   */
  public verifyToken(rawToken: string, db?: Database): McpTokenRecord | null {
    if (!rawToken || !rawToken.startsWith('mcp_')) {
      return null;
    }

    this.syncFromStorage();
    const tokenHash = this.hashToken(rawToken);
    const record = this.tokensByHash.get(tokenHash);

    if (!record) {
      return null;
    }

    if (record.revokedAt) {
      return null;
    }

    if (new Date() > record.expiresAt) {
      return null;
    }

    record.lastUsedAt = new Date();
    this.saveToDisk();

    if (db) {
      Promise.resolve(
        db
          .update(mcpTokens)
          .set({ lastUsedAt: record.lastUsedAt })
          .where(eq(mcpTokens.tokenHash, tokenHash)),
      ).catch(() => {});
    }

    return record;
  }

  /**
   * Revoke a single token by raw token, token ID, or hash.
   * If callerUserId is provided, enforces ownership check to prevent cross-user revocation.
   */
  public revokeToken(targetTokenOrId: string, callerUserId?: string, db?: Database): boolean {
    this.syncFromStorage();
    let record: McpTokenRecord | undefined;

    if (targetTokenOrId.startsWith('mcp_')) {
      const hash = this.hashToken(targetTokenOrId);
      record = this.tokensByHash.get(hash);
    } else if (targetTokenOrId.startsWith('tok_')) {
      for (const r of this.tokensByHash.values()) {
        if (r.id === targetTokenOrId) {
          record = r;
          break;
        }
      }
    } else {
      record = this.tokensByHash.get(targetTokenOrId);
    }

    if (!record) return false;

    // Ownership check: Prevent cross-user token revocation
    if (callerUserId && record.userId !== callerUserId) {
      throw new McpForbiddenError('Cannot revoke MCP tokens belonging to another user');
    }

    record.revokedAt = new Date();
    this.saveToDisk();

    if (db && typeof db.update === 'function') {
      Promise.resolve(
        db
          .update(mcpTokens)
          .set({ revokedAt: record.revokedAt })
          .where(eq(mcpTokens.id, record.id)),
      ).catch(() => {});
    }

    return true;
  }

  /**
   * Revoke all active tokens for a specific user.
   */
  public revokeAllForUser(userId: string, db?: Database): number {
    this.syncFromStorage();
    let count = 0;
    const now = new Date();
    for (const record of this.tokensByHash.values()) {
      if (record.userId === userId && !record.revokedAt) {
        record.revokedAt = now;
        count++;
      }
    }
    if (count > 0) {
      this.saveToDisk();
      if (db && typeof db.update === 'function') {
        Promise.resolve(
          db
            .update(mcpTokens)
            .set({ revokedAt: now })
            .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt))),
        ).catch(() => {});
      }
    }
    return count;
  }

  /**
   * List tokens for a user (masked, for dashboard/settings display).
   */
  public listTokensForUser(
    userId: string,
    workspaceId?: string,
  ): Array<Omit<McpTokenRecord, 'tokenHash'>> {
    this.syncFromStorage();
    const results: Array<Omit<McpTokenRecord, 'tokenHash'>> = [];
    for (const record of this.tokensByHash.values()) {
      if (record.userId !== userId) continue;
      if (workspaceId && record.workspaceId !== workspaceId) continue;
      results.push({
        id: record.id,
        userId: record.userId,
        workspaceId: record.workspaceId,
        scopes: record.scopes,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
        lastUsedAt: record.lastUsedAt,
      });
    }
    return results;
  }

  /**
   * Clear in-memory cache without wiping persistent disk storage (simulates cold restart).
   */
  public clearMemory(): void {
    this.tokensByHash.clear();
  }

  /**
   * Clear all tokens (test fixture reset, wipes disk).
   */
  public clearAll(): void {
    this.tokensByHash.clear();
    this.saveToDisk();
  }
}

export const mcpTokenStore = new McpTokenStore();

/**
 * MCP Resource & Concurrency Limiter
 * Enforces per-token concurrent call limits and session rate limits.
 */

import { MCP_LIMITS, McpLimitError } from './types.js';

export interface TokenCallWindow {
  count: number;
  resetAt: number;
}

export class McpRateLimiter {
  private activeCalls = new Map<string, number>();
  private sessionWindows = new Map<string, TokenCallWindow>();
  private windowDurationMs = 60_000; // 1-minute rate limit window

  /**
   * Acquire a call slot for a token.
   * Throws McpLimitError (429) if concurrency limit or call limit is exceeded.
   */
  public acquire(tokenIdOrHash: string): void {
    const now = Date.now();

    // 1. Check concurrent call limit
    const currentConcurrent = this.activeCalls.get(tokenIdOrHash) ?? 0;
    if (currentConcurrent >= MCP_LIMITS.maxConcurrentCalls) {
      throw new McpLimitError(
        `Too many concurrent calls. Maximum allowed: ${MCP_LIMITS.maxConcurrentCalls}.`,
      );
    }

    // 2. Check call count limit in window
    let window = this.sessionWindows.get(tokenIdOrHash);
    if (!window || now > window.resetAt) {
      window = { count: 0, resetAt: now + this.windowDurationMs };
      this.sessionWindows.set(tokenIdOrHash, window);
    }

    if (window.count >= MCP_LIMITS.maxToolCallsPerSession) {
      throw new McpLimitError(
        `Session tool call limit reached (${MCP_LIMITS.maxToolCallsPerSession} calls). Try again later.`,
      );
    }

    // Increment counters
    window.count++;
    this.activeCalls.set(tokenIdOrHash, currentConcurrent + 1);
  }

  /**
   * Release a concurrent call slot upon completion or error.
   */
  public release(tokenIdOrHash: string): void {
    const current = this.activeCalls.get(tokenIdOrHash) ?? 0;
    if (current <= 1) {
      this.activeCalls.delete(tokenIdOrHash);
    } else {
      this.activeCalls.set(tokenIdOrHash, current - 1);
    }
  }

  /**
   * Get current concurrent calls for a token.
   */
  public getConcurrentCalls(tokenIdOrHash: string): number {
    return this.activeCalls.get(tokenIdOrHash) ?? 0;
  }

  /**
   * Get current call count in current window for a token.
   */
  public getCallCount(tokenIdOrHash: string): number {
    const window = this.sessionWindows.get(tokenIdOrHash);
    if (!window || Date.now() > window.resetAt) return 0;
    return window.count;
  }

  /**
   * Reset limiter state (test fixture reset).
   */
  public reset(): void {
    this.activeCalls.clear();
    this.sessionWindows.clear();
  }
}

export const mcpRateLimiter = new McpRateLimiter();

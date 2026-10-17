/**
 * MCP Server Types and Constants
 * Implements Model Context Protocol server slice definitions,
 * resource limits, and error types.
 */

import type { Database } from '../db/connection.js';

export const MCP_LIMITS = {
  connectionTimeoutMs: 10_000,
  responseBodyMaxBytes: 1_048_576, // 1 MB
  maxToolCallsPerSession: 20,
  maxRetries: 1,
  maxConcurrentCalls: 3,
} as const;

export interface McpRequestContext {
  userId: string;
  workspaceId: string;
  scopes: string[];
  signal?: AbortSignal;
}

export interface McpTool<TArgs = any, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (db: Database, context: McpRequestContext, args: TArgs) => Promise<TResult>;
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export class McpAuthError extends McpError {
  constructor(message: string = 'Authentication required') {
    super(message, 'unauthorized', 401);
    this.name = 'McpAuthError';
  }
}

export class McpForbiddenError extends McpError {
  constructor(
    message: string = 'Access denied: Resource belongs to another workspace or insufficient permissions',
  ) {
    super(message, 'forbidden', 403);
    this.name = 'McpForbiddenError';
  }
}

export class McpNotFoundError extends McpError {
  constructor(message: string = 'Resource not found') {
    super(message, 'not_found', 404);
    this.name = 'McpNotFoundError';
  }
}

export class McpLimitError extends McpError {
  constructor(message: string = 'Resource limit exceeded') {
    super(message, 'limit_exceeded', 429);
    this.name = 'McpLimitError';
  }
}

export interface McpToolCallResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

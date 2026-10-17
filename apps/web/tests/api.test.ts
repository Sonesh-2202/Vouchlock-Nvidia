/**
 * Unit tests for web API client error handling and contracts.
 */

import { describe, test, expect } from 'vitest';
import { ApiRequestError } from '../src/api.js';

describe('Web API Client Error Handling', () => {
  test('ApiRequestError captures status and structured error envelope', () => {
    const err = new ApiRequestError(404, {
      code: 'not_found',
      message: 'Workspace not found',
      details: { workspaceId: 'ws-123' },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiRequestError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Workspace not found');
    expect(err.error.code).toBe('not_found');
    expect(err.error.details).toEqual({ workspaceId: 'ws-123' });
  });

  test('ApiRequestError handles forbidden 403', () => {
    const err = new ApiRequestError(403, {
      code: 'forbidden',
      message: 'Insufficient permissions',
    });

    expect(err.status).toBe(403);
    expect(err.error.code).toBe('forbidden');
  });
});

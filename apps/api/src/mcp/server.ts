/**
 * Standard Model Context Protocol (MCP) Server Implementation
 * Uses the official TypeScript SDK (@modelcontextprotocol/sdk).
 * Implements initialization, capability negotiation, tools/list, and tools/call
 * over Streamable HTTP transport with read-only project inspection tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import type { McpRequestContext } from './types.js';
import {
  getProjectSummaryTool,
  listRequirementsTool,
  listTasksTool,
  getDeliveryReportTool,
} from './tools.js';

/**
 * Creates and initializes a standard McpServer instance bound to a request context.
 * Registers all 4 read-only Vouchlock tools with strict schema validation.
 */
export function createVouchlockMcpServer(db: Database, context: McpRequestContext): McpServer {
  const server = new McpServer(
    {
      name: 'vouchlock-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    },
  );

  // Tool 1: get_project_summary
  server.tool(
    'get_project_summary',
    'Get a high-level summary of a project including goal, status, and milestone/task/requirement counts',
    {
      projectId: z.string().describe('The unique UUID of the project'),
    },
    async (args) => {
      const result = await getProjectSummaryTool.handler(db, context, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // Tool 2: list_requirements
  server.tool(
    'list_requirements',
    'List requirements for a project with optional status filtering and pagination',
    {
      projectId: z.string().describe('The unique UUID of the project'),
      status: z
        .enum(['draft', 'active', 'verified', 'blocked', 'deprecated'])
        .optional()
        .describe('Optional filter by requirement status'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of requirements to return (default 50, max 100)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based offset for pagination (default 0)'),
    },
    async (args) => {
      const result = await listRequirementsTool.handler(db, context, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // Tool 3: list_tasks
  server.tool(
    'list_tasks',
    'List tasks for a project with optional status, milestone filtering, and pagination',
    {
      projectId: z.string().describe('The unique UUID of the project'),
      status: z
        .enum(['backlog', 'todo', 'doing', 'blocked', 'done'])
        .optional()
        .describe('Optional filter by task status'),
      milestoneId: z.string().optional().describe('Optional milestone UUID filter'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of tasks to return (default 50, max 100)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based offset for pagination (default 0)'),
    },
    async (args) => {
      const result = await listTasksTool.handler(db, context, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // Tool 4: get_delivery_report
  server.tool(
    'get_delivery_report',
    'Get project delivery progress and verification metrics (metrics only, no raw evidence)',
    {
      projectId: z.string().describe('The unique UUID of the project'),
    },
    async (args) => {
      const result = await getDeliveryReportTool.handler(db, context, args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

export { StreamableHTTPServerTransport };
export const createProjectPilotMcpServer = createVouchlockMcpServer;

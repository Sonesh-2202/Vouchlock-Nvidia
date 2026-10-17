/**
 * Test Database and Application Harness
 * Manages isolated PostgreSQL connection and test app instances.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, type Database } from '../src/db/connection.js';
import { buildApp, type BuiltApp } from '../src/app.js';
import type postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveTestDatabaseUrl(): string {
  if (process.env['TEST_DATABASE_URL']) {
    return process.env['TEST_DATABASE_URL'];
  }
  const base = process.env['DATABASE_URL'];
  if (base) {
    try {
      const parsed = new URL(base);
      if (!parsed.pathname.endsWith('_test')) {
        parsed.pathname = parsed.pathname ? `${parsed.pathname}_test` : '/projectpilot_test';
      }
      return parsed.toString();
    } catch {
      return base.replace(/\/projectpilot(\b|$)/, '/projectpilot_test');
    }
  }
  return 'postgresql://postgres@localhost:5432/projectpilot_test';
}

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();

let migrationApplied = false;
async function ensureTestDatabaseMigrated(db: Database) {
  if (migrationApplied) return;
  const migrationsFolder = path.resolve(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });
  migrationApplied = true;
}

export interface TestHarness {
  db: Database;
  client: postgres.Sql;
  app: BuiltApp['app'];
  cleanup: () => Promise<void>;
  resetDatabase: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const { db, client } = createDb(TEST_DATABASE_URL);
  try {
    await ensureTestDatabaseMigrated(db);
  } catch (err: unknown) {
    await client.end({ timeout: 1 }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Integration test database is unavailable at ${TEST_DATABASE_URL}.\n` +
        `Ensure PostgreSQL is running (e.g. docker-compose up -d postgres) or set TEST_DATABASE_URL.\n` +
        `Details: ${msg}`,
      { cause: err },
    );
  }

  const built = await buildApp({
    config: {
      databaseUrl: TEST_DATABASE_URL,
      jwtSecret: 'test-secret-key-at-least-32-chars-long-strictly-for-testing',
      nodeEnv: 'test',
      aiProvider: 'mock',
      logLevel: 'silent',
    },
    db,
    client,
  });

  const resetDatabase = async () => {
    // Truncate all tables in dependency order
    await client.unsafe(`
      TRUNCATE TABLE
        verifications,
        evidence,
        requirement_tasks,
        task_dependencies,
        comments,
        tasks,
        requirements,
        project_brief_revisions,
        ai_generations,
        milestones,
        projects,
        invitations,
        audit_events,
        mcp_tokens,
        workspace_members,
        workspaces,
        identity_links,
        users
      CASCADE;
    `);
  };

  const cleanup = async () => {
    await built.app.close();
    await client.end();
  };

  return {
    db,
    client,
    app: built.app,
    cleanup,
    resetDatabase,
  };
}

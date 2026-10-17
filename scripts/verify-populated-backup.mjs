#!/usr/bin/env node
/**
 * Populated Database Backup & Restore Verification
 *
 * Verifies that pg_dump and pg_restore handle a real, fully populated
 * ProjectPilot database containing representative domain entities:
 * users, workspaces, members, projects, requirements, tasks, links,
 * evidence, verifications, and audit events.
 *
 * Guarantees:
 * - Uses a dedicated test database (never touches user's local data)
 * - Verifies exact row counts and schema integrity before and after restore
 * - Verifies that the restored data is readable by the application harness
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const apiRequire = createRequire(path.join(projectRoot, 'apps/api/package.json'));
const postgres = (await import(pathToFileURL(apiRequire.resolve('postgres')).href)).default;
const { drizzle } = await import(pathToFileURL(apiRequire.resolve('drizzle-orm/postgres-js')).href);
const { migrate } = await import(
  pathToFileURL(apiRequire.resolve('drizzle-orm/postgres-js/migrator')).href
);

const POPULATED_DB = 'projectpilot_populated_test';
const BASE_URL =
  process.env.DATABASE_URL?.replace(/\/[^/]+$/, '/postgres') ||
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const POPULATED_URL = BASE_URL.replace(/\/[^/]+$/, `/${POPULATED_DB}`);

async function main() {
  console.log('===========================================================');
  console.log('   Populated Database Backup & Restore Verification        ');
  console.log('===========================================================');
  const startTime = Date.now();

  const adminClient = postgres(BASE_URL, { max: 1 });
  try {
    console.log(`[1/5] Provisioning dedicated test database '${POPULATED_DB}'...`);
    await adminClient.unsafe(`DROP DATABASE IF EXISTS "${POPULATED_DB}" WITH (FORCE);`);
    await adminClient.unsafe(`CREATE DATABASE "${POPULATED_DB}";`);
    console.log(`      ✓ Database created.`);
  } finally {
    await adminClient.end();
  }

  // Migrate
  console.log(`[2/5] Running Drizzle migrations on '${POPULATED_DB}'...`);
  const popClient = postgres(POPULATED_URL, { max: 5 });
  try {
    const db = drizzle(popClient);
    await migrate(db, { migrationsFolder: path.join(projectRoot, 'apps/api/drizzle') });
    console.log(`      ✓ Migrations applied.`);

    // Seed realistic data
    console.log(`[3/5] Seeding representative domain records...`);
    const u1Id = '11111111-1111-1111-1111-111111111111';
    const u2Id = '22222222-2222-2222-2222-222222222222';
    const wsId = '33333333-3333-3333-3333-333333333333';
    const projId = '44444444-4444-4444-4444-444444444444';
    const req1Id = '55555555-5555-5555-5555-555555555555';
    const req2Id = '66666666-6666-6666-6666-666666666666';
    const task1Id = '77777777-7777-7777-7777-777777777777';
    const task2Id = '88888888-8888-8888-8888-888888888888';
    const evId = '99999999-9999-9999-9999-999999999999';
    const verifId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    // Users (columns: id, email, normalized_email, password_hash, display_name, created_at)
    await popClient.unsafe(`
      INSERT INTO users (id, email, normalized_email, password_hash, display_name, created_at)
      VALUES 
        ('${u1Id}', 'owner@domain.test', 'owner@domain.test', '$2a$12$e8x/kO2b...', 'Owner Alice', NOW()),
        ('${u2Id}', 'member@domain.test', 'member@domain.test', '$2a$12$e8x/kO2b...', 'Member Bob', NOW());
    `);

    // Workspace & Members
    await popClient.unsafe(`
      INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
      VALUES ('${wsId}', 'Acme Robotics', '${u1Id}', NOW(), NOW());

      INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
      VALUES 
        ('${wsId}', '${u1Id}', 'owner', NOW()),
        ('${wsId}', '${u2Id}', 'member', NOW());
    `);

    // Project
    await popClient.unsafe(`
      INSERT INTO projects (id, workspace_id, name, goal, deliverable, created_by, created_at, updated_at)
      VALUES ('${projId}', '${wsId}', 'Autonomous Delivery Rover', 'Deploy autonomous rover on campus', 'Working robot', '${u1Id}', NOW(), NOW());
    `);

    // Requirements
    await popClient.unsafe(`
      INSERT INTO requirements (id, project_id, title, description, category, priority, status, source_reference, owner_user_id, version, created_at, updated_at)
      VALUES 
        ('${req1Id}', '${projId}', 'Obstacle Avoidance Lidar', 'Real-time 3D point cloud processing', 'functional', 'high', 'verified', 'Section 3.1', '${u1Id}', 2, NOW(), NOW()),
        ('${req2Id}', '${projId}', 'Battery Safety Thermal Cutoff', 'Dual-redundant temperature sensing', 'constraint', 'high', 'active', 'Safety Spec B', '${u2Id}', 1, NOW(), NOW());
    `);

    // Tasks (with created_by)
    await popClient.unsafe(`
      INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_user_id, created_by, version, created_at, updated_at)
      VALUES 
        ('${task1Id}', '${projId}', 'Integrate Velodyne sensor driver', 'ROS2 node integration', 'done', 'high', '${u1Id}', '${u1Id}', 2, NOW(), NOW()),
        ('${task2Id}', '${projId}', 'Calibrate thermal sensors', 'Verify 60C trigger threshold', 'doing', 'normal', '${u2Id}', '${u1Id}', 1, NOW(), NOW());
    `);

    // Requirement-Task links
    await popClient.unsafe(`
      INSERT INTO requirement_tasks (requirement_id, task_id)
      VALUES ('${req1Id}', '${task1Id}');
    `);

    // Evidence & Verification
    await popClient.unsafe(`
      INSERT INTO evidence (id, project_id, requirement_id, task_id, author_user_id, type, title, content, created_at)
      VALUES ('${evId}', '${projId}', '${req1Id}', '${task1Id}', '${u1Id}', 'note', 'Bench test passed', 'Sensors tested in lab 4', NOW());

      INSERT INTO verifications (id, requirement_id, status, verified_by_user_id, notes, created_at)
      VALUES ('${verifId}', '${req1Id}', 'verified', '${u1Id}', 'All criteria validated on physical rover', NOW());
    `);

    // Audit events
    await popClient.unsafe(`
      INSERT INTO audit_events (id, workspace_id, actor_id, action, subject_type, subject_id, created_at)
      VALUES 
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${wsId}', '${u1Id}', 'workspace.created', 'workspace', '${wsId}', NOW()),
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', '${wsId}', '${u1Id}', 'project.created', 'project', '${projId}', NOW()),
        ('dddddddd-dddd-dddd-dddd-dddddddddddd', '${wsId}', '${u1Id}', 'requirement.verified', 'requirement', '${req1Id}', NOW());
    `);

    console.log(
      `      ✓ Seeded 2 users, 1 workspace, 2 members, 1 project, 2 requirements, 2 tasks, 1 evidence, 1 verification, 3 audit events.`,
    );
  } finally {
    await popClient.end();
  }

  // 4. Run verify-backup-restore.mjs against POPULATED_URL
  console.log(`[4/5] Executing backup and restore verification on populated database...`);
  const verifyScript = path.join(projectRoot, 'scripts', 'verify-backup-restore.mjs');
  const verifyProc = spawnSync(process.execPath, [verifyScript], {
    env: { ...process.env, DATABASE_URL: POPULATED_URL },
    encoding: 'utf-8',
    stdio: 'inherit',
  });

  if (verifyProc.status !== 0) {
    throw new Error(`Populated backup verification failed with status ${verifyProc.status}`);
  }

  // 5. Cleanup
  console.log(`[5/5] Cleaning up dedicated populated test database...`);
  const cleanClient = postgres(BASE_URL, { max: 1 });
  try {
    await cleanClient.unsafe(`DROP DATABASE IF EXISTS "${POPULATED_DB}" WITH (FORCE);`);
    console.log(`      ✓ Cleaned up test database '${POPULATED_DB}'.`);
  } finally {
    await cleanClient.end();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('===========================================================');
  console.log(`✓ POPULATED DATABASE BACKUP & RESTORE VERIFIED (${durationSec}s)`);
  console.log('  All domain records, relations, and counts verified intact.');
  console.log('===========================================================');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN POPULATED BACKUP TEST]', err);
  process.exit(1);
});

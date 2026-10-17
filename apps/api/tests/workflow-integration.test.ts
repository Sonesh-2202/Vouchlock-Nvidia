/**
 * End-to-End Persisted Workflow Integration Test
 * Exercises complete brief -> extraction -> acceptance -> tasks -> evidence -> verification -> delivery report
 * against a real, isolated PostgreSQL database.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarness, type TestHarness } from './test-db.js';
import { requirements, projectBriefRevisions, verifications, evidence } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Complete Persisted Workflow against Live Database', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.resetDatabase();
  });

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('executes full brief-to-verified delivery workflow with atomic writes and provenance', async () => {
    // 1. Register User
    const regRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'alice@projectpilot.local',
        password: 'Password123!Safe',
        displayName: 'Alice Engineer',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const userCookie = regRes.cookies.find((c) => c.name === 'pp_session')?.value;
    expect(userCookie).toBeDefined();
    const headers = {
      cookie: `pp_session=${userCookie}`,
    };

    // 2. Create Workspace
    const wsRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: {
        name: 'Apollo Delivery Team',
      },
    });
    expect(wsRes.statusCode).toBe(201);
    const workspaceId = wsRes.json().workspace.id;
    expect(workspaceId).toBeDefined();

    // 3. Create Project
    const projRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${workspaceId}/projects`,
      headers,
      payload: {
        workspaceId,
        name: 'Lunar Mission Ledger',
        goal: 'Deliver verifiable milestone tracker for team capstone',
        deliverable: 'Web App & API',
        deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    expect(projRes.statusCode).toBe(201);
    const projectId = projRes.json().project.id;
    expect(projectId).toBeDefined();

    // 4. Save Brief Revision 1
    const briefRev1Res = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/briefs`,
      headers,
      payload: {
        title: 'Initial Capstone Proposal',
        content: 'We need to track requirements and ensure no unverified work is marked done.',
        notes: 'First draft from advisor kickoff',
      },
    });
    expect(briefRev1Res.statusCode).toBe(201);
    expect(briefRev1Res.json().revision.revisionNumber).toBe(1);

    // 5. Save Brief Revision 2
    const briefRev2Res = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/briefs`,
      headers,
      payload: {
        title: 'Capstone Proposal v2 - Technical Scope',
        content: `Project Scope:
1. Requirements Ledger: Store canonical requirements linked to source brief revisions.
2. Evidence Attachments: Allow attaching pull request URLs and automated test logs.
3. Explicit Verification: Only project owners and admins can sign off on verification.
4. Truthful Reporting: Never report fabricated metrics or fake progress.`,
        notes: 'Refined with security and evidence criteria',
      },
    });
    expect(briefRev2Res.statusCode).toBe(201);
    const briefRev2 = briefRev2Res.json().revision;
    expect(briefRev2.revisionNumber).toBe(2);

    // 6. Read Brief Revisions
    const listBriefsRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/briefs`,
      headers,
    });
    expect(listBriefsRes.statusCode).toBe(200);
    const briefs = listBriefsRes.json().revisions;
    expect(briefs.length).toBe(2);
    expect(briefs[0].revisionNumber).toBe(2);
    expect(briefs[1].revisionNumber).toBe(1);

    const latestBriefRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/briefs/latest`,
      headers,
    });
    expect(latestBriefRes.statusCode).toBe(200);
    expect(latestBriefRes.json().revision.id).toBe(briefRev2.id);

    // 7. Extract Requirement Proposal from Brief Revision 2
    const extractRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/proposals/extract`,
      headers,
      payload: {
        briefRevisionId: briefRev2.id,
      },
    });
    expect(extractRes.statusCode).toBe(200);
    const extraction = extractRes.json();
    expect(extraction.proposal.candidates.length).toBeGreaterThan(0);
    expect(extraction.briefRevisionId).toBe(briefRev2.id);

    const firstCandidate = extraction.proposal.candidates[0];
    expect(firstCandidate.title).toBeDefined();

    // 8. Explicitly Accept Candidate into Canonical Requirements (Atomic Write)
    const idempotencyKey = 'apollo-accept-key-001';
    const acceptRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/proposals/accept`,
      headers,
      payload: {
        briefRevisionId: briefRev2.id,
        idempotencyKey,
        acceptedCandidates: [
          {
            tempId: firstCandidate.tempId,
            title: firstCandidate.title,
            description: firstCandidate.description,
            category: firstCandidate.category,
            priority: firstCandidate.priority,
            sourceReference: firstCandidate.sourceReference ?? 'Section 1 Requirements Ledger',
          },
        ],
      },
    });
    expect(acceptRes.statusCode).toBe(201);
    const acceptedData = acceptRes.json();
    expect(acceptedData.acceptedCount).toBe(1);
    const createdReq = acceptedData.createdRequirements[0];
    expect(createdReq.status).toBe('active');
    expect(createdReq.sourceReference).toContain(`Brief Rev ${briefRev2.id.slice(0, 8)}`);

    // 9. Verify Idempotent Acceptance Replay (Does Not Duplicate Rows)
    const replayRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/proposals/accept`,
      headers,
      payload: {
        briefRevisionId: briefRev2.id,
        idempotencyKey,
        acceptedCandidates: [
          {
            tempId: firstCandidate.tempId,
            title: firstCandidate.title,
            description: firstCandidate.description,
            category: firstCandidate.category,
            priority: firstCandidate.priority,
            sourceReference: firstCandidate.sourceReference,
          },
        ],
      },
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json().idempotentReplay).toBe(true);

    // Verify row count in DB is still exactly 1 requirement
    const dbReqs = await harness.db
      .select()
      .from(requirements)
      .where(eq(requirements.projectId, projectId));
    expect(dbReqs.length).toBe(1);

    // 10. Create and Link a Task
    const taskRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/projects/${projectId}/tasks`,
      headers,
      payload: {
        projectId,
        title: 'Implement persistent requirement model with foreign key links',
        description: 'Drizzle ORM schema and migration',
        priority: 'high',
      },
    });
    expect(taskRes.statusCode).toBe(201);
    const taskId = taskRes.json().task.id;

    // Task comments show the real account author instead of a client-side placeholder name
    const commentRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/comments`,
      headers,
      payload: { body: 'I will take the migration and verify it against the clean test database.' },
    });
    expect(commentRes.statusCode).toBe(201);

    const taskDetailRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${taskId}`,
      headers,
    });
    expect(taskDetailRes.statusCode).toBe(200);
    expect(taskDetailRes.json().comments).toHaveLength(1);
    expect(taskDetailRes.json().comments[0]).toMatchObject({
      authorUserId: regRes.json().user.id,
      authorName: 'Alice Engineer',
      body: 'I will take the migration and verify it against the clean test database.',
      editedAt: null,
    });

    const linkRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${createdReq.id}/tasks`,
      headers,
      payload: {
        taskId,
      },
    });
    expect(linkRes.statusCode).toBe(200);
    expect(linkRes.json().ok).toBe(true);

    // 11. Attach Evidence (URL and Note)
    const urlEvidenceRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${createdReq.id}/evidence`,
      headers,
      payload: {
        taskId,
        type: 'url',
        title: 'GitHub Pull Request #42',
        content: 'https://github.com/projectpilot/pr/42',
      },
    });
    expect(urlEvidenceRes.statusCode).toBe(201);

    const noteEvidenceRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${createdReq.id}/evidence`,
      headers,
      payload: {
        type: 'note',
        title: 'Database constraints automated validation log',
        content: 'PostgreSQL migrations applied and verified with 100% green schema tests.',
      },
    });
    expect(noteEvidenceRes.statusCode).toBe(201);

    // 12. Explicit Human Verification by Authorized Owner
    const verifyRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${createdReq.id}/verify`,
      headers,
      payload: {
        status: 'verified',
        notes: 'Reviewed schema migration and integration test outputs. Ready for release.',
      },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().requirement.status).toBe('verified');

    // 13. Generate Truthful Delivery Report
    const reportRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/delivery-report`,
      headers,
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json();
    expect(report.metrics.totalRequirements).toBe(1);
    expect(report.metrics.verifiedCount).toBe(1);
    expect(report.metrics.percentVerified).toBe(100);
    expect(report.metrics.requirementsWithTasksCount).toBe(1);
    expect(report.metrics.requirementsWithEvidenceCount).toBe(1);
    expect(report.items[0].isVerified).toBe(true);
    expect(report.items[0].evidenceCount).toBe(2);

    // 14. Export Workspace
    const exportRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/export`,
      headers,
    });
    expect(exportRes.statusCode).toBe(200);
    const exportData = exportRes.json();
    expect(exportData.projects.length).toBe(1);
    expect(exportData.members.length).toBe(1);
    expect(exportData.auditEvents.length).toBeGreaterThan(0);

    // 15. Verify Database State Persisted on Disk
    const [persistedReq] = await harness.db
      .select()
      .from(requirements)
      .where(eq(requirements.id, createdReq.id));
    expect(persistedReq).toBeDefined();
    expect(persistedReq!.status).toBe('verified');
    expect(persistedReq!.version).toBe(2); // Initial active (v1) -> verified (v2)

    const persistedVerifications = await harness.db
      .select()
      .from(verifications)
      .where(eq(verifications.requirementId, createdReq.id));
    expect(persistedVerifications.length).toBe(1);
    expect(persistedVerifications[0]!.status).toBe('verified');

    const persistedEvidence = await harness.db
      .select()
      .from(evidence)
      .where(eq(evidence.requirementId, createdReq.id));
    expect(persistedEvidence.length).toBe(2);

    const persistedBriefs = await harness.db
      .select()
      .from(projectBriefRevisions)
      .where(eq(projectBriefRevisions.projectId, projectId));
    expect(persistedBriefs.length).toBe(2);
  });
});

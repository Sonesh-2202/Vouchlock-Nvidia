/**
 * Permissions, Multi-Tenant Isolation, and Boundary Security Tests
 * Proves isolation between unrelated workspaces, role-based access control,
 * invalid nested IDs, stale versions, last owner protection, and invitation lifecycle.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarness, type TestHarness } from './test-db.js';
import { auditEvents } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Permissions, Tenant Isolation & Write Hardening', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.resetDatabase();
  });

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('strictly enforces multi-tenant boundary isolation between unrelated workspaces', async () => {
    // Register User A (Workspace A Owner)
    const regARes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'usera@tenant.local', password: 'Password123!', displayName: 'User A' },
    });
    const cookieA = regARes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headersA = { cookie: `pp_session=${cookieA}` };

    // Register User B (Workspace B Owner)
    const regBRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'userb@tenant.local', password: 'Password123!', displayName: 'User B' },
    });
    const cookieB = regBRes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headersB = { cookie: `pp_session=${cookieB}` };

    // User A creates Workspace A and Project A
    const wsARes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: headersA,
      payload: { name: 'Tenant A Workspace' },
    });
    const wsAId = wsARes.json().workspace.id;

    const projARes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${wsAId}/projects`,
      headers: headersA,
      payload: { name: 'Project Alpha', goal: 'Secret internal alpha' },
    });
    const projAId = projARes.json().project.id;

    // User A creates a brief and requirement in Project A
    const briefARes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projAId}/briefs`,
      headers: headersA,
      payload: { title: 'Internal Alpha Spec', content: 'Secret specifications for Tenant A.' },
    });
    const briefAId = briefARes.json().revision.id;

    const reqARes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projAId}/requirements`,
      headers: headersA,
      payload: {
        title: 'Tenant A Secure Module',
        category: 'functional',
        priority: 'high',
      },
    });
    const reqAId = reqARes.json().requirement.id;

    // User B creates Workspace B and Project B
    const wsBRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: headersB,
      payload: { name: 'Tenant B Workspace' },
    });
    const wsBId = wsBRes.json().workspace.id;

    const projBRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${wsBId}/projects`,
      headers: headersB,
      payload: { name: 'Project Beta', goal: 'Tenant B operations' },
    });
    const projBId = projBRes.json().project.id;

    const taskBRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/projects/${projBId}/tasks`,
      headers: headersB,
      payload: { title: 'Tenant B Task', priority: 'normal' },
    });
    const taskBId = taskBRes.json().task.id;

    // ── Tenant Isolation Verifications ──
    // User B cannot access Workspace A details
    const getWsARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${wsAId}`,
      headers: headersB,
    });
    expect(getWsARes.statusCode).toBe(404);

    // User B cannot list Projects in Workspace A
    const listProjARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/workspaces/${wsAId}/projects`,
      headers: headersB,
    });
    expect(listProjARes.statusCode).toBe(404);

    // User B cannot get Project A details
    const getProjARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projAId}`,
      headers: headersB,
    });
    expect(getProjARes.statusCode).toBe(404);

    // User B cannot read Briefs in Project A
    const getBriefsARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projAId}/briefs`,
      headers: headersB,
    });
    expect(getBriefsARes.statusCode).toBe(403);

    // User B cannot read Requirements in Project A
    const getReqsARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projAId}/requirements`,
      headers: headersB,
    });
    expect(getReqsARes.statusCode).toBe(404);

    // User B cannot generate delivery report for Project A
    const reportARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projAId}/delivery-report`,
      headers: headersB,
    });
    expect(reportARes.statusCode).toBe(404);

    // User B cannot export Workspace A
    const exportARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${wsAId}/export`,
      headers: headersB,
    });
    expect(exportARes.statusCode).toBe(404);

    // User B cannot extract proposal for Project A
    const extractARes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projAId}/proposals/extract`,
      headers: headersB,
      payload: { briefRevisionId: briefAId },
    });
    expect(extractARes.statusCode).toBe(403);

    // ── Nested ID Boundary Enforcement ──
    // User A cannot link Task from Tenant B to Requirement in Tenant A
    const crossLinkRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqAId}/tasks`,
      headers: headersA,
      payload: { taskId: taskBId },
    });
    expect(crossLinkRes.statusCode).toBe(404);
    expect(crossLinkRes.json().error.code).toBe('not_found');

    // User A cannot attach evidence referencing Task from Tenant B
    const crossEvidenceRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqAId}/evidence`,
      headers: headersA,
      payload: {
        taskId: taskBId,
        type: 'note',
        title: 'Cross-tenant evidence attempt',
        content: 'Should be rejected',
      },
    });
    expect(crossEvidenceRes.statusCode).toBe(400);
    expect(crossEvidenceRes.json().error.code).toBe('invalid_task');

    // ── Task & Comment Isolation ──
    const taskARes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/projects/${projAId}/tasks`,
      headers: headersA,
      payload: { title: 'Tenant A Secret Task', priority: 'high' },
    });
    expect(taskARes.statusCode).toBe(201);
    const taskAId = taskARes.json().task.id;

    const commentARes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskAId}/comments`,
      headers: headersA,
      payload: { body: 'Confidential note in Tenant A' },
    });
    expect(commentARes.statusCode).toBe(201);
    const commentAId = commentARes.json().comment.id;

    // User B cannot read Tenant A task details or comments
    const getTaskARes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${taskAId}`,
      headers: headersB,
    });
    expect(getTaskARes.statusCode).toBe(404);

    // User B cannot create comment on Tenant A task
    const crossCreateCommentRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskAId}/comments`,
      headers: headersB,
      payload: { body: 'Unauthorized cross-tenant comment' },
    });
    expect(crossCreateCommentRes.statusCode).toBe(404);

    // User B cannot edit Tenant A comment
    const crossEditCommentRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskAId}/comments/${commentAId}`,
      headers: headersB,
      payload: { body: 'Unauthorized cross-tenant edit' },
    });
    expect(crossEditCommentRes.statusCode).toBe(404);

    // User B cannot delete Tenant A comment
    const crossDeleteCommentRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${taskAId}/comments/${commentAId}`,
      headers: headersB,
    });
    expect(crossDeleteCommentRes.statusCode).toBe(404);

    // User B cannot delete Tenant A task
    const crossDeleteTaskRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${taskAId}`,
      headers: headersB,
    });
    expect(crossDeleteTaskRes.statusCode).toBe(404);

    // User B cannot read Tenant A workspace activity or project activity
    const crossWsActivityRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${wsAId}/activity`,
      headers: headersB,
    });
    expect(crossWsActivityRes.statusCode).toBe(404);

    const crossProjActivityRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projAId}/activity`,
      headers: headersB,
    });
    expect(crossProjActivityRes.statusCode).toBe(404);
  });

  it('enforces role authorization matrix and invitation lifecycle', async () => {
    // User A (Owner) registers and creates workspace
    const regARes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'owner@roles.local', password: 'Password123!', displayName: 'Owner' },
    });
    const cookieA = regARes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headersOwner = { cookie: `pp_session=${cookieA}` };

    const wsRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: headersOwner,
      payload: { name: 'Role Validation Workspace' },
    });
    const workspaceId = wsRes.json().workspace.id;

    const projRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${workspaceId}/projects`,
      headers: headersOwner,
      payload: { name: 'Role Test Project', goal: 'Verify role actions' },
    });
    const projectId = projRes.json().project.id;

    // Create a requirement
    const reqRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/requirements`,
      headers: headersOwner,
      payload: { title: 'Role Guarded Requirement', category: 'functional', priority: 'normal' },
    });
    const reqId = reqRes.json().requirement.id;

    // Invite User M as 'member'
    const inviteMemberRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/invitations`,
      headers: headersOwner,
      payload: { email: 'member@roles.local', role: 'member' },
    });
    expect(inviteMemberRes.statusCode).toBe(201);
    const memberToken = inviteMemberRes.json().invitation.token;

    // Register User M
    const regMRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'member@roles.local', password: 'Password123!', displayName: 'Member' },
    });
    const cookieM = regMRes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headersMember = { cookie: `pp_session=${cookieM}` };

    // Member accepts invitation
    const acceptMemberRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/invitations/${memberToken}/accept`,
      headers: headersMember,
    });
    expect(acceptMemberRes.statusCode).toBe(200);

    const taskRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/projects/${projectId}/tasks`,
      headers: headersOwner,
      payload: { title: 'Review team comments' },
    });
    const taskId = taskRes.json().task.id;

    const memberCommentRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/comments`,
      headers: headersMember,
      payload: { body: 'I will verify the task evidence before sign-off.' },
    });
    expect(memberCommentRes.statusCode).toBe(201);
    const memberCommentId = memberCommentRes.json().comment.id;

    const ownerEditMemberCommentRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskId}/comments/${memberCommentId}`,
      headers: headersOwner,
      payload: { body: 'Owner cannot rewrite another member’s comment.' },
    });
    expect(ownerEditMemberCommentRes.statusCode, ownerEditMemberCommentRes.body).toBe(403);

    const memberEditCommentRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskId}/comments/${memberCommentId}`,
      headers: headersMember,
      payload: { body: 'I reviewed the evidence; it is ready for sign-off.' },
    });
    expect(memberEditCommentRes.statusCode).toBe(200);
    expect(memberEditCommentRes.json().comment.editedAt).toBeTruthy();

    const ownerModerateCommentRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${taskId}/comments/${memberCommentId}`,
      headers: headersOwner,
    });
    expect(ownerModerateCommentRes.statusCode).toBe(200);

    const taskAfterModerationRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${taskId}`,
      headers: headersMember,
    });
    expect(taskAfterModerationRes.json().comments).toHaveLength(0);

    const ownerCommentRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/comments`,
      headers: headersOwner,
      payload: { body: 'This note stays unless its author or an admin removes it.' },
    });
    const ownerCommentId = ownerCommentRes.json().comment.id;
    const memberDeleteOwnerCommentRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${taskId}/comments/${ownerCommentId}`,
      headers: headersMember,
    });
    expect(memberDeleteOwnerCommentRes.statusCode).toBe(403);

    // Rejects whitespace-only comment creation and editing
    const blankCreateRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/comments`,
      headers: headersOwner,
      payload: { body: '    ' },
    });
    expect(blankCreateRes.statusCode).toBe(400);
    expect(blankCreateRes.json().error.code).toBe('validation_error');

    const blankEditRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskId}/comments/${ownerCommentId}`,
      headers: headersOwner,
      payload: { body: ' \t\n ' },
    });
    expect(blankEditRes.statusCode).toBe(400);
    expect(blankEditRes.json().error.code).toBe('validation_error');

    // Author can delete their own comment
    const authorDeleteOwnRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${taskId}/comments/${ownerCommentId}`,
      headers: headersOwner,
    });
    expect(authorDeleteOwnRes.statusCode).toBe(200);

    // Soft-deleted comment cannot be fetched, edited, or re-deleted
    const reDeleteRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${taskId}/comments/${ownerCommentId}`,
      headers: headersOwner,
    });
    expect(reDeleteRes.statusCode).toBe(404);

    const editDeletedRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskId}/comments/${ownerCommentId}`,
      headers: headersOwner,
      payload: { body: 'Cannot edit deleted comment' },
    });
    expect(editDeletedRes.statusCode).toBe(404);

    const commentAuditEvents = await harness.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId));
    const commentActions = commentAuditEvents.map((event) => event.action);
    expect(commentActions).toContain('comment.created');
    expect(commentActions).toContain('comment.edited');
    expect(commentActions).toContain('comment.deleted');

    // Replay accept invitation should fail with 410 Gone (already accepted)
    const replayInviteRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/invitations/${memberToken}/accept`,
      headers: headersMember,
    });
    expect(replayInviteRes.statusCode).toBe(410);

    // Member tries to verify requirement -> FORBIDDEN (403)
    const memberVerifyRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqId}/verify`,
      headers: headersMember,
      payload: { status: 'verified', notes: 'Member signoff' },
    });
    expect(memberVerifyRes.statusCode).toBe(403);
    expect(memberVerifyRes.json().error.code).toBe('forbidden');

    // Member tries to delete requirement -> FORBIDDEN (403)
    const memberDeleteReqRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/requirements/${reqId}`,
      headers: headersMember,
    });
    expect(memberDeleteReqRes.statusCode).toBe(403);

    // Invite User D as 'admin'
    const inviteAdminRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/invitations`,
      headers: headersOwner,
      payload: { email: 'admin@roles.local', role: 'admin' },
    });
    const adminToken = inviteAdminRes.json().invitation.token;

    // Register User D and accept invitation
    const regDRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'admin@roles.local', password: 'Password123!', displayName: 'Admin' },
    });
    const cookieD = regDRes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headersAdmin = { cookie: `pp_session=${cookieD}` };

    await harness.app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/invitations/${adminToken}/accept`,
      headers: headersAdmin,
    });

    // Move requirement to active first (valid transition from draft to active)
    const activateRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/requirements/${reqId}`,
      headers: headersAdmin,
      payload: { version: 1, status: 'active' },
    });
    expect(activateRes.statusCode).toBe(200);

    // Admin verifies requirement -> SUCCESS (200)
    const realAdminVerifyRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/requirements/${reqId}/verify`,
      headers: headersAdmin,
      payload: { status: 'verified', notes: 'Admin verification approved' },
    });
    expect(realAdminVerifyRes.statusCode).toBe(200);
    expect(realAdminVerifyRes.json().requirement.status).toBe('verified');

    // Admin deletes requirement -> SUCCESS (200)
    const adminDeleteReqRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/requirements/${reqId}`,
      headers: headersAdmin,
    });
    expect(adminDeleteReqRes.statusCode).toBe(200);
    expect(adminDeleteReqRes.json().ok).toBe(true);

    // ── Task Lifecycle, Permissions & Activity Endpoints ──
    const memberTaskRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/projects/${projectId}/tasks`,
      headers: headersMember,
      payload: { title: 'Member Created Task', status: 'backlog' },
    });
    expect(memberTaskRes.statusCode).toBe(201);
    const memberTaskId = memberTaskRes.json().task.id;

    // Member updates task status (backlog -> todo is valid transition)
    const memberUpdateTaskRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${memberTaskId}`,
      headers: headersMember,
      payload: { version: 1, status: 'todo' },
    });
    expect(memberUpdateTaskRes.statusCode).toBe(200);

    // Member cannot delete task (requires task:delete which is owner/admin only)
    const memberDeleteTaskRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${memberTaskId}`,
      headers: headersMember,
    });
    expect(memberDeleteTaskRes.statusCode).toBe(403);

    // Admin can delete task
    const adminDeleteTaskRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${memberTaskId}`,
      headers: headersAdmin,
    });
    expect(adminDeleteTaskRes.statusCode).toBe(200);
    expect(adminDeleteTaskRes.json().ok).toBe(true);

    // Member cannot read workspace audit activity (requires audit:read which is owner/admin only)
    const memberWsActivityRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/activity`,
      headers: headersMember,
    });
    expect(memberWsActivityRes.statusCode).toBe(403);

    // Admin can read workspace activity log
    const adminWsActivityRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/activity`,
      headers: headersAdmin,
    });
    expect(adminWsActivityRes.statusCode).toBe(200);
    const wsActions = adminWsActivityRes.json().activity.map((a: { action: string }) => a.action);
    expect(wsActions).toContain('task.created');
    expect(wsActions).toContain('task.updated');
    expect(wsActions).toContain('task.deleted');
    expect(adminWsActivityRes.json().activity[0].actorName).toBeTruthy();

    // Member can read project activity log
    const memberProjActivityRes = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/activity`,
      headers: headersMember,
    });
    expect(memberProjActivityRes.statusCode).toBe(200);
    expect(memberProjActivityRes.json().activity.length).toBeGreaterThan(0);

    // ── Last Owner Protection ──
    const ownerUserId = regARes.json().user.id;
    const removeOwnerRes = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspaceId}/members/${ownerUserId}`,
      headers: headersOwner,
    });
    expect(removeOwnerRes.statusCode).toBe(403);
    expect(removeOwnerRes.json().error.message).toContain('Cannot remove the last owner');
  });

  it('enforces optimistic concurrency and status machine validation on requirements', async () => {
    // Register User
    const regRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'concurrency@test.local',
        password: 'Password123!',
        displayName: 'Concurrency Tester',
      },
    });
    const cookie = regRes.cookies.find((c) => c.name === 'pp_session')?.value;
    const headers = { cookie: `pp_session=${cookie}` };

    const wsRes = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers,
      payload: { name: 'Concurrency Workspace' },
    });
    const workspaceId = wsRes.json().workspace.id;

    const projRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/workspaces/${workspaceId}/projects`,
      headers,
      payload: { name: 'Concurrency Project', goal: 'Test concurrency' },
    });
    const projectId = projRes.json().project.id;

    const reqRes = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/requirements`,
      headers,
      payload: { title: 'Concurrent Item', category: 'functional', priority: 'normal' },
    });
    const req = reqRes.json().requirement;
    expect(req.version).toBe(1);
    expect(req.status).toBe('draft');

    // Stale version update should fail with 409 Conflict
    const staleUpdateRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/requirements/${req.id}`,
      headers,
      payload: { version: 999, title: 'Conflicting Title Update' },
    });
    expect(staleUpdateRes.statusCode).toBe(409);
    expect(staleUpdateRes.json().error.code).toBe('conflict');

    // Invalid status transition: draft directly to verified without active review
    const invalidTransRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/requirements/${req.id}`,
      headers,
      payload: { version: 1, status: 'verified' },
    });
    expect(invalidTransRes.statusCode).toBe(400);
    expect(invalidTransRes.json().error.code).toBe('invalid_status_transition');

    // Valid update with current version: draft -> active
    const validUpdateRes = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/requirements/${req.id}`,
      headers,
      payload: { version: 1, status: 'active', title: 'Active Item Title' },
    });
    expect(validUpdateRes.statusCode).toBe(200);
    expect(validUpdateRes.json().requirement.version).toBe(2);
    expect(validUpdateRes.json().requirement.status).toBe('active');
  });
});

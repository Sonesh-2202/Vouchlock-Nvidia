# ProjectPilot Implementation Record: Requirements & Verification Traceability Slice

> Implemented in commit `36c2901` on 11 October 2026. Current local tests/build pass. Live PostgreSQL authorization/persistence E2E and browser QA remain release gates; this plan does not prove those checks.

## 1. Context & Objective
At the time this plan was written, ProjectPilot had workspaces, projects, milestones, tasks, and draft plan generation but lacked the defining core loop:
**Source brief → reviewed requirements → linked tasks → evidence → explicit verification → truthful delivery report**

This slice implements the complete, end-to-end, persisted traceability workflow with zero phantom mutations and manual-first fallback.

## 2. Material Assumptions
- **Storage for Evidence:** Restricted to safe, structured evidence types (`url` and `note`) per Slice 2 requirements. Arbitrary file upload is deferred until secure object storage, virus scanning, and retention policies are designed.
- **Verification Authority:** Verification is an explicit action restricted to workspace members with `requirement:verify` permission (owners and admins; members can view and propose evidence).
- **Tenant Isolation:** Every requirement, evidence record, task link, and verification record must strictly belong to the same project and workspace. Cross-project linking is forbidden server-side.
- **Concurrency & History:** Requirements track optimistic versions. Verifications preserve historical verification events so re-opening or re-verifying retains an audit trail.

## 3. Implementation Steps

### Phase A: Core Domain & Contracts (`packages/domain`, `packages/contracts`)
1. Extend `packages/domain/src/types.ts` with `Requirement`, `RequirementCategory`, `RequirementPriority`, `RequirementStatus`, `RequirementTaskLink`, `Evidence`, `EvidenceType`, `VerificationRecord`.
2. Update `packages/domain/src/rules.ts` with requirement permissions (`requirement:create`, `requirement:read`, `requirement:update`, `requirement:delete`, `requirement:verify`, `evidence:create`, `report:generate`) and verification transition logic.
3. Update `packages/contracts/src/schemas.ts` with Zod schemas for requirement CRUD, task linking, evidence creation, requirement verification, and report responses.
4. Add unit tests in domain and contracts packages to ensure 100% test coverage for new business rules.

### Phase B: Database Schema & Migrations (`apps/api`)
1. Update `apps/api/src/db/schema.ts` with tables:
   - `requirements` (with category, priority, status, sourceReference, ownerUserId, version)
   - `requirement_tasks` (many-to-many join table with foreign key cascade)
   - `evidence` (type: url/note, title, content, authorUserId, requirementId, taskId)
   - `verifications` (requirementId, verifiedByUserId, status, notes, createdAt)
2. Run `drizzle-kit generate` to produce clean migration SQL.

### Phase C: API Routes & Authorization (`apps/api`)
1. Add routes in `apps/api/src/routes/requirements.ts`:
   - `POST /api/v1/projects/:id/requirements`
   - `GET /api/v1/projects/:id/requirements`
   - `GET /api/v1/projects/requirements/:reqId`
   - `PATCH /api/v1/projects/requirements/:reqId`
   - `DELETE /api/v1/projects/requirements/:reqId`
   - `POST /api/v1/projects/requirements/:reqId/tasks` (link task)
   - `DELETE /api/v1/projects/requirements/:reqId/tasks/:taskId` (unlink task)
   - `POST /api/v1/projects/requirements/:reqId/evidence` (attach URL or note)
   - `GET /api/v1/projects/requirements/:reqId/evidence` (list evidence)
   - `POST /api/v1/projects/requirements/:reqId/verify` (explicit verification action)
   - `GET /api/v1/projects/requirements/:reqId/verifications` (verification history)
   - `GET /api/v1/projects/:id/delivery-report` (truthful delivery report computed from records)
2. Register routes in `apps/api/src/server.ts` and verify full tenant isolation and audit logging.

### Phase D: Frontend UI & Client Integration (`apps/web`)
1. Extend `apps/web/src/api.ts` with typed methods for requirements, task linking, evidence, verification, and delivery report.
2. Build Requirements workbench and Delivery Report views in `ProjectPage.tsx` adhering to the Anti-Vibecoding frontend brief.
3. Support empty states, loading states, validation errors, keyboard accessibility, and status badges.

### Phase E: Verification & Documentation
1. Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
2. Inspect UI responsive layout and keyboard accessibility.
3. Document completed slice and roadmap in `docs/product-readiness/04-traceability-verification-slice.md` and update `docs/product-readiness/01-implementation-status.md`.

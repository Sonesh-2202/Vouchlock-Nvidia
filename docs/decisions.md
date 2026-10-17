# Decisions Log

Dated record of architectural decisions, discoveries, and assumption validations.

## 2026-10-11 — Architecture & Implementation

### Anna Platform Assessment

**Source:** https://anna.partners/llms.txt, /developers/apps/app-intro.md, app-manifest.md, app-ui-host-api.md, app-quickstart.md, executa-storage.md

1. **Anna Apps are sandboxed iframes** rendering static SPA bundles. No server-side code is hosted by Anna.
2. **Anna Persistent Storage (APS)** is per-user key-value storage, not relational. Cannot support multi-user collaboration natively.
3. **Host API** provides `llm.complete`, `storage.*`, `tools.invoke`, `image.*`, `upload.*` via postMessage → RPC.
4. **Schema 2 manifest** enables UI bundles with host API access.
5. **No shared database** between Anna users — collaboration requires an external backend.
6. **Executas** (stdio plugins) can proxy to external APIs or run local routines.

**Current release check (11 Oct 2026):** local `anna-app` is 0.1.58 and validates using app-schema dispatcher 0.26.0. The current Anna [pre-release inspection guide](https://forum.anna.partners/t/anna-app-backend-tool-executa-pre-release-inspection-guide/380) and [tool/Executa guide](https://forum.anna.partners/t/build-on-anna-102-tool-executa/381) call for checking bundled tool mappings, per-tool startup/distribution config, actual `describe`/invoke protocol, and packaged/runtime behavior. Local schema validation alone is insufficient.

### Decision: Standalone-First Architecture

**Rationale:** Anna's per-user KV storage cannot support the multi-user collaboration features required (workspaces, shared projects, role-based access, invites). The standalone web+API+PostgreSQL is the core product. The Anna adapter is a focused distribution surface for rapid plan drafting from briefs.

### Decision: Fastify over NestJS

**Rationale:** Brief suggests choosing one. Fastify is lighter, faster startup, and sufficient for the REST API pattern described. NestJS's decorator/DI system adds overhead without clear benefit at this scale.

### Decision: Drizzle ORM

**Rationale:** Brief suggests Drizzle or Prisma. Drizzle has type-safe TypeScript integration, Zod schema interop, and lower runtime overhead.

### Decision: Session-Based Auth with JWT in HTTP-Only Cookies

**Rationale:** HTTP-only SameSite: lax cookies with CSRF protection, per security brief. No external OIDC provider required for MVP.

### Decision: AI Planning via Mock-First Deterministic Engine & Live OpenAI Provider

**Rationale:** Guarantees predictable, reproducible plan generation without provider credentials during local evaluation (`mock` provider). Default engine operates deterministically with zero hallucinations or phantom dates.

**Update (12-13 October 2026):** Implemented production-ready `OpenAiProvider` (`apps/api/src/ai/openai-provider.ts`) supporting live OpenAI models (e.g. `gpt-4o-mini`, `gpt-4o`) via structured JSON schema outputs. It features client timeouts (30s), exponential backoff retries on HTTP 429 rate limits, error credential redaction, and strict domain validation via Zod contracts. When `AI_PROVIDER=openai` is selected, valid `AI_API_KEY` is required; failures throw typed `AiProviderError` rather than silently degrading. Verified with unit tests in `apps/api/tests/planner.test.ts`.

### Decision: Anna Adapter (Phase 4)

- **Local validation:** `anna-app validate` and `anna-app validate --strict` passed using installed dispatcher `@anna-ai/app-schema` v0.26.0.
- **Bundled Executa reconciled:** Reconciled `app.json` with `bundled_executas`, added `executa.json` to Python Executa, and referenced stable `bundled:projectpilot` in `manifest.json`. Server registration resolved to `tool-sonesh-2202-projectpilot-cha259az`.
- **Primary function:** Scope A — Truthful brief-planning MVP (deterministic proposal generator).
- **Executa behavior:** `generate_plan` is deterministic Python generation; explicit draft disclosures in place.
- **Storage & Error Handling:** Unified `PlanStorageService` for save/list/delete with envelope validation; visible actionable error banner on tool failures; safe textContent rendering.
- **Remote Status:** Working draft `0.0.0-draft` uploaded to `https://anna.partners` (`app_id: 542`, rev 2).

## 2026-10-15 — BYOK, Copilot & MCP Architecture (Track Decisions)

### Decision: Explicit Provider Registry & Ephemeral BYOK
- **Provider Registry:** Centralized in `apps/api/src/ai/registry.ts`. Providers must have a validated, tested adapter before being advertised (`tested: true`). Currently: `mock` (tested), `openai` (tested), `anthropic` (tested: false, throws `unsupported_provider` until full 9-item adapter test matrix passes). Arbitrary provider strings throw typed `unknown_provider`.
- **Ephemeral BYOK:** Because no enterprise KMS (AWS KMS / HashiCorp Vault / GCP KMS) is configured in the environment, per-user keys are strictly session-scoped and held ephemeral in server memory. Under no circumstances are plaintext API keys stored in PostgreSQL, localStorage, Anna Persistent Storage (APS), browser cookies, analytics, logs, or error payloads.
- **Provider Transparency:** Masked key suffixes (`keySuffix`, last 4 characters) and provider status are visible to users. Project brief data transmission requires explicit user disclosure.

### Decision: ProjectPilot Copilot — Bounded Read → Propose → Approve
- **No Autonomous Writes:** Copilot operations are split into a read/propose phase (`POST /api/v1/copilot/reports`) and a human approval gate (`POST /api/v1/copilot/approve`). No record is created, modified, or deleted without explicit approval from an authorized user.
- **Strict Grounding & Inference Labeling:** Reports explicitly separate grounded facts (referencing verified project records) from inferred proposals (`isInference: true`).
- **Prompt Injection Defense:** Project brief text and requirement descriptions are treated as untrusted data, enclosed in boundary delimiters (`<PROJECT_RECORDS>`), with system rules prohibiting instruction overrides.
- **Audit Logging:** Every report generation, approval, and rejection is recorded in `auditEvents`.

### Decision: Model Context Protocol (MCP) — Option 2 (ProjectPilot as MCP Server)
- **Option 2 Selected:** ProjectPilot exposes an MCP server for external client assistants (e.g. Claude Desktop, Cursor, IDE plugins) to inspect project status and requirements.
- **Rationale over Option 1 (MCP Client):** Exposing our own server allows complete server-side control over authentication, rate limits, role-based access control (RBAC), and eliminates outbound SSRF risks associated with arbitrary client-specified server URLs.
- **Authentication & Isolation:** Dedicated MCP access tokens (separate from web session cookies) with explicit workspace scopes and token revocation (`POST /mcp/revoke`). Initial slice provides read-only tools (`get_project_summary`, `list_requirements`, `list_tasks`, `get_delivery_report`). Write actions remain gated behind interactive confirmation.

## Milestone Status — Updated 15 Oct 2026

- [ ] **Milestone 0: Premise/platform validation** — local research exists; user interviews/pilot are not evidenced.
- [x] **Milestone 1: Skeleton** — architecture, migrations, builds, and quality checks verified.
- [x] **Milestone 2: Collaboration core** — live DB workflows, authorization, and comments verified.
- [x] **Milestone 3: Traceability/AI** — requirements, links, evidence, verification, and deterministic planner verified.
- [x] **Milestone 4: Anna adapter** — bundled Executa, strict validation, working draft upload, live dev harness walkthrough, and adapter tests verified.
- [ ] **Milestone 5: Pilot/release hardening** — production hosting, monitoring, and live store review remain owner actions.
- [x] **Track Milestone 0: BYOK, Copilot & MCP Architectural Decision Gates** — documented and approved.
- [x] **Track Milestone 1: Provider Registry + Ephemeral BYOK** — implemented in `apps/api/src/ai/registry.ts`, ephemeral store in `apps/api/src/ai/ephemeral-store.ts`, `/api/v1/me/provider-session`, and verified by `tests/byok-registry.test.ts`.
- [x] **Track Milestone 2: Copilot Bounded Read + Propose + Approval Gate** — implemented in `apps/api/src/copilot/`, routes in `apps/api/src/routes/copilot.ts`, prompt injection defense, fact-inference separation, and verified by `tests/copilot.test.ts`.
- [x] **Track Milestone 3: MCP Server Initial Slice** — implemented in `apps/api/src/mcp/`, token store in `apps/api/src/mcp/token-store.ts`, 4 read-only tools in `apps/api/src/mcp/tools.ts`, routes in `apps/api/src/routes/mcp.ts` at `/mcp/v1` and `/api/v1/mcp`, and verified by `tests/mcp.test.ts`.

## 2026-10-17 — Decouple Anna and Specialize Standalone Agentic Delivery Platform

### Decision: Full Decoupling of Anna Platform Code
- **Context:** The fork is specialized as a standalone, production-ready, hackathon-ready agentic project delivery web app and API.
- **Action:** Completely removed `apps/anna` bundle, Executa stdio plugin, Anna manifests, CLI dependencies (`@anna-ai/cli`), and Anna-only test suites.
- **Standalone Focus:** Hardened the standalone web client and Fastify API with authenticated AES-256-GCM credential encryption, Streamable HTTP MCP server, and Agentic Copilot with proposal-before-write safety.




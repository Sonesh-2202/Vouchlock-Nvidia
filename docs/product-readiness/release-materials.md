# ProjectPilot Release Materials & Operational Runbook

> [!IMPORTANT]
> **Owner Review Required:** The release notes and social media copy contained in this document are prepared drafts only. Deploying to production infrastructure or posting to social channels requires the owner's explicit review and approval.

---

## 1. Operational Runbook

### Prerequisites
- **Node.js**: ≥ 20.0.0 (`node -v`)
- **pnpm**: ≥ 9.0.0 (`pnpm -v`)
- **PostgreSQL**: 16+ or Docker Compose

### Environment Configuration
Copy the template to your environment configuration:
```bash
cp .env.example .env
```
Key parameters to verify in `.env`:
- `DATABASE_URL`: Connection string (e.g. `postgresql://postgres:postgres@localhost:5432/projectpilot`)
- `JWT_SECRET` / `SESSION_SECRET`: Unique secret string (at least 32 characters in production)
- `API_PORT` / `PORT`: Fastify API listening port (default `3001` in dev, `4000` in Docker)
- `CORS_ORIGIN`: Comma-separated list of allowed origins (e.g. `http://localhost,http://localhost:5173`)
- `AI_PROVIDER`: `mock` (assistive deterministic planning) or `openai` (live LLM planning with `AI_API_KEY`)

### Local Setup & Database Migrations
```bash
# 1. Install dependencies
pnpm install

# 2. Build workspace packages (@projectpilot/domain & @projectpilot/contracts)
pnpm run build:packages

# 3. Apply database migrations to main and test databases
pnpm run db:migrate
DATABASE_URL="postgresql://postgres@localhost:5432/projectpilot_test" pnpm run db:migrate

# 4. Start development servers
pnpm dev:api   # Starts API on http://localhost:3001
pnpm dev:web   # Starts Vite web client on http://localhost:5173
```

### Verification Commands
```bash
# Full quality gate (typecheck, lint, Prettier, all 112 automated tests with PostgreSQL, or 104 tests offline via pnpm run test:unit)
pnpm check

# Unit tests offline (no database required)
pnpm run test:unit

# Production build
pnpm -r run build

# End-to-end full-stack smoke test (ephemeral DB, migrations, auth, workflows, restart)
pnpm run smoke

# Populated database backup & restore integrity check
pnpm run db:backup-verify:populated
```

### Docker Compose Deployment
```bash
# Validate compose configuration
docker compose config

# Build and start services in background
docker compose up -d --build

# View service logs
docker compose logs -f api

# Teardown services (preserves postgres_data volume)
docker compose down
```

### Troubleshooting
- **Missing package types in TypeScript:** Run `pnpm run build:packages`. Shared packages must compile to `dist/` before consuming apps can resolve types.
- **`JWT_SECRET` error on startup:** In production (`NODE_ENV=production`), secrets shorter than 32 characters or matching template placeholders will trigger an immediate startup error. Provide a cryptographically random string (`openssl rand -hex 32`).
- **PostgreSQL port mismatch:** On Windows systems with multiple installations, ensure the target cluster port (typically `5432`) matches `DATABASE_URL`.
- **Docker Desktop on Windows:** Requires "Virtual Machine Platform" enabled in Windows Optional Features and Virtualization enabled in BIOS.

---

## 2. Release Notes Draft (v0.1.0-rc1)

### Title: Vouchlock v0.1.0-rc1 — The Delivery Ledger

Vouchlock bridges the gap between project planning and verified delivery. Turn ambiguous briefs into structured requirements, connect daily task execution to real proof artifacts, and generate zero-fabrication attestation reports for stakeholders.

### Highlights
- **Assistive Brief Decomposition:** Parse complex briefs into structured requirements, assumptions, and risks without unreviewed automatic mutations.
- **Traceability Ledger:** Full vertical chain from requirement claim → linked task → proof artifact (PR, test run, doc) → role-authorized sign-off stamp.
- **Multi-Tenant Collaboration:** Workspace-isolated projects, 5-column Kanban board, inline comment editing, task moderation, and chronological project activity stream.
- **Deterministic CI & Operational Reliability:** Automated GitHub Actions pipeline, multi-stage Dockerfiles with non-root security, entrypoint migrations, and verified PostgreSQL backup/restore integrity.
- **Agentic Assistant & BYOK:** Bounded read-only intelligence with explicit human approval for proposed mutations, authenticated AES-256-GCM credential encryption, and Streamable HTTP MCP server.

---

## 4. Social Launch Copy Drafts

### X / Twitter Draft
```text
Stop managing projects with vague to-do lists that fail to prove what actually shipped.

Introducing ProjectPilot: The Delivery Ledger.

Connect project briefs to requirements, tasks, proof artifacts, and human sign-offs with zero phantom mutations.

Open source. Self-hostable. Built for teams who value proof over promises.

👉 github.com/Sonesh-2202/ProjectPilot
```

### LinkedIn Draft
```text
Engineering leaders and delivery teams face a recurring challenge: proving that what was agreed in the initial brief was faithfully delivered and verified in the final release.

Traditional Kanban boards track movement, not truth.

We built ProjectPilot to solve this: The Delivery Ledger.
1. Brief Decomposition: Structured requirements without unreviewed AI mutations.
2. Complete Traceability: Requirement Claim ➔ Code Tasks ➔ Proof Artifacts ➔ Attestation Stamp.
3. Truthful Delivery Reports: Audit reports computed directly from verified records.

Designed with a calm editorial aesthetic, fast Fastify runtime, and robust PostgreSQL multi-tenancy.

Check out the release candidate on GitHub: github.com/Sonesh-2202/ProjectPilot
```

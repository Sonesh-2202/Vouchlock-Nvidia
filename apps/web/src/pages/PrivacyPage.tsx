/**
 * Privacy Policy — structured, dated privacy documentation for Vouchlock.
 */

import { AppShell } from '../components/AppShell.js';

export function PrivacyPage() {
  return (
    <AppShell breadcrumbs={[{ label: 'Privacy Policy' }]}>
      <div
        className="container"
        style={{
          paddingTop: 'var(--space-8)',
          paddingBottom: 'var(--space-16)',
          maxWidth: '780px',
        }}
      >
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <span className="badge badge-neutral" style={{ marginBottom: 'var(--space-2)' }}>
            Effective: 11 October 2026
          </span>
          <h1
            className="serif-display"
            style={{ fontSize: 'var(--font-size-display)', color: 'var(--ink)' }}
          >
            Privacy Policy
          </h1>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--ink-muted)',
              marginTop: 'var(--space-2)',
            }}
          >
            How Vouchlock handles project briefs, verification audit trails, credentials, and
            telemetry.
          </p>
        </div>

        <div
          className="card"
          style={{
            background: 'var(--active-subtle)',
            borderColor: 'var(--active)',
            marginBottom: 'var(--space-8)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--ink)',
          }}
        >
          <strong>Notice for Commercial Deployment:</strong> This draft privacy specification
          establishes Vouchlock's privacy architecture. Review with institutional legal counsel
          prior to production launch.
        </div>

        <div
          className="paper-sheet"
          style={{
            padding: 'var(--space-8) var(--space-10)',
          }}
        >
          <article
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-6)',
              lineHeight: 1.6,
              fontSize: 'var(--font-size-base)',
              color: 'var(--ink)',
            }}
          >
            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                1. Information We Collect
              </h2>
              <p>
                Vouchlock collects minimal data strictly necessary for project delivery auditing:
              </p>
              <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <li>
                  <strong>Account Credentials:</strong> Display name, email address, and
                  argon2id-hashed authentication secrets.
                </li>
                <li>
                  <strong>Project Artifacts:</strong> Exact source briefs, version numbers,
                  candidate requirement proposals, task links, and verification notes.
                </li>
                <li>
                  <strong>Audit Events:</strong> Immutable timestamped records of requirement
                  verifications and proposal approvals.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                2. AI Provider Isolation & Ephemeral BYOK Keys
              </h2>
              <p>
                Project briefs are transmitted to Nebius Token Factory (serving NVIDIA Nemotron)
                only when you explicitly request analysis or extract requirement proposals. When
                Bring Your Own Key (BYOK) is utilized:
              </p>
              <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <li>
                  <strong>Ephemeral Storage:</strong> Your API keys are kept strictly in ephemeral
                  server memory with an explicit 24-hour TTL and are wiped immediately upon session
                  logout.
                </li>
                <li>
                  <strong>Zero Key Persistence:</strong> We never save your API keys to the
                  PostgreSQL database, browser cookies, local storage, analytics, error messages,
                  server logs, or external third-party storage.
                </li>
                <li>
                  <strong>Validated Runtime:</strong> Nebius Token Factory running NVIDIA Nemotron is
                  the sole production AI runtime. Unverified or legacy providers are not supported.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                3. Model Context Protocol (MCP) Security
              </h2>
              <p>
                Vouchlock exposes a standard Model Context Protocol (MCP) server over Streamable
                HTTP for external agent integrations:
              </p>
              <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <li>
                  <strong>Cryptographic Tokens:</strong> Tokens are generated with a distinct{' '}
                  <code>mcp_</code> prefix and stored exclusively as cryptographic SHA-256 hashes.
                  Plaintext tokens are revealed only once upon generation.
                </li>
                <li>
                  <strong>Strict Scope Enum:</strong> Scopes are strictly bounded to declared enums
                  (<code>mcp:read</code>, <code>mcp:admin</code>). Ordinary users can only grant
                  read access.
                </li>
                <li>
                  <strong>Resource Limits:</strong> All MCP sessions enforce concurrent call bounds
                  (max 3 concurrent) and per-session call rate limits to prevent denial-of-service.
                </li>
                <li>
                  <strong>Read-Only Tools:</strong> All exposed MCP tools are read-only (project
                  summaries, paginated requirement lists, paginated tasks, and delivery reports).
                  Metric reports strictly redact raw evidence text.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                4. Copilot Policy & Human-in-the-Loop Approvals
              </h2>
              <p>
                The Vouchlock Copilot analyzes authorized project records within your workspace to
                detect evidence gaps, blockers, and risks:
              </p>
              <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <li>
                  <strong>Grounded Facts vs. Inferences:</strong> Every output clearly marks
                  verified project facts separately from model inferences.
                </li>
                <li>
                  <strong>Zero Autonomous Writes:</strong> Initial Copilot actions are read-only or
                  proposal-only envelopes. Every state change (creating tasks, updating
                  requirements) requires explicit human review and cryptographic proposal
                  confirmation.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                5. Data Retention & Scoping
              </h2>
              <p>
                Workspaces are strictly isolated. Project members access only resources within their
                authenticated workspace scope. When a workspace is deleted, all associated brief
                revisions, tasks, and verifications are purged.
              </p>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                6. Your Rights
              </h2>
              <p>
                You maintain the right to export your complete workspace ledger in standard JSON at
                any time using the Export function. You may update or delete individual requirement
                items, evidence links, or account profiles upon request.
              </p>
            </section>

            <section
              style={{
                borderTop: '1px solid var(--rule)',
                paddingTop: 'var(--space-6)',
                marginTop: 'var(--space-4)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--ink-muted)',
              }}
            >
              For privacy inquiries or data requests, contact{' '}
              <a href="mailto:privacy@vouchlock.dev" style={{ color: 'var(--proof)' }}>
                privacy@vouchlock.dev
              </a>
              .
            </section>
          </article>
        </div>
      </div>
    </AppShell>
  );
}

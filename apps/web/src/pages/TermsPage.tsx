/**
 * Terms of Service — structured, dated legal agreement for Vouchlock.
 */

import { AppShell } from '../components/AppShell.js';

export function TermsPage() {
  return (
    <AppShell breadcrumbs={[{ label: 'Terms of Service' }]}>
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
            Terms of Service
          </h1>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--ink-muted)',
              marginTop: 'var(--space-2)',
            }}
          >
            These terms govern your access to and use of Vouchlock software, APIs, and verification
            services.
          </p>
        </div>

        {/* Legal Disclaimer Box */}
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
          <strong>Notice for Commercial Deployment:</strong> This draft terms document represents
          candidate operational rules for Vouchlock. Consult qualified legal counsel before
          production commercial launch.
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
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing Vouchlock or initiating an interactive session, you agree to comply
                with and be bound by these Terms. If you represent an organization, you affirm that
                you possess authority to bind that entity to these provisions.
              </p>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                2. Traceability & Truthful Verification Integrity
              </h2>
              <p>
                Vouchlock operates on the foundational principle of truthful delivery. You agree
                that:
              </p>
              <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)' }}>
                <li>Verification marks must reflect verified inspection of genuine evidence.</li>
                <li>
                  You will not misrepresent automated mock suggestions as verified client
                  acceptance.
                </li>
                <li>
                  Exported Truthful Delivery Reports remain records of the named verifiers recorded
                  at time of issuance.
                </li>
              </ul>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                3. Privacy & Brief Content Security
              </h2>
              <p>
                Project briefs, schemas, task definitions, and evidence URLs uploaded to your
                workspace remain your intellectual property. Vouchlock processes brief revisions
                strictly to derive candidate requirement proposals and audit metrics. Credentials
                and secrets must not be stored in evidence attachments.
              </p>
            </section>

            <section>
              <h2
                className="serif-display"
                style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}
              >
                4. Termination & Export
              </h2>
              <p>
                You may export complete workspace and delivery audit data at any time in standard
                JSON format. Upon account termination, workspace records will be deleted pursuant to
                our data retention schedule.
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
              Questions regarding terms? Contact{' '}
              <a href="mailto:support@vouchlock.dev" style={{ color: 'var(--proof)' }}>
                support@vouchlock.dev
              </a>
              .
            </section>
          </article>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * 404 Not Found Page — The Delivery Ledger design.
 */

import { AppShell } from '../components/AppShell.js';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <AppShell breadcrumbs={[{ label: '404' }]}>
      <div
        className="container"
        style={{
          paddingTop: 'var(--space-16)',
          paddingBottom: 'var(--space-16)',
          textAlign: 'center',
          maxWidth: '540px',
        }}
      >
        <span className="badge badge-blocked" style={{ marginBottom: 'var(--space-3)' }}>
          Record Missing
        </span>
        <h1
          className="serif-display"
          style={{
            fontSize: 'var(--font-size-3xl)',
            marginBottom: 'var(--space-3)',
            color: 'var(--ink)',
          }}
        >
          Page Not Located
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-base)',
            color: 'var(--ink-muted)',
            marginBottom: 'var(--space-6)',
          }}
        >
          The requested ledger route does not exist or has been archived. Check the URL or return to
          your projects dashboard.
        </p>
        <Link to="/" className="btn btn-primary">
          Return to Dashboard
        </Link>
      </div>
    </AppShell>
  );
}

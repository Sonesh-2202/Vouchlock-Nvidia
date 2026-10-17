/**
 * TaskPage — Standalone task page wrapped in AppShell with Delivery Ledger design.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.js';
import { TaskDrawer } from '../components/TaskDrawer.js';

export function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <AppShell breadcrumbs={[{ label: 'Tasks' }, { label: `Task #${id?.slice(-4).toUpperCase()}` }]}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TaskDrawer taskId={id || null} onClose={() => navigate(-1)} onTaskUpdated={() => {}} />
      </div>
    </AppShell>
  );
}

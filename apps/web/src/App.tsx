/**
 * Main App component — routing, auth guard, and smooth scroll integration.
 * Routes are lazy-loaded for optimal chunk splitting and fast initial page loads.
 */

import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth-context.js';
import { ThemeProvider } from './theme-context.js';
import { scrollToPosition } from './motion.js';

// Lazy-load page modules to break monolithic bundles into fast on-demand chunks
const LandingPage = lazy(() =>
  import('./pages/LandingPage.js').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage.js').then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage.js').then((m) => ({ default: m.DashboardPage })),
);
const WorkspacePage = lazy(() =>
  import('./pages/WorkspacePage.js').then((m) => ({ default: m.WorkspacePage })),
);
const ProjectPage = lazy(() =>
  import('./pages/ProjectPage.js').then((m) => ({ default: m.ProjectPage })),
);
const TaskPage = lazy(() => import('./pages/TaskPage.js').then((m) => ({ default: m.TaskPage })));
const TermsPage = lazy(() =>
  import('./pages/TermsPage.js').then((m) => ({ default: m.TermsPage })),
);
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage.js').then((m) => ({ default: m.PrivacyPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage.js').then((m) => ({ default: m.NotFoundPage })),
);

function PageLoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--desk)',
      }}
    >
      <div className="loading-spinner" />
    </div>
  );
}

function ScrollReset() {
  const location = useLocation();

  useEffect(() => {
    scrollToPosition(0, true);
  }, [location.pathname]);

  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  return (
    <>
      <ScrollReset />
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          {/* Public landing page on root for unauthenticated guests; Dashboard for logged-in users */}
          <Route path="/" element={user ? <DashboardPage /> : <LandingPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            path="/workspaces/:id"
            element={
              <RequireAuth>
                <WorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <RequireAuth>
                <ProjectPage />
              </RequireAuth>
            }
          />
          <Route
            path="/tasks/:id"
            element={
              <RequireAuth>
                <TaskPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

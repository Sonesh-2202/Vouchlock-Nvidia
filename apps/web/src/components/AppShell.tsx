/**
 * AppShell — The unified application frame for ProjectPilot V2.
 * "Paper on the Desk" — Calm dark workspace shell (var(--desk)),
 * rail (248px, collapses to 64px; remembered), top breadcrumb bar,
 * sliding active indicator on navigation, global command palette (Cmd/Ctrl+K)
 * with Lenis scroll pausing and trapped focus.
 */

import { useState, useEffect, type ReactNode, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth-context.js';
import { api, type ProjectResource } from '../api.js';
import { useTheme } from '../theme-context.js';
import { pauseSmoothScroll, resumeSmoothScroll, destroySmoothScroll } from '../motion.js';
import { SettingsModal } from './SettingsModal.js';
import {
  ProjectIcon,
  MemberIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  LogoutIcon,
  CloseIcon,
  ReportIcon,
  IconMenu,
} from './icons.js';

interface AppShellProps {
  children: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  activeSection?: 'projects' | 'members' | 'reports' | 'settings';
}

export function AppShell({
  children,
  breadcrumbs = [],
  activeSection = 'projects',
}: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Destroy Lenis when inside workspace shell to guarantee 100% native uninhibited scrolling
  useEffect(() => {
    destroySmoothScroll();
  }, []);

  function handleMembersClick(e: React.MouseEvent) {
    if (location.pathname === '/dashboard') {
      e.preventDefault();
      const rosterEl = document.getElementById('team-roster');
      if (rosterEl) {
        rosterEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState(null, '', '/dashboard#members');
      }
    }
  }

  // Mobile navigation slide-over drawer state (< 1024px)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Command palette state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paletteResources, setPaletteResources] = useState<ProjectResource[]>([]);
  const [paletteProjects, setPaletteProjects] = useState<Array<Record<string, unknown>>>([]);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (showCommandPalette) {
      api.workspaces
        .list()
        .then(async ({ workspaces }) => {
          const projectLists = await Promise.all(
            workspaces.map((workspace) => api.projects.list(workspace.id)),
          );
          const projects = projectLists.flatMap((result) => result.projects);
          setPaletteProjects(projects);
          const resourceLists = await Promise.all(
            projects.map((project) => api.resources.list(String(project['id']))),
          );
          setPaletteResources(resourceLists.flatMap((result) => result.resources));
        })
        .catch(() => {
          setPaletteProjects([]);
          setPaletteResources([]);
        });
    }
  }, [showCommandPalette]);

  // Handle command palette open/close with Lenis scroll control
  useEffect(() => {
    if (showCommandPalette) {
      pauseSmoothScroll();
      setTimeout(() => paletteInputRef.current?.focus(), 50);
    } else {
      resumeSmoothScroll();
    }
  }, [showCommandPalette]);

  // Keyboard shortcut for Cmd/Ctrl+K and Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      } else if (e.key === 'Escape' && showCommandPalette) {
        setShowCommandPalette(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCommandPalette]);

  return (
    <div
      data-lenis-prevent
      className="app-shell-root min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row bg-[var(--bg-app)] text-[var(--text-primary)]"
    >
      {/* ── Mobile Slide-Over Drawer Navigation (< 1024px) ── */}
      {mobileNavOpen && (
        <div
          className="modal-backdrop mobile-nav-drawer no-print"
          onClick={() => setMobileNavOpen(false)}
          style={{ justifyContent: 'flex-start', padding: 0, zIndex: 1100 }}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div
            style={{
              width: 300,
              maxWidth: '85vw',
              height: '100%',
              backgroundColor: 'var(--bg-sidebar)',
              borderRight: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              animation: 'drawerSlideRight 220ms var(--ease-out)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-drawer)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* Drawer Top Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 'var(--space-3)',
                  borderBottom: '1px solid var(--rule)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div>
                  <span
                    className="serif-display"
                    style={{
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      display: 'block',
                    }}
                  >
                    ProjectPilot
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--proof)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    DELIVERY LEDGER
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setMobileNavOpen(false)}
                  style={{ padding: '6px' }}
                  aria-label="Close menu"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              {/* Active Workspace Capsule */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 'var(--space-4)',
                  background: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {user?.displayName ? `${user.displayName}'s Workspace` : 'Workspace'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Your current workspace
                  </div>
                </div>
                <span className="badge badge-proof" style={{ fontSize: '9px', padding: '2px 6px' }}>
                  ACCOUNT
                </span>
              </div>

              {/* Navigation Links */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileNavOpen(false)}
                  className="btn btn-ghost"
                  style={{
                    justifyContent: 'flex-start',
                    padding: 'var(--space-3)',
                    background:
                      activeSection === 'projects' ? 'var(--bg-surface-elevated)' : 'transparent',
                    color:
                      activeSection === 'projects'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    fontWeight: activeSection === 'projects' ? 600 : 400,
                    borderLeft:
                      activeSection === 'projects'
                        ? '3px solid var(--accent-primary)'
                        : '3px solid transparent',
                  }}
                >
                  <ProjectIcon size={18} />
                  <span>Projects Ledger</span>
                </Link>

                <Link
                  to="/dashboard"
                  onClick={() => setMobileNavOpen(false)}
                  className="btn btn-ghost"
                  style={{
                    justifyContent: 'flex-start',
                    padding: 'var(--space-3)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <ReportIcon size={18} />
                  <span>Campus App Workbench</span>
                </Link>

                <Link
                  to="/dashboard#members"
                  onClick={(e) => {
                    setMobileNavOpen(false);
                    handleMembersClick(e);
                  }}
                  className="btn btn-ghost"
                  style={{
                    justifyContent: 'flex-start',
                    padding: 'var(--space-3)',
                    background:
                      activeSection === 'members' ? 'var(--bg-surface-elevated)' : 'transparent',
                    color:
                      activeSection === 'members' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeSection === 'members' ? 600 : 400,
                    borderLeft:
                      activeSection === 'members'
                        ? '3px solid var(--accent-primary)'
                        : '3px solid transparent',
                  }}
                >
                  <MemberIcon size={18} />
                  <span>Team Members (4)</span>
                </Link>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setSettingsOpen(true);
                  }}
                  style={{
                    justifyContent: 'flex-start',
                    padding: 'var(--space-3)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>⚙️</span>
                  <span>Settings (BYOK & MCP)</span>
                </button>

                {/* Theme Toggle within Menu */}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    toggleTheme();
                  }}
                  style={{
                    justifyContent: 'flex-start',
                    padding: 'var(--space-3)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
                  <span>Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode</span>
                </button>
              </nav>
            </div>

            {/* Bottom Drawer Actions */}
            <div
              style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}
            >
              {user && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {user.displayName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                      {user.email || 'Local user'}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={logout}>
                    Exit
                  </button>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  fontSize: '11px',
                  color: 'var(--ink-muted)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <Link
                  to="/terms"
                  onClick={() => setMobileNavOpen(false)}
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Terms
                </Link>
                <span>•</span>
                <Link
                  to="/privacy"
                  onClick={() => setMobileNavOpen(false)}
                  style={{ color: 'var(--ink-muted)' }}
                >
                  Privacy
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Left Sidebar (Strict Viewport-Locked Shell) ── */}
      <aside
        className="app-shell-sidebar desktop-only no-print lg:h-screen w-64 shrink-0 flex flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] select-none"
        aria-label="Sidebar Navigation"
      >
        {/* Top Section: Brand Logo, Workspace Switcher, Primary Nav */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Brand Logo */}
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 56,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                className="serif-display"
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                }}
              >
                Vouchlock
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--accent-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: 1,
                }}
              >
                DELIVERY LEDGER
              </span>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {user?.displayName ? `${user.displayName}'s Workspace` : 'Workspace'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Workspace</div>
            </div>
            <span className="badge badge-proof" style={{ fontSize: '9px', padding: '2px 6px' }}>
              ACCOUNT
            </span>
          </div>

          {/* Primary Navigation Links */}
          <nav
            style={{
              padding: 'var(--space-3) var(--space-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <Link
              to="/dashboard"
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                padding: 'var(--space-2) var(--space-3)',
                background:
                  activeSection === 'projects' ? 'var(--bg-surface-elevated)' : 'transparent',
                color:
                  activeSection === 'projects' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeSection === 'projects' ? 600 : 400,
                borderLeft:
                  activeSection === 'projects'
                    ? '3px solid var(--accent-primary)'
                    : '3px solid transparent',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                transition: 'all var(--t-fast) var(--ease-out)',
              }}
              title="Projects"
            >
              <ProjectIcon size={18} />
              <span>Projects</span>
            </Link>

            <Link
              to="/dashboard#members"
              onClick={handleMembersClick}
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                padding: 'var(--space-2) var(--space-3)',
                background:
                  activeSection === 'members' ? 'var(--bg-surface-elevated)' : 'transparent',
                color:
                  activeSection === 'members' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeSection === 'members' ? 600 : 400,
                borderLeft:
                  activeSection === 'members'
                    ? '3px solid var(--accent-primary)'
                    : '3px solid transparent',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                transition: 'all var(--t-fast) var(--ease-out)',
              }}
              title="Team Members"
            >
              <MemberIcon size={18} />
              <span>Team Members</span>
            </Link>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                padding: 'var(--space-2) var(--space-3)',
                color: 'var(--text-secondary)',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                transition: 'all var(--t-fast) var(--ease-out)',
                width: '100%',
              }}
              title="AI & MCP Settings"
            >
              <span style={{ fontSize: '15px', lineHeight: 1, marginRight: 2 }}>⚙️</span>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom section: User profile and sign out */}
        <div
          className="shrink-0"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-sidebar)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {/* User Profile Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: 'var(--accent-primary)',
                fontWeight: 600,
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              {(user?.displayName || 'U')
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.displayName || 'Account'}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.email || ''}
              </div>
            </div>
          </div>

          {/* Clear, accessible Sign Out / Exit button with logout icon */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={logout}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              fontSize: 'var(--font-size-meta)',
              color: 'var(--text-muted)',
              gap: 'var(--space-2)',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Sign out / Exit application"
          >
            <LogoutIcon size={14} style={{ color: 'var(--text-muted)' }} />
            <span>Sign Out / Exit</span>
          </button>
        </div>
      </aside>

      {/* ── Right Content Area: Fixed Top Header + Inner Workspace Scroll ── */}
      <div className="app-shell-content flex-1 min-w-0 min-h-0 flex flex-col lg:h-screen lg:overflow-hidden">
        {/* Top Header (h-14 shrink-0 border-b, Fixed) */}
        <header
          className="no-print h-14 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)]"
          style={{
            height: 56,
            padding: '0 var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            zIndex: 40,
          }}
        >
          {/* Left: Mobile Menu Toggle + Breadcrumbs */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}
          >
            <button
              className="btn btn-ghost btn-sm mobile-only touch-target"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              title="Open navigation menu"
              style={{ padding: '6px', minWidth: 40, minHeight: 40 }}
            >
              <IconMenu size={20} />
            </button>

            {/* Breadcrumbs with ellipsis truncation */}
            <nav
              aria-label="Breadcrumb"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--font-size-sm)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <Link
                to="/dashboard"
                style={{ color: 'var(--text-muted)', textDecoration: 'none', flexShrink: 0 }}
              >
                Workspace
              </Link>
              {breadcrumbs.map((crumb, idx) => (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: 'var(--border-strong)', flexShrink: 0 }}>/</span>
                  {crumb.href ? (
                    <Link
                      to={crumb.href}
                      style={{
                        color: 'var(--text-muted)',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          </div>

          {/* Quick Actions & Search trigger */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}
          >
            {/* Real Search Bar Trigger */}
            <button
              type="button"
              className="search-bar-trigger"
              onClick={() => {
                setSearchQuery('');
                setShowCommandPalette(true);
              }}
              title="Search projects, claims, and actions (Cmd/Ctrl+K)"
              style={{ minHeight: 36 }}
            >
              <SearchIcon size={14} style={{ color: 'var(--accent-primary)' }} />
              <span className="desktop-only" style={{ color: 'var(--text-muted)' }}>
                Search projects, claims...
              </span>
              <kbd
                className="mono-num desktop-only"
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  padding: '1px 5px',
                  fontSize: '10px',
                  marginLeft: 4,
                  color: 'var(--text-secondary)',
                }}
              >
                ⌘K
              </kbd>
            </button>

            {/* Theme Toggle */}
            <button
              className="btn btn-ghost btn-sm touch-target"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              style={{ padding: '6px', minWidth: 36, minHeight: 36 }}
            >
              {theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
            </button>
          </div>
        </header>

        {/* Dynamic Content Region: Only inner workspace view scrolls */}
        <main
          data-lenis-prevent
          className="app-shell-main flex-1 min-w-0 min-h-0 overflow-y-auto"
          style={{
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 'calc(var(--space-12) + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {children}
        </main>
      </div>

      {/* ── Native Mobile App Bottom Navigation Bar (< 768px) ── */}
      <nav className="mobile-app-bottom-bar no-print" aria-label="Mobile Bottom Navigation">
        <Link
          to="/dashboard"
          className={`mobile-bottom-nav-item ${activeSection === 'projects' ? 'active' : ''}`}
        >
          <ProjectIcon size={18} />
          <span>Ledger</span>
        </Link>
        <Link to="/dashboard" className="mobile-bottom-nav-item">
          <ReportIcon size={18} />
          <span>Workbench</span>
        </Link>
        <button
          type="button"
          className="mobile-bottom-nav-item"
          onClick={() => {
            setSearchQuery('');
            setShowCommandPalette(true);
          }}
        >
          <SearchIcon size={18} />
          <span>Search</span>
        </button>
        <button
          type="button"
          className="mobile-bottom-nav-item"
          onClick={() => setMobileNavOpen(true)}
        >
          <IconMenu size={18} />
          <span>Menu</span>
        </button>
      </nav>

      {/* ── Global Command Palette Modal (Real Live Filtered Search) ── */}
      {showCommandPalette && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCommandPalette(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
        >
          <div
            className="card modal-dialog-responsive modal-scale-enter"
            data-lenis-prevent
            style={{
              width: '100%',
              maxWidth: 620,
              padding: 0,
              background: 'var(--desk-raised)',
              border: '1px solid var(--rule-strong)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pinned Static Header with Live Search Input */}
            <div
              className="modal-header-static"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-4) var(--space-5)',
                borderBottom: '1px solid var(--rule)',
                background: 'var(--desk-raised)',
              }}
            >
              <SearchIcon size={18} style={{ color: 'var(--proof)', flexShrink: 0 }} />
              <input
                ref={paletteInputRef}
                type="text"
                className="input-field"
                placeholder="Search projects, claims, evidence, or pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--ink)',
                  flex: 1,
                  boxShadow: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSearchQuery('')}
                  style={{ padding: '2px 6px', fontSize: '11px' }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCommandPalette(false)}
                style={{ padding: '6px', flexShrink: 0 }}
                aria-label="Close search"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* Filtered Results in Scrollable Container */}
            <div
              className="modal-body-scrollable"
              data-lenis-prevent
              style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}
            >
              {(() => {
                const q = searchQuery.trim().toLowerCase();

                const items = [
                  ...paletteProjects.map((project) => ({
                    id: String(project['id']),
                    type: 'project',
                    title: String(project['name'] || 'Untitled project'),
                    desc: String(project['goal'] || 'Project in your workspace'),
                    badge: String(project['status'] || 'PROJECT').toUpperCase(),
                    badgeColor: 'badge-proof',
                    action: () => {
                      setShowCommandPalette(false);
                      navigate('/projects/' + String(project['id']));
                    },
                  })),
                  ...paletteResources.map((res) => ({
                    id: 'resource-' + res.id,
                    type: 'resource',
                    title: res.title,
                    desc: res.description || res.url,
                    badge: 'RESOURCE',
                    badgeColor: 'badge-proof',
                    action: () => {
                      setShowCommandPalette(false);
                      window.open(res.url, '_blank', 'noopener,noreferrer');
                    },
                  })),
                  {
                    id: 'nav-dashboard',
                    type: 'nav',
                    title: 'Dashboard',
                    desc: 'Your workspaces and projects',
                    badge: 'PAGE',
                    badgeColor: 'badge-neutral',
                    action: () => {
                      setShowCommandPalette(false);
                      navigate('/dashboard');
                    },
                  },
                  {
                    id: 'nav-terms',
                    type: 'nav',
                    title: 'Terms of Service',
                    desc: 'Terms and conditions',
                    badge: 'LEGAL',
                    badgeColor: 'badge-neutral',
                    action: () => {
                      setShowCommandPalette(false);
                      navigate('/terms');
                    },
                  },
                  {
                    id: 'nav-privacy',
                    type: 'nav',
                    title: 'Privacy Policy',
                    desc: 'Privacy and data handling',
                    badge: 'LEGAL',
                    badgeColor: 'badge-neutral',
                    action: () => {
                      setShowCommandPalette(false);
                      navigate('/privacy');
                    },
                  },
                  {
                    id: 'act-theme',
                    type: 'action',
                    title: 'Switch to ' + (theme === 'light' ? 'Dark' : 'Light') + ' Theme',
                    desc: 'Change the workspace color theme',
                    badge: 'ACTION',
                    badgeColor: 'badge-neutral',
                    action: () => {
                      toggleTheme();
                      setShowCommandPalette(false);
                    },
                  },
                ];

                const matches = q
                  ? items.filter(
                      (item) =>
                        item.title.toLowerCase().includes(q) ||
                        item.desc.toLowerCase().includes(q) ||
                        item.badge.toLowerCase().includes(q),
                    )
                  : items;

                if (matches.length === 0) {
                  return (
                    <div
                      style={{
                        padding: 'var(--space-8) var(--space-4)',
                        textAlign: 'center',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      <div
                        className="serif-display"
                        style={{ fontSize: 'var(--font-size-base)', color: 'var(--ink)' }}
                      >
                        No results found for &ldquo;{searchQuery}&rdquo;
                      </div>
                      <p style={{ fontSize: 'var(--font-size-meta)', marginTop: 4 }}>
                        Try searching for &ldquo;Campus&rdquo;, &ldquo;SEC-01&rdquo;,
                        &ldquo;verified&rdquo;, or &ldquo;terms&rdquo;.
                      </p>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div
                      style={{
                        padding: 'var(--space-2) var(--space-3)',
                        fontSize: '11px',
                        color: 'var(--ink-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {q ? `Matching Results (${matches.length})` : 'Quick Navigation & Claims'}
                    </div>
                    {matches.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="btn btn-ghost"
                        onClick={item.action}
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          padding: 'var(--space-2) var(--space-3)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 'var(--font-size-sm)',
                              color: 'var(--ink)',
                            }}
                          >
                            {item.title}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-meta)',
                              color: 'var(--ink-muted)',
                              marginTop: 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.desc}
                          </div>
                        </div>
                        <span
                          className={`badge ${item.badgeColor}`}
                          style={{ fontSize: '9px', flexShrink: 0 }}
                        >
                          {item.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Pinned Static Footer */}
            <div
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderTop: '1px solid var(--rule)',
                background: 'var(--desk)',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--ink-muted)',
                flexShrink: 0,
              }}
            >
              <span>
                Use <kbd className="mono-num">ESC</kbd> to close
              </span>
              <span>Vouchlock Delivery Ledger</span>
            </div>
          </div>
        </div>
      )}

      {/* Ephemeral BYOK Provider & MCP Token Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

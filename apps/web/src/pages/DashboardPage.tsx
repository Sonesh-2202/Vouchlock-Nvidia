/**
 * Organization Dashboard — Vouchlock "Paper on the Desk".
 * Executive Briefing:
 * - Giant serif truth sentence ("3 of 9 requirements proven. 1 blocked.")
 * - 4-column metric ledger strip with counting numbers (Proven, Pending, Blocked, Shipped)
 * - Wide Projects ledger table with row hover indicators
 * - Right column "Needs Attention" list in prose-like rows
 * - Bottom compact Team Roster with monograms
 * - Lenis scroll-pause and data-lenis-prevent on drawers
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, ApiRequestError } from '../api.js';
import { useAuth } from '../auth-context.js';
import { AppShell } from '../components/AppShell.js';
import { PortfolioAuditModal } from '../components/PortfolioAuditModal.js';
import {
  pauseSmoothScroll,
  resumeSmoothScroll,
  shouldAnimateEntrance,
  animateNumberCount,
} from '../motion.js';
import {
  IconProject,
  IconExport,
  IconInvite,
  IconAdd,
  IconClose,
  IconCheck,
} from '../components/icons.js';

interface ProjectRow {
  id: string;
  name: string;
  goal: string;
  status: string;
  createdAt: string;
  tasksDone: number;
  tasksTotal: number;
  reqsVerified: number;
  reqsTotal: number;
  hasBlocked: boolean;
}

interface MemberRow {
  userId: string;
  displayName: string;
  email: string | null;
  role: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [workspace, setWorkspace] = useState<{ id: string; name: string; role: string } | null>(
    null,
  );
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Search filter for projects register
  const [projectQuery, setProjectQuery] = useState('');

  // Drawer states (480px right drawer)
  const [drawerMode, setDrawerMode] = useState<'none' | 'newProject' | 'invite'>('none');
  const [projectName, setProjectName] = useState('');
  const [projectGoal, setProjectGoal] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Counting numerals refs
  const provenNumRef = useRef<HTMLSpanElement>(null);
  const pendingNumRef = useRef<HTMLSpanElement>(null);
  const blockedNumRef = useRef<HTMLSpanElement>(null);
  const shippedNumRef = useRef<HTMLSpanElement>(null);

  // Lenis scroll pause when drawer opens
  useEffect(() => {
    if (drawerMode !== 'none') {
      pauseSmoothScroll();
    } else {
      resumeSmoothScroll();
    }
  }, [drawerMode]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Smoothly scroll to Team Roster if navigated via Team Members link (#members)
  useEffect(() => {
    if (location.hash === '#members' || location.hash === '#roster') {
      const timer = setTimeout(() => {
        const rosterEl = document.getElementById('team-roster');
        if (rosterEl) {
          rosterEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location.hash, loading]);

  async function loadDashboardData() {
    setLoading(true);
    setError(null);
    try {
      const { workspaces: wsList } = await api.workspaces.list();
      let currentWs = wsList[0];
      if (!currentWs) {
        const { workspace: created } = await api.workspaces.create({
          name: `${user?.displayName || 'My'}'s Workspace`,
        });
        currentWs = { ...created, role: 'owner', createdAt: new Date().toISOString() };
      }
      setWorkspace(currentWs);

      const [wsDetail, projList] = await Promise.all([
        api.workspaces.get(currentWs.id),
        api.projects.list(currentWs.id),
      ]);

      const rawMembers = (wsDetail.members as unknown as MemberRow[]) || [];
      setMembers(rawMembers);

      // Hydrate project delivery metrics
      const rawProjects = projList.projects as Array<Record<string, unknown>>;
      const hydratedProjects: ProjectRow[] = await Promise.all(
        rawProjects.map(async (p) => {
          const pId = p['id'] as string;
          let tasksDone = 0;
          let tasksTotal = 0;
          let reqsVerified = 0;
          let reqsTotal = 0;
          let hasBlocked = false;

          try {
            const report = await api.projects.deliveryReport(pId);
            reqsVerified = report.metrics.verifiedCount;
            reqsTotal = report.metrics.totalRequirements;
            hasBlocked = report.metrics.blockedCount > 0;
          } catch {
            // Fallback for empty projects
          }

          try {
            const projData = await api.projects.get(pId);
            const tList = (projData.tasks as Array<Record<string, unknown>>) || [];
            tasksTotal = tList.length;
            tasksDone = tList.filter((t) => t['status'] === 'done').length;
            if (tList.some((t) => t['status'] === 'blocked')) hasBlocked = true;
          } catch {
            // Fallback
          }

          return {
            id: pId,
            name: (p['name'] as string) || 'Untitled Project',
            goal: (p['goal'] as string) || 'No goal statement registered.',
            status: (p['status'] as string) || 'active',
            createdAt: (p['createdAt'] as string) || new Date().toISOString(),
            tasksDone,
            tasksTotal,
            reqsVerified,
            reqsTotal,
            hasBlocked,
          };
        }),
      );

      setProjects(hydratedProjects);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'Failed to load ledger.');
    } finally {
      setLoading(false);
    }
  }

  // Aggregate State of Delivery across all projects
  const totalReqsAll = projects.reduce((acc, p) => acc + p.reqsTotal, 0);
  const totalVerifiedAll = projects.reduce((acc, p) => acc + p.reqsVerified, 0);
  const totalBlockedTasks = projects.reduce((acc, p) => acc + (p.hasBlocked ? 1 : 0), 0);
  const totalTasksDone = projects.reduce((acc, p) => acc + p.tasksDone, 0);
  const totalTasksAll = projects.reduce((acc, p) => acc + p.tasksTotal, 0);

  // Trigger smooth counting animation on first session load
  useEffect(() => {
    if (!loading && shouldAnimateEntrance('dashboard_counts')) {
      if (provenNumRef.current) animateNumberCount(provenNumRef.current, totalVerifiedAll);
      if (pendingNumRef.current) {
        animateNumberCount(pendingNumRef.current, Math.max(0, totalReqsAll - totalVerifiedAll));
      }
      if (blockedNumRef.current) animateNumberCount(blockedNumRef.current, totalBlockedTasks);
      if (shippedNumRef.current) animateNumberCount(shippedNumRef.current, totalTasksDone);
    }
  }, [loading, totalVerifiedAll, totalReqsAll, totalBlockedTasks, totalTasksDone]);

  // Handle Export Workspace Ledger JSON
  async function handleExport() {
    if (!workspace) return;
    try {
      const data = await api.workspaces.export(workspace.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace-${workspace.name.toLowerCase().replace(/\s+/g, '-')}-ledger.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export workspace ledger.');
    }
  }

  // Handle Create Project
  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!workspace || !projectName.trim()) return;
    setCreatingProject(true);
    try {
      const { project } = await api.projects.create(workspace.id, {
        name: projectName.trim(),
        goal: projectGoal.trim(),
      });
      setProjectName('');
      setProjectGoal('');
      setDrawerMode('none');
      navigate(`/projects/${project['id'] as string}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.error.message : 'Failed to register new project.',
      );
    } finally {
      setCreatingProject(false);
    }
  }

  // Handle Generate Teammate Invite
  async function handleGenerateInvite() {
    if (!workspace) return;
    setGeneratingInvite(true);
    try {
      const { invitation } = await api.workspaces.createInvitation(workspace.id, {
        role: inviteRole,
      });
      setInviteToken(invitation.token);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.error.message : 'Failed to issue invitation token.',
      );
    } finally {
      setGeneratingInvite(false);
    }
  }

  // Needs Attention items
  const attentionItems = projects.flatMap((p) => {
    const list = [];
    if (p.hasBlocked) {
      list.push({
        id: `blocked-${p.id}`,
        title: `Blocked task in ${p.name}`,
        desc: 'Engineering blocker flagged; workstream paused awaiting dependency resolution.',
        stamp: 'BLOCKED',
        isStamp: true,
        link: `/projects/${p.id}`,
      });
    }
    if (p.reqsVerified < p.reqsTotal) {
      list.push({
        id: `unverified-${p.id}`,
        title: `${p.reqsTotal - p.reqsVerified} unverified requirements in ${p.name}`,
        desc: 'Audit evidence pending sign-off before delivery report can be verified.',
        stamp: 'PENDING',
        isStamp: false,
        link: `/projects/${p.id}`,
      });
    }
    return list;
  });

  const filteredProjects = projects.filter((p) => {
    if (!projectQuery.trim()) return true;
    const q = projectQuery.trim().toLowerCase();
    return p.name.toLowerCase().includes(q) || p.goal.toLowerCase().includes(q);
  });

  return (
    <AppShell breadcrumbs={[]} activeSection="projects">
      <div
        className="container"
        style={{
          paddingTop: 'var(--space-8)',
          paddingBottom: 'var(--space-16)',
          maxWidth: '1600px',
        }}
      >
        {/* Error Banner */}
        {error && (
          <div
            className="card"
            style={{
              background: 'var(--stamp-subtle)',
              borderColor: 'var(--stamp)',
              color: 'var(--stamp)',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            role="alert"
          >
            <span>{error}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setError(null)}
              style={{ padding: '2px 8px' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Giant Executive Briefing Sentence ── */}
        <div
          style={{
            borderBottom: '1px solid var(--rule)',
            paddingBottom: 'var(--space-8)',
            marginBottom: 'var(--space-8)',
          }}
        >
          {/* Top header strip: Breadcrumb, badge, and actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <div className="flex items-center gap-2">
                <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                  OWNER LEDGER
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-meta)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {workspace?.name || 'Workspace'}
                </span>
              </div>
              <span className="desktop-only text-[11px] text-[var(--text-muted)]">
                • STATE OF DELIVERY
              </span>
            </div>

            {/* Header Actions: icon buttons on mobile, full labels on desktop */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleExport}
                title="Download workspace audit trail as JSON"
              >
                <IconExport size={14} />
                <span className="desktop-only">Export Ledger</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAuditModal(true)}
                title="Launch asynchronous workspace portfolio delivery audit"
              >
                <span>⚡ Portfolio Audit</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDrawerMode('invite');
                  setInviteToken(null);
                }}
                title="Invite an engineer or auditor"
              >
                <IconInvite size={14} />
                <span className="desktop-only">Invite Teammate</span>
              </button>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => setDrawerMode('newProject')}
                title="Register a new delivery project"
              >
                <IconAdd size={14} />
                <span>+ New Project</span>
              </button>
            </div>
          </div>

          {/* Unified Executive Bento Header */}
          <div
            style={{
              margin: 'var(--space-3) 0 var(--space-6)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-5)',
              flexWrap: 'wrap',
            }}
          >
            {/* Circular Progress Ring */}
            {(() => {
              const pct = totalReqsAll > 0 ? Math.round((totalVerifiedAll / totalReqsAll) * 100) : 0;
              const r = 26;
              const circ = 2 * Math.PI * r;
              const strokeOffset = circ - (pct / 100) * circ;

              return (
                <div
                  style={{
                    position: 'relative',
                    width: 68,
                    height: 68,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="68" height="68" viewBox="0 0 68 68" style={{ transform: 'rotate(-90deg)' }}>
                    <circle
                      cx="34"
                      cy="34"
                      r={r}
                      fill="none"
                      stroke="var(--border-subtle)"
                      strokeWidth="5"
                    />
                    <circle
                      cx="34"
                      cy="34"
                      r={r}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="5"
                      strokeDasharray={circ}
                      strokeDashoffset={strokeOffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {pct}%
                  </div>
                </div>
              );
            })()}

            {/* Modern Sans-Serif Truth Headline */}
            <div style={{ flex: 1, minWidth: 260 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: totalBlockedTasks > 0 ? '#EF4444' : '#10B981',
                    boxShadow: totalBlockedTasks > 0 ? '0 0 8px #EF4444' : '0 0 8px #10B981',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.06em',
                  }}
                >
                  PORTFOLIO TRUTHFUL DELIVERY STATUS
                </span>
              </div>
              <h1
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'clamp(1.75rem, 3.2vw, 2.75rem)',
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em',
                  color: 'var(--text-primary)',
                  margin: 0,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: '#10B981' }}>{totalVerifiedAll}</span> of{' '}
                <span>{totalReqsAll || 9}</span> requirements proven.{' '}
                <span style={{ color: totalBlockedTasks > 0 ? '#EF4444' : 'var(--text-muted)', fontWeight: 600 }}>
                  {totalBlockedTasks > 0 ? `${totalBlockedTasks} blocked.` : '0 blocked.'}
                </span>
              </h1>
            </div>
          </div>

          {/* ── 4-Column Executive Bento Grid ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-8)',
            }}
          >
            {/* Card 1: Proven */}
            <div
              className="bento-card"
              style={{
                padding: 'var(--space-4) var(--space-5)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    REQUIREMENTS PROVEN
                  </span>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    🛡️
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 700,
                    color: '#10B981',
                    letterSpacing: '-0.02em',
                    margin: '2px 0 6px',
                  }}
                >
                  <span ref={provenNumRef} className="mono-num">
                    {totalVerifiedAll}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      marginLeft: 6,
                    }}
                  >
                    / {totalReqsAll} certified
                  </span>
                </div>
              </div>
              <div
                style={{
                  height: 3,
                  background: 'var(--border-subtle)',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  marginTop: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: '#10B981',
                    width: totalReqsAll > 0 ? `${(totalVerifiedAll / totalReqsAll) * 100}%` : '0%',
                    transition: 'width 0.8s ease-out',
                  }}
                />
              </div>
            </div>

            {/* Card 2: Pending */}
            <div
              className="bento-card"
              style={{
                padding: 'var(--space-4) var(--space-5)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    AWAITING SIGN-OFF
                  </span>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    ⏳
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                    margin: '2px 0 6px',
                  }}
                >
                  <span ref={pendingNumRef} className="mono-num">
                    {Math.max(0, totalReqsAll - totalVerifiedAll)}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      marginLeft: 6,
                    }}
                  >
                    active claims
                  </span>
                </div>
              </div>
              <div
                style={{
                  height: 3,
                  background: 'var(--border-subtle)',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  marginTop: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: '#F59E0B',
                    width:
                      totalReqsAll > 0
                        ? `${((totalReqsAll - totalVerifiedAll) / totalReqsAll) * 100}%`
                        : '0%',
                    transition: 'width 0.8s ease-out',
                  }}
                />
              </div>
            </div>

            {/* Card 3: Blocked */}
            <div
              className="bento-card"
              style={{
                padding: 'var(--space-4) var(--space-5)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    BLOCKED WORKSTREAMS
                  </span>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: totalBlockedTasks > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    ⚠️
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 700,
                    color: totalBlockedTasks > 0 ? '#EF4444' : 'var(--text-muted)',
                    letterSpacing: '-0.02em',
                    margin: '2px 0 6px',
                  }}
                >
                  <span ref={blockedNumRef} className="mono-num">
                    {totalBlockedTasks}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      marginLeft: 6,
                    }}
                  >
                    stalled
                  </span>
                </div>
              </div>
              <div
                style={{
                  height: 3,
                  background: 'var(--border-subtle)',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  marginTop: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: totalBlockedTasks > 0 ? '#EF4444' : 'var(--border-subtle)',
                    width: totalBlockedTasks > 0 ? '100%' : '0%',
                    transition: 'width 0.8s ease-out',
                  }}
                />
              </div>
            </div>

            {/* Card 4: Shipped */}
            <div
              className="bento-card"
              style={{
                padding: 'var(--space-4) var(--space-5)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    TASKS SHIPPED
                  </span>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    ⚡
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                    margin: '2px 0 6px',
                  }}
                >
                  <span ref={shippedNumRef} className="mono-num">
                    {totalTasksDone}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      marginLeft: 6,
                    }}
                  >
                    / {totalTasksAll} done
                  </span>
                </div>
              </div>
              <div
                style={{
                  height: 3,
                  background: 'var(--border-subtle)',
                  borderRadius: 9999,
                  overflow: 'hidden',
                  marginTop: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: '#3B82F6',
                    width: totalTasksAll > 0 ? `${(totalTasksDone / totalTasksAll) * 100}%` : '0%',
                    transition: 'width 0.8s ease-out',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Loading Skeletons */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div className="skeleton" style={{ height: 96 }} />
            <div className="skeleton" style={{ height: 280 }} />
          </div>
        )}

        {!loading && (
          <>
            {/* ── Two-Pane Layout: Wide Projects Ledger & Needs Attention (Responsive) ── */}
            <div
              className="responsive-dashboard-split"
              style={{
                alignItems: 'start',
                marginBottom: 'var(--space-12)',
              }}
            >
              {/* Left Column: Projects Ledger Table & Mobile Cards */}
              <section aria-labelledby="projects-heading" style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-3)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <h2
                      id="projects-heading"
                      className="serif-display"
                      style={{ fontSize: 'var(--font-size-xl)', color: 'var(--ink)' }}
                    >
                      Projects Register ({filteredProjects.length})
                    </h2>
                  </div>

                  {/* Quick Project Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Filter projects..."
                      value={projectQuery}
                      onChange={(e) => setProjectQuery(e.target.value)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 'var(--font-size-meta)',
                        width: '180px',
                        maxWidth: '100%',
                      }}
                    />
                    {projectQuery && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setProjectQuery('')}
                        style={{ padding: '2px 6px', fontSize: '11px' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div
                    className="card"
                    style={{
                      background: 'var(--desk-raised)',
                      textAlign: 'center',
                      padding: 'var(--space-10) var(--space-6)',
                    }}
                  >
                    <IconProject
                      size={24}
                      style={{ color: 'var(--ink-muted)', marginBottom: 'var(--space-3)' }}
                    />
                    <h3
                      className="serif-display"
                      style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-2)' }}
                    >
                      {projectQuery
                        ? `No projects matching "${projectQuery}"`
                        : 'No projects registered in this ledger'}
                    </h3>
                    <p
                      style={{
                        color: 'var(--ink-muted)',
                        fontSize: 'var(--font-size-sm)',
                        maxWidth: '42ch',
                        margin: '0 auto var(--space-4)',
                      }}
                    >
                      {projectQuery
                        ? 'Try clearing the search filter to see all projects.'
                        : 'Create the first project to establish delivery requirements and record verification stamps.'}
                    </p>
                    {projectQuery ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setProjectQuery('')}
                      >
                        Clear Filter
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setDrawerMode('newProject')}
                      >
                        New Project
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop Ledger Table (>= 768px) */}
                    <div
                      className="desktop-only"
                      style={{
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--desk-raised)',
                        overflowX: 'auto',
                      }}
                    >
                      <table className="table-ledger" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ minWidth: 260 }}>Project & Scope</th>
                            <th style={{ width: 110 }}>Tasks</th>
                            <th style={{ width: 140 }}>Requirements</th>
                            <th style={{ width: 110 }}>Activity</th>
                            <th style={{ width: 90, textAlign: 'right' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProjects.map((p) => (
                            <tr
                              key={p.id}
                              tabIndex={0}
                              role="link"
                              aria-label={`Open project ${p.name}`}
                              onClick={() => navigate(`/projects/${p.id}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  navigate(`/projects/${p.id}`);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <td>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: 'var(--ink)',
                                    fontSize: 'var(--font-size-sm)',
                                  }}
                                >
                                  {p.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: 'var(--font-size-meta)',
                                    color: 'var(--ink-muted)',
                                    marginTop: 3,
                                    lineHeight: 1.4,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {p.goal}
                                </div>
                              </td>
                              <td>
                                <span
                                  className="mono-num"
                                  style={{ fontSize: 'var(--font-size-sm)' }}
                                >
                                  {p.tasksDone} / {p.tasksTotal}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span
                                    className="mono-num"
                                    style={{
                                      fontSize: 'var(--font-size-sm)',
                                      color: p.reqsVerified > 0 ? 'var(--proof)' : 'var(--ink)',
                                      fontWeight: p.reqsVerified > 0 ? 600 : 400,
                                    }}
                                  >
                                    {p.reqsVerified} / {p.reqsTotal}
                                  </span>
                                  {p.reqsVerified > 0 && (
                                    <IconCheck size={12} style={{ color: 'var(--proof)' }} />
                                  )}
                                </div>
                              </td>
                              <td>
                                <span
                                  className="mono-num"
                                  style={{
                                    fontSize: 'var(--font-size-meta)',
                                    color: 'var(--ink-muted)',
                                  }}
                                >
                                  {new Date(p.createdAt).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {p.hasBlocked ? (
                                  <span
                                    className="badge badge-blocked"
                                    style={{ fontSize: '10px' }}
                                  >
                                    BLOCKED
                                  </span>
                                ) : (
                                  <span
                                    className="badge badge-neutral"
                                    style={{ fontSize: '10px' }}
                                  >
                                    ACTIVE
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile App Project Cards (< 768px) */}
                    <div
                      className="mobile-only"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-3)',
                      }}
                    >
                      {filteredProjects.map((p) => (
                        <div
                          key={p.id}
                          className="card"
                          onClick={() => navigate(`/projects/${p.id}`)}
                          style={{
                            cursor: 'pointer',
                            padding: 'var(--space-4)',
                            background: 'var(--desk-raised)',
                            border: '1px solid var(--rule)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              gap: 'var(--space-2)',
                              marginBottom: 'var(--space-2)',
                            }}
                          >
                            <h3
                              style={{
                                fontSize: 'var(--font-size-base)',
                                fontWeight: 600,
                                color: 'var(--ink)',
                                margin: 0,
                                lineHeight: 1.3,
                              }}
                            >
                              {p.name}
                            </h3>
                            <span
                              className={
                                p.hasBlocked ? 'badge badge-blocked' : 'badge badge-neutral'
                              }
                              style={{ fontSize: '9px', flexShrink: 0 }}
                            >
                              {p.hasBlocked ? 'BLOCKED' : 'ACTIVE'}
                            </span>
                          </div>

                          <p
                            style={{
                              fontSize: 'var(--font-size-meta)',
                              color: 'var(--ink-muted)',
                              margin: '0 0 var(--space-3)',
                              lineHeight: 1.45,
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                            }}
                          >
                            {p.goal}
                          </p>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingTop: 'var(--space-2)',
                              borderTop: '1px solid var(--rule)',
                              fontSize: 'var(--font-size-meta)',
                            }}
                          >
                            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                              <span
                                className="mono-num"
                                style={{
                                  color: p.reqsVerified > 0 ? 'var(--proof)' : 'var(--ink)',
                                  fontWeight: p.reqsVerified > 0 ? 600 : 400,
                                }}
                              >
                                {p.reqsVerified} / {p.reqsTotal} proven
                              </span>
                              <span className="mono-num" style={{ color: 'var(--ink-muted)' }}>
                                {p.tasksDone} / {p.tasksTotal} tasks
                              </span>
                            </div>
                            <span
                              style={{ color: 'var(--proof)', fontSize: '11px', fontWeight: 600 }}
                            >
                              Open Workbench →
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* Right Column: Prose-like "Needs Attention" List */}
              <section aria-labelledby="attention-heading">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <h2
                    id="attention-heading"
                    className="serif-display"
                    style={{ fontSize: 'var(--font-size-xl)', color: 'var(--ink)' }}
                  >
                    Needs Attention ({attentionItems.length})
                  </h2>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--font-size-meta)',
                      color: 'var(--ink-muted)',
                    }}
                  >
                    IMMEDIATE ACTIONS
                  </span>
                </div>

                <div
                  style={{
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--desk-raised)',
                    padding: 'var(--space-2) 0',
                  }}
                >
                  {attentionItems.length === 0 ? (
                    <div
                      style={{
                        padding: 'var(--space-6)',
                        textAlign: 'center',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      All requirements verified and zero blocked items. Delivery ledger is fully
                      clean.
                    </div>
                  ) : (
                    attentionItems.map((item, idx) => (
                      <div
                        key={item.id}
                        onClick={() => navigate(item.link)}
                        style={{
                          padding: 'var(--space-3) var(--space-4)',
                          borderBottom:
                            idx === attentionItems.length - 1 ? 'none' : '1px solid var(--rule)',
                          cursor: 'pointer',
                          transition: 'background-color var(--t-fast) var(--ease-out)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '2px',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: 'var(--font-size-sm)',
                              color: 'var(--ink)',
                            }}
                          >
                            {item.title}
                          </span>
                          <span
                            className={item.isStamp ? 'badge badge-blocked' : 'badge badge-active'}
                            style={{ fontSize: '9px' }}
                          >
                            {item.stamp}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: 'var(--font-size-meta)',
                            color: 'var(--ink-muted)',
                            margin: 0,
                            lineHeight: 1.45,
                          }}
                        >
                          {item.desc}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Ledger Invariant Note */}
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    color: 'var(--ink-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: 'var(--ink)' }}>Audit Requirement:</strong> Unverified
                  claims will be marked as explicit delivery gaps in the Truthful Delivery Report.
                </div>
              </section>
            </div>

            {/* ── Bottom Section: Compact Monogram Team Roster ── */}
            <section
              id="team-roster"
              aria-labelledby="roster-heading"
              style={{
                borderTop: '1px solid var(--rule)',
                paddingTop: 'var(--space-8)',
                scrollMarginTop: '32px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div>
                  <h3
                    id="roster-heading"
                    className="serif-display"
                    style={{ fontSize: 'var(--font-size-lg)', color: 'var(--ink)' }}
                  >
                    Workspace Engineering Roster ({members.length})
                  </h3>
                  <div style={{ fontSize: 'var(--font-size-meta)', color: 'var(--ink-muted)' }}>
                    Accredited signers authorized to place human verification stamps
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setDrawerMode('invite');
                    setInviteToken(null);
                  }}
                >
                  + Invite Colleague
                </button>
              </div>

              {/* Compact Monogram Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                {members.map((m) => {
                  const initials = m.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div
                      key={m.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3) var(--space-4)',
                        background: 'var(--desk-raised)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--rule)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--ink)',
                          flexShrink: 0,
                        }}
                      >
                        {initials}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: 'var(--space-2)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              fontWeight: 600,
                              color: 'var(--ink)',
                              lineHeight: 1.3,
                            }}
                          >
                            {m.displayName}
                            {m.userId === user?.id && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--proof)',
                                  marginLeft: 4,
                                  fontWeight: 500,
                                }}
                              >
                                (you)
                              </span>
                            )}
                          </div>
                          <span
                            className="badge badge-neutral"
                            style={{
                              fontSize: '9px',
                              textTransform: 'uppercase',
                              padding: '1px 6px',
                              flexShrink: 0,
                            }}
                          >
                            {m.role}
                          </span>
                        </div>
                        <div
                          className="mono-num"
                          style={{
                            fontSize: '11px',
                            color: 'var(--ink-muted)',
                            marginTop: 3,
                            wordBreak: 'break-all',
                            lineHeight: 1.3,
                          }}
                        >
                          {m.email || 'local reviewer'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── 480px Right-side Drawer (New Project & Teammate Invite) ── */}
      {drawerMode !== 'none' && (
        <div
          className="modal-backdrop"
          onClick={() => setDrawerMode('none')}
          role="dialog"
          aria-modal="true"
          style={{ justifyContent: 'flex-end', padding: 0 }}
        >
          <div
            className="drawer animate-in"
            data-lenis-prevent
            style={{
              width: '100%',
              maxWidth: 480,
              height: '100%',
              background: 'var(--desk-raised)',
              borderLeft: '1px solid var(--rule)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-drawer)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Bottom Sheet Pull Handle */}
            <div className="mobile-only modal-sheet-handle" />

            {/* Pinned Static Drawer Header (Exit button always static) */}
            <div
              className="modal-header-static"
              style={{
                padding: 'var(--space-4) var(--space-6)',
                borderBottom: '1px solid var(--rule)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                background: 'var(--desk-raised)',
                position: 'sticky',
                top: 0,
                zIndex: 20,
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--proof)',
                    textTransform: 'uppercase',
                  }}
                >
                  LEDGER ACTION
                </span>
                <h3
                  className="serif-display"
                  style={{ fontSize: 'var(--font-size-xl)', color: 'var(--ink)', margin: 0 }}
                >
                  {drawerMode === 'newProject' ? 'Register New Project' : 'Invite Teammate'}
                </h3>
              </div>
              <button
                className="btn btn-ghost btn-sm touch-target"
                onClick={() => setDrawerMode('none')}
                aria-label="Close drawer"
                style={{ padding: '6px', minWidth: 40, minHeight: 40 }}
              >
                <IconClose size={20} />
              </button>
            </div>

            {/* Scrollable Drawer Content (Header stays pinned) */}
            <div
              className="modal-body-scrollable"
              data-lenis-prevent
              style={{ flex: 1, minHeight: 0, padding: 'var(--space-6)', overflowY: 'auto' }}
            >
              {drawerMode === 'newProject' ? (
                <form
                  onSubmit={handleCreateProject}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
                >
                  <div>
                    <label
                      htmlFor="drawer-proj-name"
                      className="input-label"
                      style={{ display: 'block', marginBottom: 'var(--space-1)' }}
                    >
                      Project Title
                    </label>
                    <input
                      id="drawer-proj-name"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Healthcare SOC2 Patient Portal Migration"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      required
                      autoFocus
                      maxLength={150}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="drawer-proj-goal"
                      className="input-label"
                      style={{ display: 'block', marginBottom: 'var(--space-1)' }}
                    >
                      Delivery Goal & Scope
                    </label>
                    <textarea
                      id="drawer-proj-goal"
                      className="input-field"
                      placeholder="Describe the target deliverable, client commitment, and success criteria."
                      value={projectGoal}
                      onChange={(e) => setProjectGoal(e.target.value)}
                      required
                      rows={4}
                      maxLength={2000}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>

                  <div
                    style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)' }}
                  >
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={creatingProject}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      {creatingProject ? 'Creating Project…' : 'Establish Project'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setDrawerMode('none')}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--ink-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    Generate a secure single-tenant link for an engineer or client auditor.
                  </p>

                  <div>
                    <label
                      htmlFor="drawer-invite-role"
                      className="input-label"
                      style={{ display: 'block', marginBottom: 'var(--space-1)' }}
                    >
                      Assigned Privilege Role
                    </label>
                    <select
                      id="drawer-invite-role"
                      className="input-field"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                      style={{ width: '100%' }}
                    >
                      <option value="member">
                        Member — view requirements, claim tasks, submit evidence
                      </option>
                      <option value="admin">
                        Admin — full sign-off authority and project creation
                      </option>
                    </select>
                  </div>

                  {!inviteToken ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleGenerateInvite}
                      disabled={generatingInvite}
                      style={{ justifyContent: 'center' }}
                    >
                      {generatingInvite ? 'Generating Token…' : 'Generate 7-Day Invite Link'}
                    </button>
                  ) : (
                    <div
                      style={{
                        padding: 'var(--space-4)',
                        background: 'var(--desk)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--proof)',
                          textTransform: 'uppercase',
                        }}
                      >
                        ACTIVE INVITATION LINK
                      </span>
                      <div
                        className="mono-num"
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          marginTop: 'var(--space-2)',
                          marginBottom: 'var(--space-3)',
                          padding: 'var(--space-2)',
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {`${window.location.origin}/?invite=${inviteToken || 'devtier-token-a9b1c2'}`}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const inviteUrl = `${window.location.origin}/?invite=${inviteToken || 'devtier-token-a9b1c2'}`;
                            navigator.clipboard.writeText(inviteUrl);
                            setCopiedInvite(true);
                            setTimeout(() => setCopiedInvite(false), 2500);
                          }}
                        >
                          {copiedInvite ? '✓ Link Copied!' : 'Copy Link'}
                        </button>
                        {copiedInvite && <span className="toast-pill">✓ Copied to clipboard!</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Asynchronous Portfolio Delivery Audit Modal */}
      {workspace && (
        <PortfolioAuditModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          workspaceId={workspace.id}
        />
      )}
    </AppShell>
  );
}

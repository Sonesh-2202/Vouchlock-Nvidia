import React, { useState, useEffect, useRef } from 'react';
import type { ServerlessJobRecord } from '@projectpilot/contracts';
import { api } from '../api.js';
import { CloseIcon } from './icons.js';

interface PortfolioAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export const PortfolioAuditModal: React.FC<PortfolioAuditModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
}) => {
  const [activeJob, setActiveJob] = useState<ServerlessJobRecord | null>(null);
  const [jobHistory, setJobHistory] = useState<ServerlessJobRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTarget, setExecutionTarget] = useState<'local_worker' | 'nebius_serverless_job'>(
    'local_worker',
  );
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadHistory();
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, workspaceId]);

  // Polling effect while job is in flight
  useEffect(() => {
    if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await api.jobs.getJob(activeJob.id);
          setActiveJob(res.job);
          if (
            res.job.status === 'succeeded' ||
            res.job.status === 'failed' ||
            res.job.status === 'cancelled'
          ) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            loadHistory();
          }
        } catch {
          // ignore transient poll error
        }
      }, 2000);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeJob?.id, activeJob?.status]);

  async function loadHistory() {
    try {
      const res = await api.jobs.listWorkspaceJobs(workspaceId);
      setJobHistory(res.jobs);
      if (res.jobs.length > 0 && !activeJob) {
        setActiveJob(res.jobs[0] ?? null);
      }
    } catch (err: unknown) {
      // ignore
    }
  }

  async function handleLaunchAudit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.jobs.submitPortfolioAudit({
        workspaceId,
        roleProfile: 'deep_reasoning', // Complex portfolio analysis uses deep reasoning profile
        idempotencyKey: `portfolio-audit-${Date.now()}`,
        executionTargetPreference: executionTarget,
      });
      setActiveJob(res.job);
      loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to submit portfolio audit job.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelJob(jobId: string) {
    setCancelling(true);
    try {
      const res = await api.jobs.cancelJob(jobId);
      setActiveJob(res.job);
      loadHistory();
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  }

  if (!isOpen) return null;

  const resultData = activeJob?.result as Record<string, any> | undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-document)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 14px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg, 0 20px 40px rgba(0,0,0,0.5))',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <div>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                Portfolio Delivery Audit
              </h2>
              <p
                style={{ fontSize: '11px', color: 'var(--text-muted, #A1A1AA)', margin: '2px 0 0' }}
              >
                Asynchronous delivery gap analysis across all workspace projects. Supports Nebius
                Serverless Jobs (Cloud) when configured, or local background simulation worker.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Target Preference Selector */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md, 10px)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'block',
                    color: 'var(--text-primary)',
                  }}
                >
                  Truthful Delivery Assurance Run
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Inspects requirement evidence coverage, orphan completed tasks, and delivery risk
                  indices.
                </span>
              </div>
              <button
                onClick={handleLaunchAudit}
                disabled={
                  submitting || activeJob?.status === 'running' || activeJob?.status === 'queued'
                }
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{submitting ? 'Launching...' : '⚡ Launch Portfolio Audit'}</span>
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.04em',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Select Execution Target:
              </span>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '8px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: `1px solid ${executionTarget === 'local_worker' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor:
                      executionTarget === 'local_worker'
                        ? 'rgba(16, 185, 129, 0.05)'
                        : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="executionTarget"
                    value="local_worker"
                    checked={executionTarget === 'local_worker'}
                    onChange={() => setExecutionTarget('local_worker')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong
                      style={{ fontSize: '12px', display: 'block', color: 'var(--text-primary)' }}
                    >
                      Local Simulation (Background Worker)
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Asynchronous server worker. Active &amp; ready out-of-the-box.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: `1px solid ${executionTarget === 'nebius_serverless_job' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor:
                      executionTarget === 'nebius_serverless_job'
                        ? 'rgba(16, 185, 129, 0.05)'
                        : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="executionTarget"
                    value="nebius_serverless_job"
                    checked={executionTarget === 'nebius_serverless_job'}
                    onChange={() => setExecutionTarget('nebius_serverless_job')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        Nebius Serverless Job (Cloud)
                      </strong>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(245, 158, 11, 0.2)',
                          color: '#F59E0B',
                          fontWeight: 600,
                        }}
                      >
                        REQUIRES IAM
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Dispatches containerized job to Nebius AI Cloud. Requires control-plane keys (
                      <code>NEBIUS_JOBS_API_KEY</code>).
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '12px',
                color: '#FCA5A5',
              }}
            >
              {error}
            </div>
          )}

          {/* Active Job Status Card */}
          {activeJob ? (
            <div
              style={{
                backgroundColor: 'var(--bg-surface-elevated, var(--bg-surface))',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md, 10px)',
                padding: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      backgroundColor:
                        activeJob.status === 'succeeded'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : activeJob.status === 'running'
                            ? 'rgba(59, 130, 246, 0.2)'
                            : activeJob.status === 'queued'
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                      color:
                        activeJob.status === 'succeeded'
                          ? '#10B981'
                          : activeJob.status === 'running'
                            ? '#60A5FA'
                            : activeJob.status === 'queued'
                              ? '#F59E0B'
                              : '#EF4444',
                      border: `1px solid ${
                        activeJob.status === 'succeeded'
                          ? '#10B981'
                          : activeJob.status === 'running'
                            ? '#3B82F6'
                            : activeJob.status === 'queued'
                              ? '#F59E0B'
                              : '#EF4444'
                      }`,
                    }}
                  >
                    {activeJob.status}
                  </span>

                  {/* Execution Target Badge */}
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      backgroundColor:
                        activeJob.executionTarget === 'nebius_serverless_job'
                          ? 'rgba(118, 185, 0, 0.15)'
                          : 'rgba(161, 161, 170, 0.15)',
                      color:
                        activeJob.executionTarget === 'nebius_serverless_job'
                          ? '#76B900'
                          : '#A1A1AA',
                      border: `1px solid ${
                        activeJob.executionTarget === 'nebius_serverless_job'
                          ? '#76B900'
                          : '#52525B'
                      }`,
                    }}
                  >
                    {activeJob.executionTarget === 'nebius_serverless_job'
                      ? 'Nebius Serverless Job (Cloud)'
                      : 'Local Simulation (Background Worker)'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(activeJob.status === 'running' || activeJob.status === 'queued') && (
                    <button
                      onClick={() => handleCancelJob(activeJob.id)}
                      disabled={cancelling}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '2px 8px', color: '#EF4444' }}
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Job'}
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                    }}
                  >
                    Job ID: {activeJob.id.slice(0, 8)}...
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginBottom: '4px',
                  }}
                >
                  <span>Analysis Progress</span>
                  <span>{activeJob.progressPercent}%</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: '#27272A',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${activeJob.progressPercent}%`,
                      height: '100%',
                      backgroundColor: activeJob.status === 'succeeded' ? '#10B981' : '#3B82F6',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Error readout */}
              {activeJob.error && (
                <div
                  style={{
                    padding: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #EF4444',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#F87171',
                  }}
                >
                  Error: {activeJob.error}
                </div>
              )}

              {/* Succeeded Report Surface */}
              {activeJob.status === 'succeeded' && resultData && (
                <div
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Executive KPI Strip */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm, 8px)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Portfolio Integrity Score
                      </span>
                      <div
                        style={{
                          fontSize: '20px',
                          fontWeight: 800,
                          color: resultData.portfolioIntegrityScore > 75 ? '#10B981' : '#F59E0B',
                        }}
                      >
                        {resultData.portfolioIntegrityScore} / 100
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm, 8px)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Truthful Proof Gap
                      </span>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>
                        {resultData.auditMetadata?.deliveryProofGapRatePercent ?? 0}%
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm, 8px)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Integrity Classification
                      </span>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          marginTop: '4px',
                          color: '#60A5FA',
                          textTransform: 'capitalize',
                        }}
                      >
                        {(resultData.integrityStatus || '').replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Executive Summary */}
                  {resultData.executiveSummary && (
                    <div
                      style={{
                        padding: '14px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm, 8px)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <strong
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          display: 'block',
                          marginBottom: '4px',
                        }}
                      >
                        Executive Delivery Assessment
                      </strong>
                      <p
                        style={{
                          fontSize: '12px',
                          lineHeight: 1.5,
                          color: 'var(--text-secondary)',
                          margin: 0,
                        }}
                      >
                        {resultData.executiveSummary}
                      </p>
                    </div>
                  )}

                  {/* Critical Gaps */}
                  {Array.isArray(resultData.criticalGaps) && resultData.criticalGaps.length > 0 && (
                    <div
                      style={{
                        padding: '14px',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm, 8px)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <strong
                        style={{
                          fontSize: '12px',
                          color: '#EF4444',
                          display: 'block',
                          marginBottom: '8px',
                        }}
                      >
                        Critical Verification &amp; Proof Gaps ({resultData.criticalGaps.length})
                      </strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {resultData.criticalGaps.map((gap: any, i: number) => (
                          <div
                            key={i}
                            style={{
                              padding: '10px',
                              backgroundColor: 'var(--bg-surface-elevated, var(--bg-surface))',
                              borderRadius: 'var(--radius-sm, 6px)',
                              border: '1px solid var(--border-subtle)',
                              fontSize: '11px',
                            }}
                          >
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {gap.title || gap.requirementId}
                            </div>
                            <div style={{ color: '#F87171', marginTop: '2px' }}>
                              {gap.riskAssessment}
                            </div>
                            <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                              Mitigation: {gap.recommendedMitigation}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Safe Provenance Strip */}
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div>
                      Model ID:{' '}
                      <strong style={{ color: '#10B981' }}>
                        {activeJob.modelId ||
                          resultData.auditMetadata?.modelId ||
                          'Confirmed Nemotron'}
                      </strong>
                    </div>
                    <div>
                      Routing Profile:{' '}
                      <span style={{ color: '#60A5FA' }}>
                        {activeJob.modelRole || 'deep_reasoning'}
                      </span>
                    </div>
                    {resultData.auditMetadata?.routingReason && (
                      <div>
                        Reason: <span>{resultData.auditMetadata.routingReason}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: '36px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md, 10px)',
                background: 'var(--bg-surface)',
              }}
            >
              No portfolio delivery audit runs recorded for this workspace yet. Click above to run
              an asynchronous analysis.
            </div>
          )}

          {/* Job History Table */}
          {jobHistory.length > 1 && (
            <div>
              <h4
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '8px',
                }}
              >
                Previous Workspace Audit Runs
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {jobHistory.map((j) => (
                  <div
                    key={j.id}
                    onClick={() => setActiveJob(j)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor:
                        activeJob?.id === j.id
                          ? 'var(--bg-surface-elevated, var(--bg-surface))'
                          : 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    <span>{new Date(j.createdAt).toLocaleString()}</span>
                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{j.status}</span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {j.executionTarget}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

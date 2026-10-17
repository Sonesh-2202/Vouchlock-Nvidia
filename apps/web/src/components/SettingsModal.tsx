/**
 * SettingsModal — Unified BYOK Provider and MCP Token Management.
 * Implements:
 * - Ephemeral BYOK key configuration with test, save, masked status, and revoke.
 * - Clear disclosure of process-only memory storage and automatic logout wipe.
 * - Scoped MCP token generation (mcp:read vs mcp:admin role-gated), one-time reveal, and revocation.
 */

import { useState, useEffect } from 'react';
import { api, type ApiRequestError } from '../api.js';
import { CloseIcon, IconCopy, IconCheck, IconTrash } from './icons.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  userRole?: string;
}

interface ProviderInfo {
  id: string;
  label: string;
  tested: boolean;
  requiresApiKey: boolean;
  description?: string;
}

interface ProviderSession {
  provider: string;
  keySuffix: string;
  status: string;
  workspaceId?: string;
  createdAt: string;
}

interface McpTokenItem {
  id: string;
  scopes: string[];
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
}

export function SettingsModal({
  isOpen,
  onClose,
  workspaceId,
  userRole = 'member',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'providers' | 'mcp'>('providers');

  // Providers state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeSessions, setActiveSessions] = useState<ProviderSession[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(workspaceId);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingKey, setTestingKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [providerMessage, setProviderMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // MCP state
  const [mcpTokens, setMcpTokens] = useState<McpTokenItem[]>([]);
  const [selectedScope, setSelectedScope] = useState<'mcp:read' | 'mcp:admin'>('mcp:read');
  const [ttlDays, setTtlDays] = useState(30);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [mcpMessage, setMcpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const canGrantAdmin = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, workspaceId]);

  async function loadData() {
    setProviderMessage(null);
    setMcpMessage(null);
    try {
      let resolvedWorkspaceId = workspaceId;
      if (!resolvedWorkspaceId) {
        const { workspaces } = await api.workspaces.list();
        resolvedWorkspaceId = workspaces[0]?.id;
      }
      setActiveWorkspaceId(resolvedWorkspaceId);
      const [provRes, sessRes, tokRes] = await Promise.all([
        api.providers.listAvailable().catch(() => ({ providers: [] })),
        api.providers.listSessions(resolvedWorkspaceId).catch(() => ({ sessions: [] })),
        resolvedWorkspaceId
          ? api.mcp.listTokens(resolvedWorkspaceId).catch(() => ({ tokens: [] }))
          : Promise.resolve({ tokens: [] }),
      ]);
      setProviders(provRes.providers || []);
      setActiveSessions(sessRes.sessions || []);
      setMcpTokens(tokRes.tokens || []);
    } catch {
      // Fallback
    }
  }

  async function handleTestKey() {
    setTestingKey(true);
    setProviderMessage(null);
    try {
      const res = await api.providers.testSession(selectedProvider, apiKeyInput);
      setProviderMessage({
        type: 'success',
        text: res.message || 'Credentials verified successfully.',
      });
    } catch (err: any) {
      setProviderMessage({
        type: 'error',
        text: err?.error?.message || err?.message || 'Failed to verify provider credentials.',
      });
    } finally {
      setTestingKey(false);
    }
  }

  async function handleSaveKey() {
    setSavingKey(true);
    setProviderMessage(null);
    try {
      await api.providers.setSession(selectedProvider, apiKeyInput, activeWorkspaceId);
      setApiKeyInput('');
      setProviderMessage({
        type: 'success',
        text: `Ephemeral key saved for provider "${selectedProvider}". Active in process memory until logout.`,
      });
      const sessRes = await api.providers.listSessions(activeWorkspaceId);
      setActiveSessions(sessRes.sessions || []);
    } catch (err: any) {
      setProviderMessage({
        type: 'error',
        text: err?.error?.message || err?.message || 'Failed to establish provider session.',
      });
    } finally {
      setSavingKey(false);
    }
  }

  async function handleRevokeSession(provider: string) {
    try {
      await api.providers.deleteSession(provider, activeWorkspaceId);
      setProviderMessage({ type: 'success', text: `Revoked session key for ${provider}.` });
      const sessRes = await api.providers.listSessions(activeWorkspaceId);
      setActiveSessions(sessRes.sessions || []);
    } catch (err: any) {
      setProviderMessage({ type: 'error', text: err?.message || 'Failed to revoke session.' });
    }
  }

  async function handleCreateMcpToken() {
    setGeneratingToken(true);
    setMcpMessage(null);
    setNewlyCreatedToken(null);
    try {
      const wsId = activeWorkspaceId;
      if (!wsId) throw new Error('Create a workspace before issuing an MCP token.');
      const created = await api.mcp.createToken(wsId, [selectedScope], ttlDays);
      setNewlyCreatedToken(created.token);
      setMcpMessage({
        type: 'success',
        text: 'Token generated successfully! Copy it now — it cannot be retrieved again.',
      });
      const tokRes = await api.mcp.listTokens(activeWorkspaceId);
      setMcpTokens(tokRes.tokens || []);
    } catch (err: any) {
      setMcpMessage({
        type: 'error',
        text: err?.error?.message || err?.message || 'Failed to issue MCP token.',
      });
    } finally {
      setGeneratingToken(false);
    }
  }

  async function handleRevokeMcpToken(tokenId: string) {
    try {
      await api.mcp.revokeToken({ tokenId });
      setMcpMessage({ type: 'success', text: 'Token revoked successfully.' });
      const tokRes = await api.mcp.listTokens(workspaceId);
      setMcpTokens(tokRes.tokens || []);
    } catch (err: any) {
      setMcpMessage({ type: 'error', text: err?.message || 'Failed to revoke token.' });
    }
  }

  async function handleRevokeAllMcpTokens() {
    if (
      !confirm(
        'Are you sure you want to revoke all your MCP tokens? External assistants using these tokens will lose access immediately.',
      )
    ) {
      return;
    }
    try {
      const res = await api.mcp.revokeToken({ revokeAll: true });
      setMcpMessage({ type: 'success', text: `Revoked ${res.revokedCount} token(s).` });
      const tokRes = await api.mcp.listTokens(workspaceId);
      setMcpTokens(tokRes.tokens || []);
    } catch (err: any) {
      setMcpMessage({ type: 'error', text: err?.message || 'Failed to revoke all tokens.' });
    }
  }

  function handleCopyToken() {
    if (newlyCreatedToken) {
      navigator.clipboard.writeText(newlyCreatedToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="paper-sheet"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-document)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.2))',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              className="serif-display"
              style={{
                fontSize: 'var(--font-size-xl)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Workspace & AI Settings
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
              }}
            >
              Configure ephemeral Bring-Your-Own-Key (BYOK) providers and MCP assistant tokens.
            </p>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ padding: '6px' }}
            aria-label="Close settings"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setActiveTab('providers')}
            style={{
              flex: 1,
              borderRadius: 0,
              padding: 'var(--space-3)',
              fontWeight: activeTab === 'providers' ? 600 : 400,
              color: activeTab === 'providers' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom:
                activeTab === 'providers'
                  ? '2px solid var(--accent-primary)'
                  : '2px solid transparent',
            }}
          >
            AI Providers (BYOK)
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setActiveTab('mcp')}
            style={{
              flex: 1,
              borderRadius: 0,
              padding: 'var(--space-3)',
              fontWeight: activeTab === 'mcp' ? 600 : 400,
              color: activeTab === 'mcp' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom:
                activeTab === 'mcp' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            MCP Assistant Tokens
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 'var(--space-6)', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'providers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* Privacy Disclosure Notice */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'rgba(217, 119, 6, 0.08)',
                  border: '1px solid rgba(217, 119, 6, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: '1.5',
                  color: 'var(--text-primary)',
                }}
              >
                <strong
                  style={{ display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}
                >
                  🔒 Ephemeral Memory & Privacy Safeguards
                </strong>
                Credentials you submit here are stored exclusively in temporary server process
                memory for your current session. Keys are <strong>never</strong> saved to browser
                localStorage, cookies, PostgreSQL database, analytics, or server log files. All
                active provider keys are automatically wiped on logout or after 24 hours of
                inactivity.
              </div>

              {providerMessage && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    backgroundColor:
                      providerMessage.type === 'success'
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${
                      providerMessage.type === 'success' ? '#10B981' : '#EF4444'
                    }`,
                    color: providerMessage.type === 'success' ? '#059669' : '#DC2626',
                  }}
                >
                  {providerMessage.text}
                </div>
              )}

              {/* Provider Selection */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    marginBottom: 'var(--space-2)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Select Provider
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--space-2)',
                  }}
                >
                  {providers
                    .filter((p) => p.id !== 'mock')
                    .map((p) => {
                      const isSelected = selectedProvider === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (p.tested) setSelectedProvider(p.id);
                          }}
                          style={{
                            padding: 'var(--space-3)',
                            border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isSelected
                              ? 'var(--bg-surface-elevated)'
                              : 'var(--bg-surface)',
                            cursor: p.tested ? 'pointer' : 'not-allowed',
                            opacity: p.tested ? 1 : 0.6,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
                              {p.label}
                            </span>
                            <span
                              className={`badge ${p.tested ? 'badge-proof' : 'badge-blocked'}`}
                              style={{ fontSize: '9px', padding: '1px 5px' }}
                            >
                              {p.tested ? 'TESTED' : 'UNTESTED'}
                            </span>
                          </div>
                          {p.description && (
                            <p
                              style={{
                                margin: '4px 0 0',
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {p.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* API Key Input */}
              {selectedProvider !== 'mock' && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                      marginBottom: 'var(--space-2)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Enter API Key for {selectedProvider.toUpperCase()}
                  </label>
                  <input
                    type="password"
                    placeholder={
                      selectedProvider === 'gemini'
                        ? 'Google AI Studio API key'
                        : 'Paste provider API key'
                    }
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="input"
                    style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                  />
                  <div
                    style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}
                  >
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleTestKey}
                      disabled={testingKey || !apiKeyInput.trim()}
                    >
                      {testingKey ? 'Verifying...' : 'Test Credentials'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveKey}
                      disabled={savingKey || !apiKeyInput.trim()}
                    >
                      {savingKey ? 'Saving...' : 'Save Session Key'}
                    </button>
                  </div>
                </div>
              )}

              {/* Active Ephemeral Sessions List */}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 'var(--space-4)',
                }}
              >
                <h3
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    margin: '0 0 var(--space-3)',
                  }}
                >
                  Active Ephemeral Sessions ({activeSessions.length})
                </h3>
                {activeSessions.length === 0 ? (
                  <p
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      margin: 0,
                    }}
                  >
                    No active credentials in process memory. Add and test a provider key before
                    generating AI plans or Copilot reports.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {activeSessions.map((s) => (
                      <div
                        key={s.provider}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--space-3)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface)',
                        }}
                      >
                        <div>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
                              {s.provider.toUpperCase()}
                            </span>
                            <span
                              className="badge badge-proof"
                              style={{ fontSize: '9px', padding: '1px 5px' }}
                            >
                              ACTIVE (EPHEMERAL)
                            </span>
                          </div>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Key: {s.keySuffix} · Established:{' '}
                            {new Date(s.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRevokeSession(s.provider)}
                          style={{ color: '#EF4444' }}
                        >
                          Revoke Key
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'mcp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: '1.5',
                  color: 'var(--text-primary)',
                }}
              >
                <strong>Model Context Protocol (MCP) Integration:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                  External AI assistants (Claude Desktop, Cursor, CLI agents) can connect to
                  ProjectPilot at{' '}
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--desk)',
                      padding: '2px 4px',
                    }}
                  >
                    http://localhost:3001/mcp
                  </code>{' '}
                  using standard Streamable HTTP with an Authorization Bearer token.
                </p>
              </div>

              {mcpMessage && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    backgroundColor:
                      mcpMessage.type === 'success'
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${mcpMessage.type === 'success' ? '#10B981' : '#EF4444'}`,
                    color: mcpMessage.type === 'success' ? '#059669' : '#DC2626',
                  }}
                >
                  {mcpMessage.text}
                </div>
              )}

              {/* One-time token display banner */}
              {newlyCreatedToken && (
                <div
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid #3B82F6',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-xs)',
                      color: '#2563EB',
                      marginBottom: '6px',
                    }}
                  >
                    ⚠️ One-Time Secret Token:
                  </strong>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                      type="text"
                      readOnly
                      value={newlyCreatedToken}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--desk)',
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCopyToken}
                    >
                      {copiedToken ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Issue Token Form */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <h3
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    margin: '0 0 var(--space-3)',
                  }}
                >
                  Generate New MCP Token
                </h3>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 'var(--font-size-xs)',
                        marginBottom: '4px',
                      }}
                    >
                      Scope
                    </label>
                    <select
                      className="input"
                      value={selectedScope}
                      onChange={(e) => setSelectedScope(e.target.value as any)}
                      style={{ width: '100%' }}
                    >
                      <option value="mcp:read">mcp:read (Read-Only Tools)</option>
                      {canGrantAdmin && (
                        <option value="mcp:admin">mcp:admin (Administrative)</option>
                      )}
                    </select>
                    {!canGrantAdmin && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        mcp:admin scope requires workspace Owner or Admin role.
                      </span>
                    )}
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 'var(--font-size-xs)',
                        marginBottom: '4px',
                      }}
                    >
                      Expiry (TTL)
                    </label>
                    <select
                      className="input"
                      value={ttlDays}
                      onChange={(e) => setTtlDays(Number(e.target.value))}
                      style={{ width: '100%' }}
                    >
                      <option value={7}>7 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={90}>90 Days</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleCreateMcpToken}
                  disabled={generatingToken}
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  {generatingToken ? 'Issuing...' : 'Generate MCP Token'}
                </button>
              </div>

              {/* Active Tokens Table */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <h3
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      margin: 0,
                    }}
                  >
                    Active Tokens ({mcpTokens.filter((t) => !t.revokedAt).length})
                  </h3>
                  {mcpTokens.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={handleRevokeAllMcpTokens}
                      style={{ color: '#EF4444', fontSize: '11px' }}
                    >
                      Revoke All My Tokens
                    </button>
                  )}
                </div>

                {mcpTokens.length === 0 ? (
                  <p
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      margin: 0,
                    }}
                  >
                    No MCP tokens created yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {mcpTokens.map((t) => {
                      const isRevoked = Boolean(t.revokedAt);
                      const isExpired = new Date(t.expiresAt) < new Date();
                      return (
                        <div
                          key={t.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 'var(--space-3)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isRevoked ? 'rgba(0,0,0,0.02)' : 'var(--bg-surface)',
                            opacity: isRevoked || isExpired ? 0.6 : 1,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-2)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 600,
                                  fontSize: 'var(--font-size-xs)',
                                }}
                              >
                                {t.id}
                              </span>
                              {t.scopes.map((s) => (
                                <span
                                  key={s}
                                  className="badge badge-proof"
                                  style={{ fontSize: '9px', padding: '1px 5px' }}
                                >
                                  {s}
                                </span>
                              ))}
                              {isRevoked && (
                                <span
                                  className="badge badge-blocked"
                                  style={{ fontSize: '9px', padding: '1px 5px' }}
                                >
                                  REVOKED
                                </span>
                              )}
                              {!isRevoked && isExpired && (
                                <span
                                  className="badge badge-blocked"
                                  style={{ fontSize: '9px', padding: '1px 5px' }}
                                >
                                  EXPIRED
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Expires: {new Date(t.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                          {!isRevoked && !isExpired && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleRevokeMcpToken(t.id)}
                              style={{ color: '#EF4444' }}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-6)',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

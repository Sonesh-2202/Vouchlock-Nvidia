import React, { useState, useEffect, useCallback } from 'react';
import type { DiscoveredModel, ModelCatalogResponse } from '@projectpilot/contracts';
import { api } from '../api';

export interface ModelPickerProps {
  workspaceId?: string;
  selectedProvider?: string;
  onSelectProvider?: (provider: string) => void;
  selectedModelId?: string;
  selectedRoleProfile?: 'fast' | 'balanced' | 'deep_reasoning';
  onSelectModel?: (modelId: string, modelInfo?: DiscoveredModel) => void;
  onSelectRole?: (role: 'fast' | 'balanced' | 'deep_reasoning') => void;
  onOpenSettings?: () => void;
  compact?: boolean;
  showRoles?: boolean;
  className?: string;
  defaultExpanded?: boolean;
}

export function getModelCapabilityBadge(modelId: string, roleSuggestion?: string) {
  if (roleSuggestion === 'deep_reasoning') {
    return { label: '🧠 Deep Reasoning', badgeClass: 'badge-role badge-role-reasoning' };
  }
  if (roleSuggestion === 'fast') {
    return { label: '⚡ Fast', badgeClass: 'badge-role badge-role-fast' };
  }
  if (roleSuggestion === 'balanced') {
    return { label: '⚖️ Balanced', badgeClass: 'badge-role badge-role-balanced' };
  }
  const lower = modelId.toLowerCase();
  if (lower.includes('vl') || lower.includes('vision')) {
    return { label: '👁️ Vision / VL', badgeClass: 'badge-role badge-role-vision' };
  }
  return { label: '❓ Unclassified', badgeClass: 'badge-role badge-role-unclassified' };
}

export function getModelHumanTitle(
  model: DiscoveredModel | { id: string; displayName?: string },
): string {
  const id = model.id || '';
  if (model.displayName && model.displayName.trim().length > 0 && model.displayName !== id) {
    return model.displayName.trim();
  }
  return id;
}

export function getRoleProfileLabel(role: 'fast' | 'balanced' | 'deep_reasoning'): string {
  if (role === 'fast') return '⚡ Fast Profile';
  if (role === 'deep_reasoning') return '🧠 Deep Reasoning Profile';
  return '⚖️ Balanced Profile';
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  workspaceId,
  selectedProvider = 'nebius',
  onSelectProvider,
  selectedModelId: externalSelectedModelId,
  selectedRoleProfile: externalRoleProfile,
  onSelectModel,
  onSelectRole,
  onOpenSettings,
  compact = false,
  showRoles = true,
  className = '',
  defaultExpanded = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalogResponse | null>(null);

  // Active credential source detection (Server Key vs ephemeral personal BYOK)
  const [activeCredentialSource, setActiveCredentialSource] = useState<'server' | 'byok'>('server');
  const [byokSuffix, setByokSuffix] = useState<string | null>(null);

  // Collapsible drawer state: closed by default (unless defaultExpanded is true)
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  // Preference mode: 'role' (automatic routing) or 'explicit' (pinned model)
  const [mode, setMode] = useState<'role' | 'explicit'>(
    externalSelectedModelId ? 'explicit' : 'role',
  );

  const [activeRole, setActiveRole] = useState<'fast' | 'balanced' | 'deep_reasoning'>(
    externalRoleProfile || 'balanced',
  );
  const [selectedId, setSelectedId] = useState<string>(externalSelectedModelId || '');
  const [filterNemotronOnly, setFilterNemotronOnly] = useState<boolean>(true);
  const [showMetadataDetails, setShowMetadataDetails] = useState<boolean>(false);

  const fetchCredentialStatus = useCallback(async () => {
    try {
      const { sessions } = await api.providers.listSessions(workspaceId);
      const nebiusSession = sessions?.find((s) => s.provider === 'nebius');
      if (nebiusSession) {
        setActiveCredentialSource('byok');
        setByokSuffix(nebiusSession.keySuffix);
      } else {
        setActiveCredentialSource('server');
        setByokSuffix(null);
      }
    } catch {
      setActiveCredentialSource('server');
      setByokSuffix(null);
    }
  }, [workspaceId]);

  const fetchCatalog = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        await fetchCredentialStatus();
        const response = await api.models.getCatalog({ refresh, workspaceId });
        setCatalog(response);

        // Also fetch saved preferences if not externally supplied
        if (!externalSelectedModelId && !externalRoleProfile) {
          try {
            const { preferences } = await api.models.getPreferences(workspaceId);
            if (preferences.selectedModelId) {
              setSelectedId(preferences.selectedModelId);
              setMode('explicit');
            } else if (preferences.selectedRoleProfile) {
              setActiveRole(preferences.selectedRoleProfile);
              setMode('role');
            }
          } catch {
            // ignore preference fetch error
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Could not fetch live model catalog from Nebius Token Factory.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceId, externalSelectedModelId, externalRoleProfile, fetchCredentialStatus],
  );

  useEffect(() => {
    fetchCatalog(false);
  }, [fetchCatalog]);

  useEffect(() => {
    if (externalSelectedModelId !== undefined) {
      setSelectedId(externalSelectedModelId);
      if (externalSelectedModelId) setMode('explicit');
    }
  }, [externalSelectedModelId]);

  useEffect(() => {
    if (externalRoleProfile !== undefined) {
      setActiveRole(externalRoleProfile);
    }
  }, [externalRoleProfile]);

  const handleRoleChange = async (role: 'fast' | 'balanced' | 'deep_reasoning') => {
    // If the catalog does not have a candidate for this role, we can still record intent,
    // but the UI must visibly show that this role is currently unfulfilled.
    setActiveRole(role);
    setMode('role');
    setSelectedId('');
    if (onSelectRole) onSelectRole(role);
    if (onSelectModel) onSelectModel('');

    try {
      await api.models.savePreferences(
        { selectedRoleProfile: role, selectedModelId: '' },
        workspaceId,
      );
    } catch {
      // Local state is preserved regardless
    }
  };

  const handleModelSelect = async (modelId: string) => {
    setSelectedId(modelId);
    setMode('explicit');
    const model = catalog?.models?.find((m) => m.id === modelId);
    if (onSelectModel) onSelectModel(modelId, model);

    try {
      await api.models.savePreferences({ selectedModelId: modelId }, workspaceId);
    } catch {
      // Local state preserved
    }
  };

  const discoveredNemotrons = catalog?.nemotronModels || [];
  const visibleModels = catalog ? (filterNemotronOnly ? discoveredNemotrons : catalog.models) : [];

  const currentSelectedModel = catalog?.models?.find((m) => m.id === selectedId);
  const isSelectedModelUnavailable = Boolean(selectedId && catalog && !currentSelectedModel);

  const currentActiveModelForRole =
    mode === 'role' && catalog?.roleAssignments
      ? catalog.roleAssignments[activeRole]
      : currentSelectedModel;

  const isCurrentRoleUnavailable =
    mode === 'role' && catalog && !catalog.roleAssignments?.[activeRole];

  const effectiveActiveId =
    selectedProvider !== 'nebius'
      ? selectedProvider === 'openai'
        ? 'openai/gpt-4o'
        : 'google/gemini-1.5-pro'
      : mode === 'role'
        ? currentActiveModelForRole?.id ||
          (catalog ? 'Role Unavailable (No Candidate)' : 'Discovering Models...')
        : selectedId ||
          (catalog?.models?.[0]?.id ? `${catalog.models[0].id} (Unpinned)` : 'No Model Selected');

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-xs ${className}`}>
        {loading ? (
          <span className="text-zinc-400 animate-pulse">Discovering models...</span>
        ) : error ? (
          <span className="text-red-400 font-mono flex items-center gap-1">
            ⚠ Discovery failed
            <button
              onClick={() => fetchCatalog(true)}
              className="underline hover:text-red-300 ml-1 cursor-pointer"
              title={error}
            >
              Retry
            </button>
          </span>
        ) : (
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700/60 rounded px-2.5 py-1">
            <span
              className={`w-2 h-2 rounded-full ${isCurrentRoleUnavailable ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}
              title="Nebius Token Factory Catalog"
            />
            <span className="text-zinc-400 font-medium">Model:</span>
            {mode === 'role' ? (
              <span
                className={`font-mono font-medium ${isCurrentRoleUnavailable ? 'text-amber-400' : 'text-emerald-400'}`}
              >
                {getRoleProfileLabel(activeRole)}{' '}
                {currentActiveModelForRole
                  ? `(${getModelHumanTitle(currentActiveModelForRole)})`
                  : '(Unavailable)'}
              </span>
            ) : (
              <span
                className="text-zinc-200 font-mono font-medium truncate max-w-[200px]"
                title={selectedId}
              >
                {currentSelectedModel
                  ? getModelHumanTitle(currentSelectedModel)
                  : selectedId || 'No selection'}
              </span>
            )}
            <button
              onClick={() => fetchCatalog(true)}
              disabled={refreshing}
              className="text-zinc-400 hover:text-zinc-200 ml-1 disabled:opacity-50 cursor-pointer"
              title="Refresh live catalog from Nebius Token Factory"
            >
              {refreshing ? '⟳' : '↻'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`ai-control-bar-wrapper ${className}`}>
      {/* ── 1-Line Unified AI Engine & Speed Control Bar (Always Visible) ── */}
      <div className="ai-control-bar-row">
        {/* Left Side: Provider Dropdown + 3-Way Speed Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedProvider}
            onChange={(e) => onSelectProvider?.(e.target.value)}
            className="ai-provider-select"
            title="Select AI Inference Engine"
          >
            <option value="nebius">🟢 NVIDIA Nemotron (Nebius)</option>
            <option value="openai">OpenAI GPT-4o (BYOK)</option>
            <option value="gemini">Google Gemini (BYOK)</option>
          </select>

          {selectedProvider === 'nebius' ? (
            <div
              className="ai-speed-switcher"
              role="radiogroup"
              aria-label="NVIDIA Nemotron Speed Profile"
            >
              <button
                type="button"
                onClick={() => handleRoleChange('fast')}
                className={`ai-speed-pill ${mode === 'role' && activeRole === 'fast' ? 'active' : ''} ${catalog && !catalog.roleAssignments?.fast ? 'opacity-60' : ''}`}
                title={
                  catalog?.roleAssignments?.fast
                    ? `Nano candidate: ${catalog.roleAssignments.fast.id}`
                    : 'Fast profile unavailable in this account catalog'
                }
              >
                <span>⚡ Fast</span>
                {catalog && !catalog.roleAssignments?.fast && (
                  <span className="text-[9px] text-amber-400 ml-1">(N/A)</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('balanced')}
                className={`ai-speed-pill ${mode === 'role' && activeRole === 'balanced' ? 'active' : ''} ${catalog && !catalog.roleAssignments?.balanced ? 'opacity-60' : ''}`}
                title={
                  catalog?.roleAssignments?.balanced
                    ? `Super candidate: ${catalog.roleAssignments.balanced.id}`
                    : 'Balanced profile unavailable in this account catalog'
                }
              >
                <span>⚖️ Balanced</span>
                {catalog && !catalog.roleAssignments?.balanced && (
                  <span className="text-[9px] text-amber-400 ml-1">(N/A)</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('deep_reasoning')}
                className={`ai-speed-pill ${mode === 'role' && activeRole === 'deep_reasoning' ? 'active' : ''} ${catalog && !catalog.roleAssignments?.deep_reasoning ? 'opacity-60' : ''}`}
                title={
                  catalog?.roleAssignments?.deep_reasoning
                    ? `Ultra candidate: ${catalog.roleAssignments.deep_reasoning.id}`
                    : 'Deep reasoning profile unavailable in this account catalog'
                }
              >
                <span>🧠 Deep Reasoning</span>
                {catalog && !catalog.roleAssignments?.deep_reasoning && (
                  <span className="text-[9px] text-amber-400 ml-1">(N/A)</span>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {selectedProvider === 'openai' ? 'OpenAI GPT-4o' : 'Google Gemini 1.5 Pro'} (BYOK
                Active)
              </span>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                >
                  Manage Keys →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Active Model Monospace Badge + Advanced Drawer Toggle */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <span
            className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-md truncate max-w-[200px] sm:max-w-[300px] border ${
              isCurrentRoleUnavailable
                ? 'text-amber-300 bg-amber-950/40 border-amber-800'
                : 'text-emerald-300 bg-zinc-900/90 border-zinc-800'
            }`}
            title={effectiveActiveId}
          >
            {isCurrentRoleUnavailable ? '⚠️ ' : '⚡ '}
            {effectiveActiveId}
          </span>

          {selectedProvider === 'nebius' && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: '11px',
                padding: '5px 12px',
                borderColor: isExpanded ? 'var(--accent-primary)' : undefined,
              }}
              title="Toggle advanced model catalog & manual pinning"
            >
              <span>{isExpanded ? 'Hide Advanced ▴' : 'Advanced / Pin Model ▾'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error state banner */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200 flex items-start justify-between mt-3">
          <div>
            <strong className="font-semibold block text-red-300">
              {error.toLowerCase().includes('credential') || error.toLowerCase().includes('key')
                ? 'Nebius Credentials Not Configured'
                : 'Discovery Connection Error'}
            </strong>
            <p className="mt-0.5 text-red-300/80">{error}</p>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-1 text-emerald-400 hover:underline text-[11px] block cursor-pointer"
              >
                Open Settings to configure API credentials →
              </button>
            )}
          </div>
          <button
            onClick={() => fetchCatalog(true)}
            className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 border border-red-700 rounded text-xs text-red-100 transition cursor-pointer shrink-0 ml-3"
          >
            Retry
          </button>
        </div>
      )}

      {/* Unavailable selected model warning */}
      {isSelectedModelUnavailable && (
        <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded text-xs text-amber-200 mt-3">
          <strong className="font-semibold text-amber-300">Saved Model No Longer in Catalog</strong>
          <p className="mt-0.5 text-amber-300/90">
            Previously configured model{' '}
            <code className="bg-amber-950 px-1 py-0.5 rounded font-mono">{selectedId}</code> is not
            listed in the live catalog for this account. Vouchlock will not silently substitute an
            unconfirmed model. Please select an available model from the catalog below.
          </p>
        </div>
      )}

      {/* Role Profile Unavailable warning */}
      {isCurrentRoleUnavailable && !error && (
        <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded text-xs text-amber-200 mt-3">
          <strong className="font-semibold text-amber-300">
            Role Profile Candidate Unavailable
          </strong>
          <p className="mt-0.5 text-amber-300/90">
            The live Nebius Token Factory catalog does not contain a verified model classified for
            the <strong>{getRoleProfileLabel(activeRole)}</strong> profile. Switch to another
            profile or switch to <strong>Pin Specific Model</strong> below to select an exact model
            ID from your account catalog.
          </p>
        </div>
      )}

      {/* ── Collapsible "Advanced Model Catalog" Drawer (Hidden by default) ── */}
      {isExpanded && selectedProvider === 'nebius' && (
        <div className="ai-advanced-drawer space-y-4">
          {/* Top Row: Segmented Mode Switcher + Refresh + Cache Badge */}
          {showRoles && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="segmented-track">
                <button
                  type="button"
                  onClick={() => {
                    setMode('role');
                    handleRoleChange(activeRole);
                  }}
                  className={`segmented-pill ${mode === 'role' ? 'active' : ''}`}
                >
                  <span>⚡ Auto Role Routing</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('explicit');
                    const defaultCandidate = catalog?.nemotronModels?.[0] || catalog?.models?.[0];
                    if (!selectedId && defaultCandidate) {
                      handleModelSelect(defaultCandidate.id);
                    }
                  }}
                  className={`segmented-pill ${mode === 'explicit' ? 'active' : ''}`}
                >
                  <span>📌 Pin Specific Model</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {catalog?.cached && (
                  <span className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full font-mono">
                    Catalog Cached (5m TTL)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fetchCatalog(true)}
                  disabled={refreshing || loading}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  title="Perform fresh live discovery call to GET /v1/models"
                >
                  <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
                  <span>{refreshing ? 'Discovering...' : 'Refresh Catalog'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode 1: Role Profile Selector Cards */}
          {mode === 'role' && showRoles && (
            <div className="space-y-2">
              <div className="role-cards-grid">
                {/* Fast / Everyday */}
                <div
                  onClick={() => handleRoleChange('fast')}
                  className={`role-card ${activeRole === 'fast' ? 'active' : ''} ${!catalog?.roleAssignments?.fast ? 'border-dashed opacity-80' : ''}`}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        ⚡ Fast / Everyday
                      </span>
                      {activeRole === 'fast' && (
                        <span
                          style={{
                            fontSize: '9px',
                            background: catalog?.roleAssignments?.fast
                              ? 'var(--accent-primary)'
                              : '#f59e0b',
                            color: '#060a08',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          ⚡ Fast Profile
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '6px',
                        lineHeight: 1.5,
                      }}
                    >
                      Routes to confirmed Nemotron Nano for rapid brief extraction and quick
                      summaries.
                    </p>
                  </div>
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Discovered Candidate:
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        display: 'block',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {catalog?.roleAssignments?.fast ? (
                        <span style={{ color: 'var(--accent-primary)' }}>
                          {getModelHumanTitle(catalog.roleAssignments.fast)} ·{' '}
                          <code style={{ fontSize: '10px', opacity: 0.8 }}>
                            {catalog.roleAssignments.fast.id}
                          </code>
                        </span>
                      ) : (
                        <span style={{ color: '#F59E0B' }}>
                          ⚠️ Role Unavailable (No Nemotron Nano in catalog)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Balanced */}
                <div
                  onClick={() => handleRoleChange('balanced')}
                  className={`role-card ${activeRole === 'balanced' ? 'active' : ''} ${!catalog?.roleAssignments?.balanced ? 'border-dashed opacity-80' : ''}`}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        ⚖️ Balanced
                      </span>
                      {activeRole === 'balanced' && (
                        <span
                          style={{
                            fontSize: '9px',
                            background: catalog?.roleAssignments?.balanced
                              ? 'var(--accent-primary)'
                              : '#f59e0b',
                            color: '#060a08',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          ⚖️ Balanced Profile
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '6px',
                        lineHeight: 1.5,
                      }}
                    >
                      Routes to confirmed Nemotron Super for Delivery Agent ledger analysis and gap
                      audits.
                    </p>
                  </div>
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Discovered Candidate:
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        display: 'block',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {catalog?.roleAssignments?.balanced ? (
                        <span style={{ color: 'var(--accent-primary)' }}>
                          {getModelHumanTitle(catalog.roleAssignments.balanced)} ·{' '}
                          <code style={{ fontSize: '10px', opacity: 0.8 }}>
                            {catalog.roleAssignments.balanced.id}
                          </code>
                        </span>
                      ) : (
                        <span style={{ color: '#F59E0B' }}>
                          ⚠️ Role Unavailable (No Nemotron Super in catalog)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Deep Reasoning */}
                <div
                  onClick={() => handleRoleChange('deep_reasoning')}
                  className={`role-card ${activeRole === 'deep_reasoning' ? 'active' : ''} ${!catalog?.roleAssignments?.deep_reasoning ? 'border-dashed opacity-80' : ''}`}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        🧠 Deep Reasoning
                      </span>
                      {activeRole === 'deep_reasoning' && (
                        <span
                          style={{
                            fontSize: '9px',
                            background: catalog?.roleAssignments?.deep_reasoning
                              ? 'var(--accent-primary)'
                              : '#f59e0b',
                            color: '#060a08',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          🧠 Deep Reasoning Profile
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '6px',
                        lineHeight: 1.5,
                      }}
                    >
                      Routes to confirmed Nemotron 3 Ultra for cross-dependency planning and complex
                      gap synthesis.
                    </p>
                  </div>
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Discovered Candidate:
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        display: 'block',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {catalog?.roleAssignments?.deep_reasoning ? (
                        <span style={{ color: 'var(--accent-primary)' }}>
                          {getModelHumanTitle(catalog.roleAssignments.deep_reasoning)} ·{' '}
                          <code style={{ fontSize: '10px', opacity: 0.8 }}>
                            {catalog.roleAssignments.deep_reasoning.id}
                          </code>
                        </span>
                      ) : (
                        <span style={{ color: '#F59E0B' }}>
                          ⚠️ Role Unavailable (No Nemotron Ultra in catalog)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Specific Model List / Radio Card Rows */}
          {mode === 'explicit' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Select Model from Live Account Catalog ({visibleModels.length} models):
                </label>
                <label className="text-[11px] text-zinc-400 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterNemotronOnly}
                    onChange={(e) => setFilterNemotronOnly(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500/20"
                  />
                  NVIDIA Nemotron Only
                </label>
              </div>

              {loading ? (
                <div className="p-6 text-center text-zinc-400 text-xs animate-pulse">
                  Querying live Nebius Token Factory catalog (GET /v1/models)...
                </div>
              ) : visibleModels.length === 0 ? (
                <div className="p-4 bg-zinc-950/60 rounded-lg border border-zinc-800 text-center text-xs text-zinc-400">
                  {filterNemotronOnly
                    ? 'No NVIDIA Nemotron models discovered in this account catalog. Uncheck "NVIDIA Nemotron Only" above to inspect all models.'
                    : 'No models discovered in this account catalog.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {visibleModels.map((model) => {
                    const isSelected = selectedId === model.id;
                    const cap = getModelCapabilityBadge(model.id, model.roleSuggestion);
                    const humanTitle = getModelHumanTitle(model);

                    return (
                      <div
                        key={model.id}
                        onClick={() => handleModelSelect(model.id)}
                        className={`model-radio-card ${isSelected ? 'selected' : ''}`}
                      >
                        {/* Left: Radio + Title + Monospace ID */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            minWidth: 0,
                          }}
                        >
                          <div className="model-radio-circle">
                            {isSelected && <span className="model-radio-dot" />}
                          </div>

                          <div className="min-w-0">
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {humanTitle}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--text-muted)',
                                  background: 'rgba(0, 0, 0, 0.4)',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-subtle)',
                                }}
                                title={model.id}
                              >
                                {model.id}
                              </span>
                            </div>
                            {model.roleSuggestion === 'unclassified' && (
                              <div style={{ fontSize: '10px', color: '#A1A1AA', marginTop: '2px' }}>
                                Unclassified: Metadata does not assign a specific role. Explicitly
                                selectable for all tasks.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Middle & Right: Capability Badge + Verified Status */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexShrink: 0,
                          }}
                        >
                          <span className={cap.badgeClass}>{cap.label}</span>
                          <span className="badge-verified">✓ Live API</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bottom Telemetry & Metadata Strip */}
          <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between text-zinc-300 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-zinc-200 text-xs">
                  Nebius Token Factory Discovery
                </span>
                <span className="text-zinc-500">|</span>
                <span className="font-mono text-[11px] text-zinc-400">
                  Target:{' '}
                  <span className="text-emerald-400 font-semibold">{effectiveActiveId}</span>
                </span>
                <span className="text-zinc-500">|</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                  {activeCredentialSource === 'byok'
                    ? `Personal BYOK Key (...${byokSuffix || 'active'})`
                    : 'Server Key (NEBIUS_API_KEY)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMetadataDetails(!showMetadataDetails)}
                className="btn btn-ghost btn-sm cursor-pointer"
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                {showMetadataDetails ? 'Hide Details ▴' : 'Inspect Live Metadata ▾'}
              </button>
            </div>

            <p className="text-[10px] text-zinc-400 font-mono">
              🔒 In-Memory Persistence: Model preferences and ephemeral keys are stored in server
              process memory and isolated per user/session. They reset upon server restart.
            </p>

            {showMetadataDetails && currentActiveModelForRole && (
              <div className="mt-2 pt-2.5 border-t border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-2.5 text-[11px] font-mono text-zinc-400">
                <div>
                  <span className="block text-zinc-400 text-[10px]">Vendor / Family</span>
                  <span className="text-zinc-200">
                    {currentActiveModelForRole.vendor || 'Unknown'} /{' '}
                    {currentActiveModelForRole.family || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-400 text-[10px]">Context Length</span>
                  <span className="text-zinc-200">
                    {currentActiveModelForRole.contextLength
                      ? `${currentActiveModelForRole.contextLength.toLocaleString()} tokens`
                      : 'Not specified in API response'}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-400 text-[10px]">Quantization</span>
                  <span className="text-zinc-200">
                    {currentActiveModelForRole.quantization || 'Standard'}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-400 text-[10px]">Catalog Pricing</span>
                  <span className="text-zinc-200">
                    {currentActiveModelForRole.pricing?.prompt
                      ? `$${currentActiveModelForRole.pricing.prompt} / 1M`
                      : 'Account default'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom quick-collapse button */}
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 transition py-1 px-3 rounded hover:bg-zinc-800/40 cursor-pointer"
            >
              Hide Advanced ▴
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

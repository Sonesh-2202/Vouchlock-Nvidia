import React, { useState, useEffect, useCallback } from 'react';
import type { DiscoveredModel, ModelCatalogResponse, ModelPreferences, ModelRoleProfile } from '@projectpilot/contracts';
import { api } from '../api';

interface ModelPickerProps {
  workspaceId?: string;
  selectedModelId?: string;
  selectedRoleProfile?: 'fast' | 'balanced' | 'deep_reasoning';
  onSelectModel?: (modelId: string, modelInfo?: DiscoveredModel) => void;
  onSelectRole?: (role: 'fast' | 'balanced' | 'deep_reasoning') => void;
  compact?: boolean;
  showRoles?: boolean;
  className?: string;
}

function getModelCapabilityBadge(modelId: string, roleSuggestion?: string) {
  const lower = modelId.toLowerCase();
  if (lower.includes('vl') || lower.includes('vision')) {
    return { label: '👁️ Vision/VL', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
  }
  if (roleSuggestion === 'deep_reasoning' || lower.includes('ultra')) {
    return { label: '🧠 Deep Reasoning', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
  }
  if (roleSuggestion === 'fast' || lower.includes('nano')) {
    return { label: '⚡ Fast', badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };
  }
  return { label: '⚖️ Balanced', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
}

function getModelHumanTitle(model: DiscoveredModel): string {
  const id = model.id;
  if (id.includes('Nano')) return 'Nemotron 3 Nano 30B';
  if (id.includes('super-120b') || id.includes('Super')) return 'Nemotron 3 Super 120B';
  if (id.includes('Ultra')) return 'Nemotron 3 Ultra 550B';
  if (id.includes('Lightning')) return 'Nemotron 3.5 Lightning';
  if (id.includes('Super-VL')) return 'Nemotron 3.5 Super VL';
  return model.displayName || id;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  workspaceId,
  selectedModelId: externalSelectedModelId,
  selectedRoleProfile: externalRoleProfile,
  onSelectModel,
  onSelectRole,
  compact = false,
  showRoles = true,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalogResponse | null>(null);

  // Collapsible accordion state: compact telemetry header by default
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

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

  const fetchCatalog = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
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
    [workspaceId, externalSelectedModelId, externalRoleProfile],
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
    setActiveRole(role);
    setMode('role');
    setSelectedId('');
    if (onSelectRole) onSelectRole(role);

    try {
      await api.models.savePreferences({ selectedRoleProfile: role }, workspaceId);
    } catch {
      // Local state is preserved regardless
    }
  };

  const handleModelSelect = async (modelId: string) => {
    setSelectedId(modelId);
    setMode('explicit');
    const model = catalog?.models.find((m) => m.id === modelId);
    if (onSelectModel) onSelectModel(modelId, model);

    try {
      await api.models.savePreferences({ selectedModelId: modelId }, workspaceId);
    } catch {
      // Local state preserved
    }
  };

  const visibleModels = catalog
    ? filterNemotronOnly
      ? catalog.nemotronModels
      : catalog.models
    : [];

  const currentSelectedModel = catalog?.models.find((m) => m.id === selectedId);
  const isSelectedModelUnavailable = selectedId && catalog && !currentSelectedModel;

  const currentActiveModelForRole =
    mode === 'role' && catalog?.roleAssignments
      ? catalog.roleAssignments[activeRole]
      : currentSelectedModel;

  const effectiveActiveId =
    mode === 'role'
      ? currentActiveModelForRole?.id || (activeRole === 'deep_reasoning' ? 'nvidia/Nemotron-3-Ultra-550b-a55b' : activeRole === 'fast' ? 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B' : 'nvidia/nemotron-3-super-120b-a12b')
      : selectedId || 'nvidia/nemotron-3-super-120b-a12b';

  const capability = getModelCapabilityBadge(effectiveActiveId, activeRole);

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
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Nebius Token Factory Catalog" />
            <span className="text-zinc-400 font-medium">Model:</span>
            {mode === 'role' ? (
              <span className="text-emerald-400 font-mono font-medium">
                {activeRole.toUpperCase()} ({currentActiveModelForRole?.displayName || 'Discovered Nemotron'})
              </span>
            ) : (
              <span className="text-zinc-200 font-mono font-medium truncate max-w-[200px]" title={selectedId}>
                {currentSelectedModel?.displayName || selectedId}
              </span>
            )}
            <button
              onClick={() => fetchCatalog(true)}
              disabled={refreshing}
              className="text-zinc-400 hover:text-zinc-200 ml-1 disabled:opacity-50"
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
    <div className={`glass-card p-4 space-y-4 ${className}`}>
      {/* ── Collapsible / Compact Hardware Telemetry Header Bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse shrink-0" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              NVIDIA Nemotron Engine
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live Discovery
            </span>
            <span className="text-[11px] font-mono font-medium text-emerald-300 bg-zinc-900/90 border border-zinc-800 px-2.5 py-0.5 rounded-full truncate max-w-[180px] sm:max-w-[280px]" title={effectiveActiveId}>
              ⚡ Active: {effectiveActiveId}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium ${capability.badgeClass}`}>
              {capability.label}
            </span>
            {mode === 'role' && (
              <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700/60 px-2 py-0.5 rounded-full font-mono uppercase">
                {activeRole} Profile
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fetchCatalog(true)}
            disabled={refreshing || loading}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11px', padding: '4px 10px' }}
            title="Perform fresh live discovery call to GET /v1/models"
          >
            <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            <span className="desktop-only">{refreshing ? 'Discovering...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11px', padding: '4px 12px', borderColor: isExpanded ? 'var(--accent-primary)' : undefined }}
          >
            <span>{isExpanded ? 'Collapse ▴' : 'Configure Model Routing ▾'}</span>
          </button>
        </div>
      </div>

      {/* Error state banner */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200 flex items-start justify-between">
          <div>
            <strong className="font-semibold block text-red-300">
              {error.toLowerCase().includes('credential') || error.toLowerCase().includes('key')
                ? 'Nebius Credentials Not Configured'
                : 'Discovery Connection Error'}
            </strong>
            <p className="mt-0.5 text-red-300/80">{error}</p>
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
        <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded text-xs text-amber-200">
          <strong className="font-semibold text-amber-300">Saved Model No Longer in Catalog</strong>
          <p className="mt-0.5 text-amber-300/90">
            Previously configured model <code className="bg-amber-950 px-1 py-0.5 rounded font-mono">{selectedId}</code> is not listed in the live catalog. Vouchlock will not silently substitute an unconfirmed model. Please select an available model below.
          </p>
        </div>
      )}

      {/* ── Expanded Configuration Body ── */}
      {isExpanded && (
        <div className="space-y-4 pt-3 border-t border-zinc-800/80">
          {/* Segmented Mode Switcher (Linear/iOS style) */}
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
                  <span>⚡ Task-Aware Role Routing (Recommended)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('explicit');
                    if (!selectedId && catalog?.nemotronModels[0]) {
                      handleModelSelect(catalog.nemotronModels[0].id);
                    }
                  }}
                  className={`segmented-pill ${mode === 'explicit' ? 'active' : ''}`}
                >
                  <span>📌 Pin Specific Discovered Model</span>
                </button>
              </div>

              {catalog?.cached && (
                <span className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full font-mono">
                  Catalog Cached (5m TTL)
                </span>
              )}
            </div>
          )}

          {/* Role Profile Selector */}
          {mode === 'role' && showRoles && (
            <div className="space-y-2">
              <div className="role-cards-grid">
                {/* Fast / Everyday */}
                <div
                  onClick={() => handleRoleChange('fast')}
                  className={`role-card ${activeRole === 'fast' ? 'active' : ''}`}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⚡ Fast / Everyday
                      </span>
                      {activeRole === 'fast' && (
                        <span style={{ fontSize: '9px', background: 'var(--accent-primary)', color: '#060a08', fontWeight: 700, padding: '2px 6px', borderRadius: '9999px', fontFamily: 'var(--font-mono)' }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                      Prefers discovered Nemotron Nano or Super for rapid everyday briefs and candidate extraction.
                    </p>
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)' }}>Discovered Candidate:</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 500, display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {catalog?.roleAssignments.fast ? (
                        <span style={{ color: 'var(--accent-primary)' }}>{catalog.roleAssignments.fast.displayName}</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Balanced */}
                <div
                  onClick={() => handleRoleChange('balanced')}
                  className={`role-card ${activeRole === 'balanced' ? 'active' : ''}`}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⚖️ Balanced
                      </span>
                      {activeRole === 'balanced' && (
                        <span style={{ fontSize: '9px', background: 'var(--accent-primary)', color: '#060a08', fontWeight: 700, padding: '2px 6px', borderRadius: '9999px', fontFamily: 'var(--font-mono)' }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                      Prefers discovered Nemotron Super for regular Delivery Agent ledger analysis and gap audits.
                    </p>
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)' }}>Discovered Candidate:</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 500, display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {catalog?.roleAssignments.balanced ? (
                        <span style={{ color: 'var(--accent-primary)' }}>{catalog.roleAssignments.balanced.displayName}</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>nvidia/nemotron-3-super-120b-a12b</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Deep Reasoning */}
                <div
                  onClick={() => handleRoleChange('deep_reasoning')}
                  className={`role-card ${activeRole === 'deep_reasoning' ? 'active' : ''}`}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🧠 Deep Reasoning
                      </span>
                      {activeRole === 'deep_reasoning' && (
                        <span style={{ fontSize: '9px', background: 'var(--accent-primary)', color: '#060a08', fontWeight: 700, padding: '2px 6px', borderRadius: '9999px', fontFamily: 'var(--font-mono)' }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                      Prefers discovered Nemotron 3 Ultra for cross-dependency planning and complex gap synthesis.
                    </p>
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontFamily: 'var(--font-mono)' }}>Discovered Candidate:</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 500, display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {catalog?.roleAssignments.deep_reasoning ? (
                        <span style={{ color: 'var(--accent-primary)' }}>{catalog.roleAssignments.deep_reasoning.displayName}</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>nvidia/Nemotron-3-Ultra-550b-a55b</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Specific Model List / Radio Card Rows */}
          {mode === 'explicit' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Select Model from Live Account Catalog:
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
                  {filterNemotronOnly ? (
                    <>
                      No NVIDIA Nemotron models discovered in this account.
                      <button
                        onClick={() => setFilterNemotronOnly(false)}
                        className="block mx-auto mt-2 text-emerald-400 hover:underline"
                      >
                        View all discovered models
                      </button>
                    </>
                  ) : (
                    'No models available in the current Token Factory catalog for this account.'
                  )}
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
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500/20'
                                : 'border-zinc-700 bg-zinc-900'
                            }`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-zinc-100 truncate">
                                {humanTitle}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-[150px] sm:max-w-[260px]" title={model.id}>
                                {model.id}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Middle & Right: Capability Badge + Verification Status */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium ${cap.badgeClass}`}>
                            {cap.label}
                          </span>
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Catalog Verified
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selected Model Provenance & Metadata Strip */}
          {currentActiveModelForRole && (
            <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between text-zinc-300">
                <span className="font-medium text-[11px] text-zinc-400">Inference Target Architecture:</span>
                <button
                  type="button"
                  onClick={() => setShowMetadataDetails(!showMetadataDetails)}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  {showMetadataDetails ? 'Hide Details' : 'Inspect Live Metadata ▾'}
                </button>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5 font-mono text-[11px]">
                <div style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', minWidth: 0 }}>
                  <span className="text-zinc-400">ID: </span>
                  <span className="text-emerald-400 font-semibold">{currentActiveModelForRole.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Provider: </span>
                  <span className="text-zinc-300">Nebius Token Factory (NVIDIA Open-Source)</span>
                </div>
              </div>

              {showMetadataDetails && (
                <div className="mt-2 pt-2.5 border-t border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-2.5 text-[11px] font-mono text-zinc-400">
                  <div>
                    <span className="block text-zinc-400 text-[10px]">Vendor / Family</span>
                    <span className="text-zinc-200">
                      {currentActiveModelForRole.vendor} / {currentActiveModelForRole.family}
                    </span>
                  </div>
                  <div>
                    <span className="block text-zinc-400 text-[10px]">Context Length</span>
                    <span className="text-zinc-200">
                      {currentActiveModelForRole.contextLength
                        ? `${currentActiveModelForRole.contextLength.toLocaleString()} tokens`
                        : 'Standard (Account Quota)'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-zinc-400 text-[10px]">Quantization</span>
                    <span className="text-zinc-200">
                      {currentActiveModelForRole.quantization || 'Native FP8/BF16'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-zinc-400 text-[10px]">Catalog Pricing</span>
                    <span className="text-zinc-200">
                      {currentActiveModelForRole.pricing?.prompt
                        ? `$${currentActiveModelForRole.pricing.prompt} / 1M`
                        : 'Server-Side Quota'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

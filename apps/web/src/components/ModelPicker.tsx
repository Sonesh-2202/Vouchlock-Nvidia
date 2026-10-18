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

  // Check if saved model is no longer available in the live catalog
  const isSelectedModelUnavailable = selectedId && catalog && !currentSelectedModel;

  const currentActiveModelForRole =
    mode === 'role' && catalog?.roleAssignments
      ? catalog.roleAssignments[activeRole]
      : currentSelectedModel;

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
    <div className={`bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 space-y-4 ${className}`}>
      {/* Header with Provenance & Live Refresh */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            <h4 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">
              NVIDIA Model Selection &amp; Routing
            </h4>
            <span className="text-[10px] bg-zinc-800 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
              Live Token Factory
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Models dynamically discovered from your authenticated Nebius Token Factory account.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {catalog?.cached && (
            <span className="text-[11px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50" title="Cached for up to 5 minutes to preserve credits">
              Cached (5m TTL)
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchCatalog(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded border border-zinc-700 transition disabled:opacity-50 cursor-pointer"
            title="Perform fresh live discovery call to GET /v1/models"
          >
            <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            <span>{refreshing ? 'Discovering...' : 'Refresh Catalog'}</span>
          </button>
        </div>
      </div>

      {/* Error state banner */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200 flex items-start justify-between">
          <div>
            <strong className="font-semibold block text-red-300">Discovery Connection Error</strong>
            <p className="mt-0.5 text-red-300/80">{error}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              No stale default model IDs will be sent. Please check your Nebius credentials in Settings or verify Token Factory connectivity.
            </p>
          </div>
          <button
            onClick={() => fetchCatalog(true)}
            className="px-2 py-1 bg-red-900/60 hover:bg-red-800 border border-red-700 rounded text-xs text-red-100 transition"
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

      {/* Mode Toggle: Dynamic Role Routing vs Pinned Specific Model */}
      {showRoles && (
        <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setMode('role');
              handleRoleChange(activeRole);
            }}
            className={`py-1.5 px-3 rounded text-xs font-medium transition cursor-pointer ${
              mode === 'role'
                ? 'bg-emerald-600/90 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Task-Aware Role Routing (Recommended)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('explicit');
              if (!selectedId && catalog?.nemotronModels[0]) {
                handleModelSelect(catalog.nemotronModels[0].id);
              }
            }}
            className={`py-1.5 px-3 rounded text-xs font-medium transition cursor-pointer ${
              mode === 'explicit'
                ? 'bg-emerald-600/90 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Pin Specific Discovered Model
          </button>
        </div>
      )}

      {/* Role Profile Selector */}
      {mode === 'role' && showRoles && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-zinc-300">
            Active Routing Profile:
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {/* Fast / Everyday */}
            <div
              onClick={() => handleRoleChange('fast')}
              className={`p-3 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                activeRole === 'fast'
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-sm'
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    ⚡ Fast / Everyday
                  </span>
                  {activeRole === 'fast' && (
                    <span className="text-[10px] bg-emerald-500 text-black font-bold px-1.5 py-0.2 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Prefers discovered Nemotron Nano or Super for routine summaries, candidate extraction, and next actions.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block font-mono">Discovered candidate:</span>
                <span className="text-xs text-emerald-400 font-mono font-medium truncate block">
                  {catalog?.roleAssignments.fast?.displayName || 'Discovering candidate...'}
                </span>
              </div>
            </div>

            {/* Balanced */}
            <div
              onClick={() => handleRoleChange('balanced')}
              className={`p-3 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                activeRole === 'balanced'
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-sm'
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    ⚖ Balanced
                  </span>
                  {activeRole === 'balanced' && (
                    <span className="text-[10px] bg-emerald-500 text-black font-bold px-1.5 py-0.2 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Prefers discovered Nemotron Super for regular Delivery Agent ledger analysis and gap audits.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block font-mono">Discovered candidate:</span>
                <span className="text-xs text-emerald-400 font-mono font-medium truncate block">
                  {catalog?.roleAssignments.balanced?.displayName || 'Discovering candidate...'}
                </span>
              </div>
            </div>

            {/* Deep Reasoning */}
            <div
              onClick={() => handleRoleChange('deep_reasoning')}
              className={`p-3 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                activeRole === 'deep_reasoning'
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-sm'
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    🧠 Deep Reasoning
                  </span>
                  {activeRole === 'deep_reasoning' && (
                    <span className="text-[10px] bg-emerald-500 text-black font-bold px-1.5 py-0.2 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Prefers discovered Nemotron 3 Ultra for complex multi-stage planning and cross-dependency analysis.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block font-mono">Discovered candidate:</span>
                <span className="text-xs text-emerald-400 font-mono font-medium truncate block">
                  {catalog?.roleAssignments.deep_reasoning?.displayName || 'Discovering candidate...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Specific Model List / Picker */}
      {mode === 'explicit' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300">
              Select Discovered Model:
            </label>
            <div className="flex items-center gap-2">
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
          </div>

          {loading ? (
            <div className="p-6 text-center text-zinc-500 text-xs animate-pulse">
              Querying live Nebius Token Factory catalog (GET /v1/models)...
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="p-4 bg-zinc-950 rounded border border-zinc-800 text-center text-xs text-zinc-400">
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
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {visibleModels.map((model) => {
                const isSelected = selectedId === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={`p-2.5 rounded border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/20'
                        : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {model.displayName}
                        </span>
                        {model.isNemotron ? (
                          <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded font-mono">
                            NVIDIA Nemotron
                          </span>
                        ) : (
                          <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded font-mono">
                            {model.vendor}
                          </span>
                        )}
                        {model.roleSuggestion !== 'unclassified' && (
                          <span className="text-[9px] bg-zinc-800/80 text-zinc-300 border border-zinc-700 px-1.5 py-0.2 rounded font-mono">
                            {model.roleSuggestion}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                        ID: {model.id}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                        Listed in Catalog
                      </span>
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-zinc-700 bg-zinc-900'
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
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
        <div className="p-2.5 bg-zinc-950/80 border border-zinc-800/80 rounded text-xs space-y-1.5">
          <div className="flex items-center justify-between text-zinc-300">
            <span className="font-medium text-[11px] text-zinc-400">Selected Runtime Inference Target:</span>
            <button
              type="button"
              onClick={() => setShowMetadataDetails(!showMetadataDetails)}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
            >
              {showMetadataDetails ? 'Hide Details' : 'Inspect Live Metadata'}
            </button>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 font-mono text-[11px]">
            <div>
              <span className="text-zinc-400">ID: </span>
              <span className="text-emerald-400 font-semibold">{currentActiveModelForRole.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Source: </span>
              <span className="text-zinc-300">Nebius Token Factory</span>
            </div>
          </div>

          {showMetadataDetails && (
            <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono text-zinc-400">
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
                    : 'Not provided by catalog'}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 text-[10px]">Quantization</span>
                <span className="text-zinc-200">
                  {currentActiveModelForRole.quantization || 'Standard Precision'}
                </span>
              </div>
              <div>
                <span className="block text-zinc-400 text-[10px]">Catalog Pricing</span>
                <span className="text-zinc-200">
                  {currentActiveModelForRole.pricing?.prompt
                    ? `$${currentActiveModelForRole.pricing.prompt} / 1M`
                    : 'Pricing not available from model metadata'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

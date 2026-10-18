/**
 * API client for ProjectPilot.
 * Handles fetch calls with credentials, error parsing, and typed responses.
 */

import type {
  ModelCatalogResponse,
  ModelPreferences,
  ServerlessJobRecord,
} from '@projectpilot/contracts';

export type ResourceCategory = 'study' | 'architecture' | 'api' | 'design' | 'video';
export type ResourceSourceType =
  'github' | 'figma' | 'docs' | 'youtube' | 'pdf' | 'notion' | 'link';
export interface ProjectResource {
  id: string;
  projectId: string;
  title: string;
  url: string;
  category: ResourceCategory;
  sourceType: ResourceSourceType;
  description?: string;
  studyNotes?: string;
  requirementId?: string | null;
  linkedRequirementId?: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const BASE_URL = '/api/v1';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, opts);

  if (!res.ok) {
    let error: ApiError;
    try {
      const json = await res.json();
      if (typeof json.error === 'string') {
        error = {
          code: json.code || (json.statusCode ? String(json.statusCode) : 'error'),
          message: json.message || json.error,
        };
      } else if (json.error && typeof json.error === 'object') {
        error = {
          code: json.error.code || 'error',
          message: json.error.message || json.message || res.statusText,
          details: json.error.details,
        };
      } else {
        error = {
          code: json.code || 'unknown',
          message: json.message || res.statusText,
        };
      }
    } catch {
      error = {
        code: 'network_error',
        message:
          res.status === 500 || res.status === 502 || res.status === 504
            ? 'Backend API server is unreachable. Please ensure the backend server is running on port 3001.'
            : res.statusText || 'Network request failed',
      };
    }
    throw new ApiRequestError(res.status, error);
  }

  return res.json() as Promise<T>;
}

// ── Auth ──

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface ProjectActivityItem {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorId: string;
  actorName: string;
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; displayName: string }) =>
      request<{ user: AuthUser }>('POST', '/auth/register', data),
    login: (data: { email: string; password: string }) =>
      request<{ user: AuthUser }>('POST', '/auth/login', data),
    logout: () => request<{ ok: boolean }>('POST', '/auth/logout'),
    me: () => request<{ user: AuthUser }>('GET', '/auth/me'),
    resetPassword: (data: { email: string; newPassword: string; confirmPassword?: string }) =>
      request<{ ok: boolean; message: string; user?: AuthUser }>(
        'POST',
        '/auth/reset-password',
        data,
      ),
  },

  workspaces: {
    list: () =>
      request<{
        workspaces: Array<{ id: string; name: string; role: string; createdAt: string }>;
      }>('GET', '/workspaces'),
    create: (data: { name: string }) =>
      request<{ workspace: { id: string; name: string } }>('POST', '/workspaces', data),
    get: (id: string) =>
      request<{
        workspace: { id: string; name: string; ownerUserId: string };
        members: Array<{
          userId: string;
          role: string;
          displayName: string;
          email: string | null;
          joinedAt: string;
        }>;
        currentUserRole: string;
      }>('GET', `/workspaces/${id}`),
    createInvitation: (workspaceId: string, data: { email?: string; role: 'admin' | 'member' }) =>
      request<{
        invitation: { id: string; token: string; role: string; expiresAt: string };
      }>('POST', `/workspaces/${workspaceId}/invitations`, data),
    acceptInvitation: (token: string) =>
      request<{ ok: boolean; workspaceId: string }>(
        'POST',
        `/workspaces/invitations/${token}/accept`,
      ),
    removeMember: (workspaceId: string, userId: string) =>
      request<{ ok: boolean }>('DELETE', `/workspaces/${workspaceId}/members/${userId}`),
    export: (id: string) => request<Record<string, unknown>>('GET', `/workspaces/${id}/export`),
    activity: (id: string, params?: { limit?: number; offset?: number; subjectType?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      if (params?.subjectType) query.set('subjectType', params.subjectType);
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request<{
        activity: Array<{
          id: string;
          action: string;
          subjectType: string;
          subjectId: string;
          metadata: Record<string, unknown>;
          createdAt: string;
          actorId: string;
          actorName: string;
          actorEmail: string;
        }>;
      }>('GET', `/workspaces/${id}/activity${qs}`);
    },
  },

  projects: {
    list: (workspaceId: string, status?: string) =>
      request<{ projects: Array<Record<string, unknown>> }>(
        'GET',
        `/projects/workspaces/${workspaceId}/projects${status ? `?status=${status}` : ''}`,
      ),
    create: (workspaceId: string, data: Record<string, unknown>) =>
      request<{ project: Record<string, unknown> }>(
        'POST',
        `/projects/workspaces/${workspaceId}/projects`,
        data,
      ),
    get: (id: string) =>
      request<{
        project: Record<string, unknown>;
        milestones: Array<Record<string, unknown>>;
        tasks: Array<Record<string, unknown>>;
        currentUserRole: string;
      }>('GET', `/projects/${id}`),
    update: (id: string, data: Record<string, unknown>) =>
      request<{ project: Record<string, unknown> }>('PATCH', `/projects/${id}`, data),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', `/projects/${id}`),
    export: (id: string) => request<Record<string, unknown>>('GET', `/projects/${id}/export`),
    generatePlanDraft: (id: string, data?: Record<string, unknown>) => {
      type PlanDraftResponse = {
        generationId: string;
        draft: {
          summary: string;
          assumptions: string[];
          risks: string[];
          milestones: Array<{
            title: string;
            description?: string | null;
            dueDate?: string | null;
            tasks: Array<{
              title: string;
              description?: string | null;
              ownerSuggestion?: string | null;
              dueDate?: string | null;
              dependencyTitles?: string[];
            }>;
          }>;
        };
        validationErrors: Array<{ path: string; message: string }>;
      };
      return request<PlanDraftResponse>('POST', `/projects/${id}/plan-drafts`, data);
    },
    acceptPlanDraft: (
      id: string,
      draftId: string,
      data: { idempotencyKey: string; draft?: Record<string, unknown> },
    ) => {
      type AcceptDraftResponse = {
        ok: boolean;
        createdMilestonesCount?: number;
        createdTasksCount?: number;
        alreadyAccepted?: boolean;
      };
      return request<AcceptDraftResponse>(
        'POST',
        `/projects/${id}/plan-drafts/${draftId}/accept`,
        data,
      );
    },
    progressSummary: (id: string) =>
      request<{
        summary: string;
        stats: Record<string, unknown>;
        generatedAt: string;
      }>('POST', `/projects/${id}/ai/progress-summary`),
    createMilestone: (
      id: string,
      data: { title: string; description?: string; dueDate?: string | null },
    ) =>
      request<{ milestone: Record<string, unknown> }>('POST', `/projects/${id}/milestones`, data),
    updateMilestone: (milestoneId: string, data: Record<string, unknown>) =>
      request<{ milestone: Record<string, unknown> }>(
        'PATCH',
        `/projects/milestones/${milestoneId}`,
        data,
      ),
    deleteMilestone: (milestoneId: string) =>
      request<{ ok: boolean }>('DELETE', `/projects/milestones/${milestoneId}`),

    briefs: {
      list: (projectId: string) =>
        request<{
          revisions: Array<{
            id: string;
            projectId: string;
            revisionNumber: number;
            title: string;
            content: string;
            notes: string | null;
            authorUserId: string;
            createdAt: string;
          }>;
        }>('GET', `/projects/${projectId}/briefs`),
      create: (projectId: string, data: { title: string; content: string; notes?: string }) =>
        request<{
          revision: {
            id: string;
            projectId: string;
            revisionNumber: number;
            title: string;
            content: string;
            notes: string | null;
            authorUserId: string;
            createdAt: string;
          };
        }>('POST', `/projects/${projectId}/briefs`, data),
      getLatest: (projectId: string) =>
        request<{
          revision: {
            id: string;
            projectId: string;
            revisionNumber: number;
            title: string;
            content: string;
            notes: string | null;
            authorUserId: string;
            createdAt: string;
          } | null;
        }>('GET', `/projects/${projectId}/briefs/latest`),
    },

    proposals: {
      extract: (
        projectId: string,
        data: {
          briefRevisionId: string;
          focusAreas?: string[];
          additionalContext?: string;
          providerOverride?: string;
          modelOverride?: string;
          roleProfile?: 'fast' | 'balanced' | 'deep_reasoning';
        },
      ) =>
        request<{
          generationId: string;
          briefRevisionId: string;
          provider: string;
          model: string;
          proposal: {
            summary: string;
            assumptions: string[];
            ambiguities: string[];
            conflicts: string[];
            risks: string[];
            candidates: Array<{
              tempId: string;
              title: string;
              description?: string | null;
              category: 'functional' | 'non_functional' | 'constraint' | 'deliverable';
              priority: 'low' | 'normal' | 'high';
              sourceQuote?: string | null;
              rationale?: string | null;
            }>;
          };
          usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
        }>('POST', `/projects/${projectId}/proposals/extract`, data),
      accept: (
        projectId: string,
        data: {
          generationId: string;
          briefRevisionId: string;
          idempotencyKey: string;
          acceptedCandidates: Array<{
            tempId: string;
            title: string;
            description?: string | null;
            category: 'functional' | 'non_functional' | 'constraint' | 'deliverable';
            priority: 'low' | 'normal' | 'high';
            sourceReference?: string | null;
            ownerUserId?: string | null;
          }>;
        },
      ) =>
        request<{
          acceptedCount: number;
          createdRequirements?: Array<Record<string, unknown>>;
          idempotentReplay?: boolean;
          message?: string;
        }>('POST', `/projects/${projectId}/proposals/accept`, data),
    },

    requirements: {
      list: (projectId: string, filters?: { status?: string; category?: string }) => {
        const query = new URLSearchParams();
        if (filters?.status) query.set('status', filters.status);
        if (filters?.category) query.set('category', filters.category);
        const qs = query.toString() ? `?${query.toString()}` : '';
        return request<{
          requirements: Array<{
            id: string;
            projectId: string;
            title: string;
            description: string | null;
            category: 'functional' | 'non_functional' | 'constraint' | 'deliverable';
            priority: 'low' | 'normal' | 'high';
            status: 'draft' | 'active' | 'verified' | 'blocked' | 'deprecated';
            sourceReference: string | null;
            ownerUserId: string | null;
            version: number;
            createdAt: string;
            updatedAt: string;
            linkedTasks: Array<{ id: string; title: string; status: string }>;
            evidenceCount: number;
            latestVerification: {
              id: string;
              status: string;
              notes: string | null;
              createdAt: string;
              verifierName: string;
            } | null;
          }>;
        }>('GET', `/projects/${projectId}/requirements${qs}`);
      },
      create: (projectId: string, data: Record<string, unknown>) =>
        request<{ requirement: Record<string, unknown> }>(
          'POST',
          `/projects/${projectId}/requirements`,
          data,
        ),
      get: (reqId: string) =>
        request<{
          requirement: Record<string, unknown>;
          linkedTasks: Array<Record<string, unknown>>;
          evidence: Array<Record<string, unknown>>;
          verifications: Array<Record<string, unknown>>;
          currentUserRole: string;
        }>('GET', `/projects/requirements/${reqId}`),
      update: (reqId: string, data: Record<string, unknown>) =>
        request<{ requirement: Record<string, unknown> }>(
          'PATCH',
          `/projects/requirements/${reqId}`,
          data,
        ),
      delete: (reqId: string) =>
        request<{ ok: boolean }>('DELETE', `/projects/requirements/${reqId}`),
      linkTask: (reqId: string, taskId: string) =>
        request<{ ok: boolean }>('POST', `/projects/requirements/${reqId}/tasks`, { taskId }),
      unlinkTask: (reqId: string, taskId: string) =>
        request<{ ok: boolean }>('DELETE', `/projects/requirements/${reqId}/tasks/${taskId}`),
      createEvidence: (reqId: string, data: Record<string, unknown>) =>
        request<{ evidence: Record<string, unknown> }>(
          'POST',
          `/projects/requirements/${reqId}/evidence`,
          data,
        ),
      verify: (reqId: string, data: { status: string; notes?: string }) =>
        request<{
          ok: boolean;
          verification: Record<string, unknown>;
          requirement: Record<string, unknown>;
        }>('POST', `/projects/requirements/${reqId}/verify`, data),
    },

    deliveryReport: (projectId: string) =>
      request<{
        project: {
          id: string;
          name: string;
          goal: string;
          deliverable: string | null;
          deadline: string | null;
          status: string;
        };
        metrics: {
          totalRequirements: number;
          verifiedCount: number;
          activeCount: number;
          blockedCount: number;
          draftCount: number;
          deprecatedCount: number;
          percentVerified: number;
          requirementsWithTasksCount: number;
          unlinkedRequirementsCount: number;
          requirementsWithEvidenceCount: number;
          requirementsWithoutEvidenceCount: number;
        };
        items: Array<{
          id: string;
          title: string;
          description: string | null;
          category: string;
          priority: string;
          status: string;
          sourceReference: string | null;
          linkedTasks: Array<{ id: string; title: string; status: string }>;
          evidenceCount: number;
          evidence: Array<{ id: string; type: string; title: string; content: string }>;
          latestVerification: {
            id: string;
            status: string;
            notes: string | null;
            createdAt: string;
            verifiedByName: string;
          } | null;
          isVerified: boolean;
          allTasksDone: boolean;
          hasLinkedTasks: boolean;
          hasEvidence: boolean;
        }>;
        generatedAt: string;
      }>('GET', `/projects/${projectId}/delivery-report`),

    activity: (id: string, params?: { limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      const qs = query.toString() ? `?${query.toString()}` : '';
      return request<{
        activity: Array<{
          id: string;
          action: string;
          subjectType: string;
          subjectId: string;
          metadata: Record<string, unknown>;
          createdAt: string;
          actorId: string;
          actorName: string;
        }>;
      }>('GET', `/projects/${id}/activity${qs}`);
    },
  },

  tasks: {
    create: (projectId: string, data: Record<string, unknown>) =>
      request<{ task: Record<string, unknown> }>(
        'POST',
        `/tasks/projects/${projectId}/tasks`,
        data,
      ),
    get: (id: string) =>
      request<{ task: Record<string, unknown>; comments: Array<Record<string, unknown>> }>(
        'GET',
        `/tasks/${id}`,
      ),
    update: (id: string, data: Record<string, unknown>) =>
      request<{ task: Record<string, unknown> }>('PATCH', `/tasks/${id}`, data),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', `/tasks/${id}`),
    addComment: (taskId: string, data: { body: string }) =>
      request<{ comment: Record<string, unknown> }>('POST', `/tasks/${taskId}/comments`, data),
    editComment: (taskId: string, commentId: string, data: { body: string }) =>
      request<{ comment: Record<string, unknown> }>(
        'PATCH',
        `/tasks/${taskId}/comments/${commentId}`,
        data,
      ),
    deleteComment: (taskId: string, commentId: string) =>
      request<{ ok: boolean }>('DELETE', `/tasks/${taskId}/comments/${commentId}`),
  },

  resources: {
    list: (projectId: string) =>
      request<{ resources: ProjectResource[] }>('GET', `/projects/${projectId}/resources`),
    create: (
      projectId: string,
      data: {
        title: string;
        url: string;
        category: ResourceCategory;
        sourceType?: ResourceSourceType;
        description?: string;
        studyNotes?: string;
        requirementId?: string | null;
        linkedRequirementId?: string | null;
        isPinned?: boolean;
      },
    ) => request<{ resource: ProjectResource }>('POST', `/projects/${projectId}/resources`, data),
    update: (id: string, data: Partial<Omit<ProjectResource, 'id' | 'projectId' | 'createdAt'>>) =>
      request<{ resource: ProjectResource }>('PATCH', `/resources/${id}`, data),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', `/resources/${id}`),
    togglePin: (id: string) =>
      request<{ resource: ProjectResource }>('POST', `/resources/${id}/toggle-pin`),
  },

  copilot: {
    generateReport: (
      projectId: string,
      providerOverride?: string,
      options?: { modelOverride?: string; roleProfile?: 'fast' | 'balanced' | 'deep_reasoning' },
    ) =>
      request<{ report: any }>('POST', '/copilot/reports', {
        projectId,
        providerOverride,
        modelOverride: options?.modelOverride,
        roleProfile: options?.roleProfile,
      }),
    approveAction: (projectId: string, proposalId: string, action: unknown) =>
      request<{
        success: boolean;
        proposalId: string;
        entityId?: string;
        actionType?: string;
      }>('POST', '/copilot/approve', {
        projectId,
        proposalId,
        action,
      }),
    rejectAction: (projectId: string, proposalId: string, reason?: string) =>
      request<{ success: boolean; proposalId: string }>('POST', '/copilot/reject', {
        projectId,
        proposalId,
        reason,
      }),
  },

  providers: {
    listAvailable: () =>
      request<{
        providers: Array<{
          id: string;
          label: string;
          tested: boolean;
          requiresApiKey: boolean;
          description?: string;
        }>;
      }>('GET', '/me/providers/available'),
    listSessions: (workspaceId?: string) => {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return request<{
        sessions: Array<{
          provider: string;
          keySuffix: string;
          status: string;
          workspaceId?: string;
          createdAt: string;
        }>;
      }>('GET', `/me/providers${qs}`);
    },
    setSession: (provider: string, apiKey: string, workspaceId?: string) =>
      request<{
        session: {
          provider: string;
          keySuffix: string;
          status: string;
          workspaceId?: string;
          createdAt: string;
        };
      }>('POST', '/me/provider-session', {
        provider,
        apiKey,
        workspaceId,
      }),
    testSession: (provider: string, apiKey: string) =>
      request<{ ok: boolean; provider: string; message: string }>('POST', '/me/provider-test', {
        provider,
        apiKey,
      }),
    deleteSession: (provider: string, workspaceId?: string) => {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return request<void>('DELETE', `/me/provider-session/${provider}${qs}`);
    },
  },

  mcp: {
    listTools: (bearerToken: string) =>
      fetch('/mcp/v1/tools', {
        headers: { Authorization: `Bearer ${bearerToken}` },
      }).then((r) => r.json()),
    createToken: (workspaceId: string, scopes: string[] = ['mcp:read'], ttlDays = 30) =>
      request<{
        id: string;
        token: string;
        userId: string;
        workspaceId: string;
        scopes: string[];
        expiresAt: string;
      }>('POST', '/mcp/v1/tokens', {
        workspaceId,
        scopes,
        ttlDays,
      }),
    listTokens: (workspaceId?: string) => {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return request<{
        tokens: Array<{
          id: string;
          userId: string;
          workspaceId: string;
          scopes: string[];
          createdAt: string;
          expiresAt: string;
          revokedAt?: string;
        }>;
      }>('GET', `/mcp/v1/tokens${qs}`);
    },
    revokeToken: (data: { token?: string; tokenId?: string; revokeAll?: boolean }) =>
      request<{ success: boolean; revokedCount: number }>('POST', '/mcp/v1/revoke', data),
  },

  models: {
    getCatalog: (options?: { refresh?: boolean; workspaceId?: string }) => {
      const params = new URLSearchParams();
      if (options?.refresh) params.set('refresh', 'true');
      if (options?.workspaceId) params.set('workspaceId', options.workspaceId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request<ModelCatalogResponse>('GET', `/models/catalog${qs}`);
    },
    getPreferences: (workspaceId?: string) => {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return request<{ preferences: ModelPreferences }>('GET', `/models/preferences${qs}`);
    },
    savePreferences: (preferences: ModelPreferences, workspaceId?: string) => {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      return request<{ ok: boolean; preferences: ModelPreferences }>(
        'POST',
        `/models/preferences${qs}`,
        preferences,
      );
    },
  },

  jobs: {
    submitPortfolioAudit: (data: {
      workspaceId: string;
      projectId?: string;
      modelOverride?: string;
      roleProfile?: 'fast' | 'balanced' | 'deep_reasoning';
      idempotencyKey?: string;
    }) => request<{ job: ServerlessJobRecord }>('POST', '/jobs/portfolio-audit', data),
    getJob: (jobId: string) => request<{ job: ServerlessJobRecord }>('GET', `/jobs/${jobId}`),
    cancelJob: (jobId: string) => request<{ job: ServerlessJobRecord }>('POST', `/jobs/${jobId}/cancel`),
    listWorkspaceJobs: (workspaceId: string) =>
      request<{ jobs: ServerlessJobRecord[] }>('GET', `/jobs/workspace/${workspaceId}`),
  },
};

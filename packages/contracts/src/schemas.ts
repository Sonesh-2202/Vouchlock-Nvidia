/**
 * Shared Zod schemas for ProjectPilot API contracts.
 * Used by both frontend and backend for validation.
 */

import { z } from 'zod';

// ── Common ──

export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().datetime();
export const cursorSchema = z.string().max(256).optional();

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

// ── Auth ──

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).trim(),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(255),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ── Workspace ──

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

// ── Invitation ──

export const createInvitationSchema = z.object({
  email: z.string().email().max(255).optional(),
  role: z.enum(['admin', 'member']).default('member'),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(256),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

// ── Project ──

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  goal: z.string().min(1).max(2000).trim(),
  audience: z.string().max(500).trim().optional(),
  deliverable: z.string().max(500).trim().optional(),
  deadline: isoDateSchema.optional(),
  constraints: z.record(z.unknown()).optional(),
  successMeasures: z.record(z.unknown()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  goal: z.string().min(1).max(2000).trim().optional(),
  audience: z.string().max(500).trim().nullable().optional(),
  deliverable: z.string().max(500).trim().nullable().optional(),
  deadline: isoDateSchema.nullable().optional(),
  constraints: z.record(z.unknown()).optional(),
  successMeasures: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'archived']).optional(),
  version: z.number().int().positive(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ── Task ──

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(5000).trim().optional(),
  milestoneId: uuidSchema.nullable().optional(),
  status: z.enum(['backlog', 'todo', 'doing', 'blocked', 'done']).default('backlog'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  assigneeUserId: uuidSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  description: z.string().max(5000).trim().nullable().optional(),
  milestoneId: uuidSchema.nullable().optional(),
  status: z.enum(['backlog', 'todo', 'doing', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  assigneeUserId: uuidSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  version: z.number().int().positive(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ── Comment ──

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

// ── AI Plan Draft ──

export const planDraftTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  ownerSuggestion: z.string().max(100).nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  dependencyTitles: z.array(z.string().max(300)).max(20).optional(),
});

export const planDraftMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  tasks: z.array(planDraftTaskSchema).min(1).max(50),
});

export const planDraftSchema = z.object({
  summary: z.string().min(1).max(5000),
  assumptions: z.array(z.string().max(500)).max(20),
  risks: z.array(z.string().max(500)).max(20),
  milestones: z.array(planDraftMilestoneSchema).min(1).max(20),
});

export const generatePlanDraftSchema = z.object({
  goal: z.string().trim().min(1).max(2000).optional(),
  audience: z.string().trim().max(500).optional(),
  deliverable: z.string().trim().max(500).optional(),
  deadline: isoDateSchema.optional(),
  constraints: z.record(z.unknown()).optional(),
  providerOverride: z.string().optional(),
  modelOverride: z.string().optional(),
  roleProfile: z.enum(['fast', 'balanced', 'deep_reasoning']).optional(),
});

export const acceptPlanDraftSchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  draft: planDraftSchema.optional(),
});

export type PlanDraftOutput = z.infer<typeof planDraftSchema>;
export type GeneratePlanDraftInput = z.infer<typeof generatePlanDraftSchema>;
export type AcceptPlanDraftInput = z.infer<typeof acceptPlanDraftSchema>;

// ── Milestone ──

export const createMilestoneSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  dueDate: isoDateSchema.nullable().optional(),
});

export const updateMilestoneSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

// ── Requirement ──

export const requirementCategorySchema = z.enum([
  'functional',
  'non_functional',
  'constraint',
  'deliverable',
]);

export const requirementPrioritySchema = z.enum(['low', 'normal', 'high']);

export const requirementStatusSchema = z.enum([
  'draft',
  'active',
  'verified',
  'blocked',
  'deprecated',
]);

export const createRequirementSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  category: requirementCategorySchema.default('functional'),
  priority: requirementPrioritySchema.default('normal'),
  sourceReference: z.string().trim().max(500).optional(),
  ownerUserId: uuidSchema.nullable().optional(),
});

export const updateRequirementSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  category: requirementCategorySchema.optional(),
  priority: requirementPrioritySchema.optional(),
  status: requirementStatusSchema.optional(),
  sourceReference: z.string().trim().max(500).nullable().optional(),
  ownerUserId: uuidSchema.nullable().optional(),
  version: z.number().int().positive(),
});

export const linkRequirementTaskSchema = z.object({
  taskId: uuidSchema,
});

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;
export type LinkRequirementTaskInput = z.infer<typeof linkRequirementTaskSchema>;

// ── Evidence ──

export const evidenceTypeSchema = z.enum(['url', 'note']);

export const createEvidenceSchema = z.object({
  type: evidenceTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
  taskId: uuidSchema.nullable().optional(),
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;

// ── Verification ──

export const verificationStatusSchema = z.enum(['verified', 'rejected', 'unverified']);

export const verifyRequirementSchema = z.object({
  status: verificationStatusSchema,
  notes: z.string().max(2000).trim().optional(),
});

export type VerifyRequirementInput = z.infer<typeof verifyRequirementSchema>;

// ── Brief Revisions ──

export const createBriefRevisionSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Project Brief'),
  content: z
    .string()
    .trim()
    .min(10, 'Brief content must be at least 10 characters')
    .max(50000, 'Brief content cannot exceed 50,000 characters'),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateBriefRevisionInput = z.infer<typeof createBriefRevisionSchema>;

// ── Requirement Extraction Proposals ──

export const candidateRequirementSchema = z.object({
  tempId: z.string().min(1).max(50),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  category: requirementCategorySchema.default('functional'),
  priority: requirementPrioritySchema.default('normal'),
  sourceReference: z.string().trim().max(500).optional(),
  rationale: z.string().trim().max(2000).optional(),
});

export const requirementProposalSchema = z.object({
  summary: z.string().max(3000),
  candidates: z.array(candidateRequirementSchema).min(1).max(50),
  assumptions: z.array(z.string().max(500)).max(30),
  ambiguities: z.array(z.string().max(500)).max(30),
  conflicts: z.array(z.string().max(500)).max(30),
  risks: z.array(z.string().max(500)).max(30),
});

export const extractRequirementsInputSchema = z.object({
  briefRevisionId: uuidSchema,
  providerOverride: z.string().optional(),
  modelOverride: z.string().optional(),
  roleProfile: z.enum(['fast', 'balanced', 'deep_reasoning']).optional(),
});

export const acceptCandidateItemSchema = z.object({
  tempId: z.string(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  category: requirementCategorySchema,
  priority: requirementPrioritySchema,
  sourceReference: z.string().trim().max(500).optional(),
  ownerUserId: uuidSchema.nullable().optional(),
});

export const acceptProposalInputSchema = z.object({
  briefRevisionId: uuidSchema,
  idempotencyKey: z.string().min(1).max(256),
  acceptedCandidates: z.array(acceptCandidateItemSchema),
});

export type CandidateRequirement = z.infer<typeof candidateRequirementSchema>;
export type RequirementProposal = z.infer<typeof requirementProposalSchema>;
export type ExtractRequirementsInput = z.infer<typeof extractRequirementsInputSchema>;
export type AcceptCandidateItem = z.infer<typeof acceptCandidateItemSchema>;
export type AcceptProposalInput = z.infer<typeof acceptProposalInputSchema>;

// ── Provider Sessions (BYOK) ──

export const setProviderSessionSchema = z.object({
  provider: z.string().min(1).max(50),
  apiKey: z.string().min(1).max(500),
  workspaceId: uuidSchema.optional(),
});

export const providerSessionResponseSchema = z.object({
  provider: z.string(),
  keySuffix: z.string(),
  status: z.enum(['active', 'revoked', 'expired']),
  workspaceId: uuidSchema.optional(),
  createdAt: isoDateSchema,
});

export type SetProviderSessionInput = z.infer<typeof setProviderSessionSchema>;
export type ProviderSessionResponse = z.infer<typeof providerSessionResponseSchema>;

// ── Copilot ──

export const copilotQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  question: z.string().min(1).max(1000),
  context: z.string().max(2000).optional(),
});

export const copilotRiskSchema = z.object({
  id: z.string().min(1).max(50),
  risk: z.string().min(1).max(1000),
  severity: z.enum(['low', 'medium', 'high']),
  mitigation: z.string().max(2000).optional(),
});

export const copilotBlockerSchema = z.object({
  id: z.string().min(1).max(50),
  blocker: z.string().min(1).max(1000),
  relatedEntity: z.string().max(200).optional(),
});

export const evidenceGapSchema = z.object({
  requirementId: uuidSchema,
  requirementTitle: z.string().min(1).max(300),
  reason: z.string().max(1000),
});

export const proposedActionTypeSchema = z.enum([
  'create_task',
  'update_task',
  'create_milestone',
  'update_requirement',
  'create_requirement',
  'link_task_requirement',
  'request_evidence',
]);

export const proposedActionSchema = z.object({
  proposalId: z.string().min(1).max(128),
  actionType: proposedActionTypeSchema,
  description: z.string().min(1).max(1000),
  groundingReference: z.string().min(1).max(500),
  isInference: z.literal(true),
  payload: z.record(z.unknown()),
});

export const sourceRecordSchema = z.object({
  entityType: z.enum(['project', 'milestone', 'task', 'requirement', 'evidence', 'brief_revision']),
  id: z.string(),
  nameOrTitle: z.string(),
});

export const copilotWorkflowStageSchema = z.enum([
  'brief_ingestion',
  'requirements_extraction',
  'task_linkage',
  'evidence_collection',
  'verification',
]);

export const copilotReportSchema = z.object({
  groundedSummary: z.string().max(5000),
  inferredSummary: z.string().max(5000),
  workflowStage: copilotWorkflowStageSchema.optional(),
  nextActionExplanation: z.string().max(2000).optional(),
  unlinkedTasksCount: z.number().int().optional(),
  unverifiedRequirementsCount: z.number().int().optional(),
  openQuestions: z.array(copilotQuestionSchema),
  risks: z.array(copilotRiskSchema),
  blockers: z.array(copilotBlockerSchema),
  evidenceGaps: z.array(evidenceGapSchema),
  proposedActions: z.array(proposedActionSchema),
  sourceRecords: z.array(sourceRecordSchema),
  generatedAt: isoDateSchema,
  provider: z.string(),
  model: z.string(),
  modelRole: z.string().optional(),
  routingReason: z.string().optional(),
  requesterId: uuidSchema,
  projectId: uuidSchema,
});

export const generateCopilotReportSchema = z.object({
  projectId: uuidSchema,
  providerOverride: z.string().optional(),
  modelOverride: z.string().optional(),
  roleProfile: z.enum(['fast', 'balanced', 'deep_reasoning']).optional(),
});

export const approveCopilotActionSchema = z.object({
  projectId: uuidSchema,
  proposalId: z.string().min(1).max(128),
  action: proposedActionSchema,
});

export const rejectCopilotActionSchema = z.object({
  projectId: uuidSchema,
  proposalId: z.string().min(1).max(128),
  reason: z.string().max(1000).optional(),
});

export type CopilotQuestion = z.infer<typeof copilotQuestionSchema>;
export type CopilotRisk = z.infer<typeof copilotRiskSchema>;
export type CopilotBlocker = z.infer<typeof copilotBlockerSchema>;
export type EvidenceGap = z.infer<typeof evidenceGapSchema>;
export type ProposedActionType = z.infer<typeof proposedActionTypeSchema>;
export type ProposedAction = z.infer<typeof proposedActionSchema>;
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type CopilotReport = z.infer<typeof copilotReportSchema>;
export type CopilotWorkflowStage = z.infer<typeof copilotWorkflowStageSchema>;
export type GenerateCopilotReportInput = z.infer<typeof generateCopilotReportSchema>;
export type ApproveCopilotActionInput = z.infer<typeof approveCopilotActionSchema>;
export type RejectCopilotActionInput = z.infer<typeof rejectCopilotActionSchema>;

// ── MCP (Model Context Protocol) ──

export const mcpScopeEnum = z.enum(['mcp:read', 'mcp:admin']);
export type McpScope = z.infer<typeof mcpScopeEnum>;

export const mcpToolDescriptorSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  inputSchema: z.record(z.unknown()),
});

export const mcpCallToolInputSchema = z.object({
  name: z.string().min(1).max(100),
  arguments: z.record(z.unknown()).default({}),
});

export const mcpCreateTokenSchema = z.object({
  workspaceId: uuidSchema,
  scopes: z.array(mcpScopeEnum).min(1).default(['mcp:read']),
  ttlDays: z.number().int().min(1).max(365).default(30),
});

export const mcpRevokeTokenSchema = z.object({
  token: z.string().optional(),
  tokenId: z.string().optional(),
  revokeAll: z.boolean().optional(),
});

export const mcpPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type McpToolDescriptor = z.infer<typeof mcpToolDescriptorSchema>;
export type McpCallToolInput = z.infer<typeof mcpCallToolInputSchema>;
export type McpCreateTokenInput = z.infer<typeof mcpCreateTokenSchema>;
export type McpRevokeTokenInput = z.infer<typeof mcpRevokeTokenSchema>;
export type McpPaginationInput = z.infer<typeof mcpPaginationSchema>;

// ── Dynamic Model Discovery & Role Profiles ──

export const modelRoleProfileEnum = z.enum(['fast', 'balanced', 'deep_reasoning', 'unclassified']);
export type ModelRoleProfile = z.infer<typeof modelRoleProfileEnum>;

export const discoveredModelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  vendor: z.string(),
  family: z.string(),
  isNemotron: z.boolean(),
  roleSuggestion: modelRoleProfileEnum.default('unclassified'),
  contextLength: z.number().int().positive().optional(),
  pricing: z
    .object({
      prompt: z.union([z.string(), z.number()]).optional(),
      completion: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  quantization: z.string().optional(),
  tags: z.array(z.string()).default([]),
  rawMetadata: z.record(z.unknown()).optional(),
});
export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;

export const modelCatalogResponseSchema = z.object({
  provider: z.string(),
  models: z.array(discoveredModelSchema),
  nemotronModels: z.array(discoveredModelSchema),
  roleAssignments: z.object({
    fast: discoveredModelSchema.nullable(),
    balanced: discoveredModelSchema.nullable(),
    deep_reasoning: discoveredModelSchema.nullable(),
  }),
  fetchedAt: z.string(),
  cached: z.boolean(),
  source: z.literal('nebius_token_factory_catalog'),
});
export type ModelCatalogResponse = z.infer<typeof modelCatalogResponseSchema>;

export const modelPreferencesSchema = z.object({
  selectedModelId: z.string().optional(),
  selectedRoleProfile: z.enum(['fast', 'balanced', 'deep_reasoning']).optional(),
  customRoleAssignments: z
    .object({
      fast: z.string().optional(),
      balanced: z.string().optional(),
      deep_reasoning: z.string().optional(),
    })
    .optional(),
});
export type ModelPreferences = z.infer<typeof modelPreferencesSchema>;

// ── Nebius Serverless Jobs (Asynchronous Delivery Workflows) ──

export const jobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobExecutionTargetSchema = z.enum(['nebius_serverless_job', 'local_worker']);
export type JobExecutionTarget = z.infer<typeof jobExecutionTargetSchema>;

export const createPortfolioAuditJobSchema = z.object({
  workspaceId: uuidSchema,
  projectId: uuidSchema.optional(),
  modelOverride: z.string().optional(),
  roleProfile: z.enum(['fast', 'balanced', 'deep_reasoning']).optional(),
  idempotencyKey: z.string().max(128).optional(),
});
export type CreatePortfolioAuditJobInput = z.infer<typeof createPortfolioAuditJobSchema>;

export const serverlessJobRecordSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  projectId: uuidSchema.nullable().optional(),
  userId: uuidSchema,
  jobType: z.string(),
  status: jobStatusSchema,
  executionTarget: jobExecutionTargetSchema,
  modelId: z.string().nullable().optional(),
  modelRole: z.string().nullable().optional(),
  progressPercent: z.number().int().min(0).max(100),
  result: z.record(z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  cloudJobId: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ServerlessJobRecord = z.infer<typeof serverlessJobRecordSchema>;


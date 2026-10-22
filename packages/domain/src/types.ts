/**
 * Core domain types for Vouchlock.
 * Pure TypeScript definitions with zero external dependencies.
 */

// ── Workspace & Identity ──

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface User {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export interface IdentityLink {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly providerSubject: string;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface WorkspaceMember {
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
  readonly joinedAt: Date;
  readonly invitedBy: string | null;
}

export interface Invitation {
  readonly id: string;
  readonly workspaceId: string;
  readonly invitedEmail: string | null;
  readonly tokenHash: string;
  readonly role: WorkspaceRole;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdBy: string;
}

// ── Project ──

export type ProjectStatus = 'active' | 'archived';

export interface Project {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly goal: string;
  readonly audience: string | null;
  readonly deliverable: string | null;
  readonly deadline: Date | null;
  readonly constraints: Record<string, unknown>;
  readonly successMeasures: Record<string, unknown>;
  readonly status: ProjectStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

// ── Milestone ──

export interface Milestone {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: Date | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ── Task ──

export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  readonly id: string;
  readonly projectId: string;
  readonly milestoneId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeUserId: string | null;
  readonly dueDate: Date | null;
  readonly sortOrder: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface TaskDependency {
  readonly taskId: string;
  readonly dependsOnTaskId: string;
}

// ── Comment ──

export interface Comment {
  readonly id: string;
  readonly taskId: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly deletedAt: Date | null;
}

// ── AI Generation ──

export type AiGenerationKind =
  'plan_draft' | 'task_breakdown' | 'progress_summary' | 'requirement_extraction';

export interface ProjectBriefRevision {
  readonly id: string;
  readonly projectId: string;
  readonly revisionNumber: number;
  readonly title: string;
  readonly content: string;
  readonly notes: string | null;
  readonly authorUserId: string;
  readonly createdAt: Date;
}

export interface CandidateRequirement {
  readonly tempId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly category: RequirementCategory;
  readonly priority: RequirementPriority;
  readonly sourceReference?: string | null;
  readonly rationale?: string | null;
}

export interface RequirementProposal {
  readonly summary: string;
  readonly candidates: readonly CandidateRequirement[];
  readonly assumptions: readonly string[];
  readonly ambiguities: readonly string[];
  readonly conflicts: readonly string[];
  readonly risks: readonly string[];
}

export interface AiGeneration {
  readonly id: string;
  readonly projectId: string;
  readonly requesterId: string;
  readonly kind: AiGenerationKind;
  readonly provider: string;
  readonly model: string;
  readonly inputHash: string;
  readonly outputJson: unknown;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
}

// ── Requirement ──

export type RequirementCategory = 'functional' | 'non_functional' | 'constraint' | 'deliverable';
export type RequirementPriority = 'low' | 'normal' | 'high';
export type RequirementStatus = 'draft' | 'active' | 'verified' | 'blocked' | 'deprecated';

export interface Requirement {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: RequirementCategory;
  readonly priority: RequirementPriority;
  readonly status: RequirementStatus;
  readonly sourceReference: string | null;
  readonly ownerUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface RequirementTaskLink {
  readonly requirementId: string;
  readonly taskId: string;
}

// ── Evidence ──

export type EvidenceType = 'url' | 'note';

export interface Evidence {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly taskId: string | null;
  readonly authorUserId: string;
  readonly type: EvidenceType;
  readonly title: string;
  readonly content: string;
  readonly createdAt: Date;
}

// ── Verification ──

export type VerificationStatus = 'verified' | 'rejected' | 'unverified';

export interface VerificationRecord {
  readonly id: string;
  readonly requirementId: string;
  readonly verifiedByUserId: string;
  readonly status: VerificationStatus;
  readonly notes: string | null;
  readonly createdAt: Date;
}

// ── Audit ──

export interface AuditEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

// ── Brief-to-Proof Delivery Agent Domain Types ──

export type RequirementCoverageStatus =
  | 'covered'
  | 'partially_covered'
  | 'uncovered'
  | 'needs_clarification';

export interface RequirementCoverageItem {
  readonly requirementId: string;
  readonly requirementTitle: string;
  readonly category: RequirementCategory;
  readonly priority: RequirementPriority;
  readonly coverageStatus: RequirementCoverageStatus;
  readonly sourceReference?: string | null;
  readonly rationale: string;
  readonly linkedTaskIds: readonly string[];
  readonly linkedTaskTitles: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly evidenceNeeded: readonly string[];
  readonly openQuestions: readonly string[];
  readonly isVerified: boolean;
  readonly allTasksDone: boolean;
}

export interface DeliveryPlanTaskProposal {
  readonly title: string;
  readonly description?: string | null;
  readonly linkedRequirementTitles: readonly string[];
  readonly evidenceNeeded?: string | null;
  readonly ownerSuggestion?: string | null;
  readonly dueDate?: string | null;
  readonly dependencyTitles?: readonly string[];
}

export interface DeliveryPlanMilestoneProposal {
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly tasks: readonly DeliveryPlanTaskProposal[];
}

export interface DeliveryPlanRequirementCoverageProposal {
  readonly requirementId: string;
  readonly requirementTitle: string;
  readonly category: RequirementCategory;
  readonly priority: RequirementPriority;
  readonly coverageStatus: RequirementCoverageStatus;
  readonly sourceReference?: string | null;
  readonly rationale: string;
  readonly proposedTaskTitles: readonly string[];
  readonly evidenceNeeded: readonly string[];
  readonly openQuestions: readonly string[];
}

export interface DeliveryPlanDraft {
  readonly summary: string;
  readonly coverageSummary: {
    readonly totalRequirements: number;
    readonly covered: number;
    readonly partiallyCovered: number;
    readonly uncovered: number;
    readonly needsClarification: number;
    readonly percentCovered: number;
  };
  readonly requirements: readonly DeliveryPlanRequirementCoverageProposal[];
  readonly milestones: readonly DeliveryPlanMilestoneProposal[];
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
}

export type EvidenceReviewRecommendation = 'accept' | 'request_more_proof' | 'human_review';
export type EvidenceConfidenceLevel = 'high' | 'medium' | 'low';

export interface EvidenceReviewAdvisory {
  readonly evidenceId: string;
  readonly requirementId: string;
  readonly summary: string;
  readonly advisoryRecommendation: EvidenceReviewRecommendation;
  readonly confidence: EvidenceConfidenceLevel;
  readonly strengths: readonly string[];
  readonly deficiencies: readonly string[];
  readonly stalenessOrScopeWarning?: string | null;
  readonly suggestedClarification?: string | null;
  readonly sourceCitation: string;
  readonly evaluatedAt: string;
  readonly provider: string;
  readonly model: string;
}

export interface ProjectChangeRecord {
  readonly entityType: 'task' | 'requirement' | 'evidence' | 'brief_revision' | 'verification' | 'project';
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ProjectFreshnessEvaluation {
  readonly isStale: boolean;
  readonly lastReportGeneratedAt: string | null;
  readonly changedRecords: readonly ProjectChangeRecord[];
}


/**
 * ProjectPilot Copilot / Delivery Agent Types & Interfaces
 */

import type {
  CopilotReport,
  CopilotWorkflowStage,
  CopilotQuestion,
  CopilotRisk,
  CopilotBlocker,
  EvidenceGap,
  ProposedAction,
  ProposedActionType,
  SourceRecord,
  RequirementCoverageItem,
  RequirementCoverageStatus,
  DeliveryPlanDraft,
  DeliveryPlanMilestoneProposal,
  DeliveryPlanTaskProposal,
  DeliveryPlanRequirementCoverageProposal,
  EvidenceReviewAdvisory,
  CopilotFreshness,
  ProjectChangeRecord,
} from '@projectpilot/contracts';

export type {
  CopilotReport,
  CopilotWorkflowStage,
  CopilotQuestion,
  CopilotRisk,
  CopilotBlocker,
  EvidenceGap,
  ProposedAction,
  ProposedActionType,
  SourceRecord,
  RequirementCoverageItem,
  RequirementCoverageStatus,
  DeliveryPlanDraft,
  DeliveryPlanMilestoneProposal,
  DeliveryPlanTaskProposal,
  DeliveryPlanRequirementCoverageProposal,
  EvidenceReviewAdvisory,
  CopilotFreshness,
  ProjectChangeRecord,
};


export interface CopilotProjectContext {
  id: string;
  name: string;
  goal: string;
  audience?: string | null;
  deliverable?: string | null;
  deadline?: string | null;
  status: string;
  updatedAt?: string;
}

export interface CopilotMilestoneContext {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  updatedAt?: string;
}

export interface CopilotTaskContext {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  milestoneId?: string | null;
  linkedRequirementIds?: string[];
  updatedAt?: string;
}

export interface CopilotRequirementContext {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  priority: string;
  status: string;
  sourceReference?: string | null;
  linkedTaskIds?: string[];
  evidenceCount?: number;
  verificationStatus?: string | null;
  updatedAt?: string;
}

export interface CopilotEvidenceContext {
  id: string;
  requirementId: string;
  taskId?: string | null;
  type: string;
  title: string;
  content: string;
  createdAt?: string;
}

export interface CopilotVerificationContext {
  id: string;
  requirementId: string;
  status: string;
  notes?: string | null;
  createdAt: string;
}

export interface CopilotBriefContext {
  id: string;
  revisionNumber: number;
  title: string;
  content: string;
  createdAt?: string;
}

export interface CopilotAuditItem {
  action: string;
  subjectType: string;
  subjectId: string;
  createdAt: string;
}

export interface CopilotContext {
  workspaceId: string;
  project: CopilotProjectContext;
  milestones: CopilotMilestoneContext[];
  tasks: CopilotTaskContext[];
  requirements: CopilotRequirementContext[];
  evidence: CopilotEvidenceContext[];
  verifications: CopilotVerificationContext[];
  briefRevisions: CopilotBriefContext[];
  requirementTasks: Array<{ requirementId: string; taskId: string }>;
  recentAuditEvents: CopilotAuditItem[];
  memberNames: string[];
  changeRecords: ProjectChangeRecord[];
}


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
};

export interface CopilotProjectContext {
  id: string;
  name: string;
  goal: string;
  audience?: string | null;
  deliverable?: string | null;
  deadline?: string | null;
  status: string;
}

export interface CopilotMilestoneContext {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
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
}

export interface CopilotEvidenceContext {
  id: string;
  requirementId: string;
  taskId?: string | null;
  type: string;
  title: string;
  content: string;
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
}

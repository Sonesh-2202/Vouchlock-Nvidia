/**
 * ProjectPilot Copilot Types & Interfaces
 */

import type {
  CopilotReport,
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
}

export interface CopilotRequirementContext {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  priority: string;
  status: string;
  sourceReference?: string | null;
}

export interface CopilotEvidenceContext {
  id: string;
  requirementId: string;
  taskId?: string | null;
  type: string;
  title: string;
  content: string;
}

export interface CopilotBriefContext {
  id: string;
  revisionNumber: number;
  title: string;
  content: string;
}

export interface CopilotContext {
  workspaceId: string;
  project: CopilotProjectContext;
  milestones: CopilotMilestoneContext[];
  tasks: CopilotTaskContext[];
  requirements: CopilotRequirementContext[];
  evidence: CopilotEvidenceContext[];
  briefRevisions: CopilotBriefContext[];
  memberNames: string[];
}

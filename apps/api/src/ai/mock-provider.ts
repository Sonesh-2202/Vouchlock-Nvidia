/**
 * Deterministic Mock AI Provider.
 * Zero external network calls. Guaranteed reproducibility for testing and offline local development.
 * Never fabricates owners or fake verification.
 */

import type { PlanDraft, RequirementProposal } from '@projectpilot/domain';
import type {
  AiProvider,
  AiProviderResult,
  PlanGenerationInput,
  RequirementExtractionInput,
} from './types.js';

export class MockAiProvider implements AiProvider {
  readonly id = 'mock';

  async generatePlan(input: PlanGenerationInput): Promise<AiProviderResult<PlanDraft>> {
    const primaryOwner = input.memberNames.length > 0 ? input.memberNames[0]! : null;
    const secondaryOwner = input.memberNames.length > 1 ? input.memberNames[1]! : primaryOwner;

    const deadline = input.deadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const m1Date = new Date(Date.now() + Math.floor((deadline.getTime() - Date.now()) * 0.35));
    const m2Date = new Date(Date.now() + Math.floor((deadline.getTime() - Date.now()) * 0.7));
    const m3Date = deadline;

    const m1DateStr = m1Date.toISOString();
    const m2DateStr = m2Date.toISOString();
    const m3DateStr = m3Date.toISOString();

    const draft: PlanDraft = {
      summary: `Structured execution plan for: "${input.goal.slice(0, 100)}${input.goal.length > 100 ? '…' : ''}". Phased delivery across 3 sequential milestones with clear ownership and risk mitigation.`,
      assumptions: [
        'Core stakeholder requirements are captured in the project brief',
        'Team members have requisite environment access and credentials',
        'Feedback cycles occur at each milestone review checkpoint',
      ],
      risks: [
        'Scope expansion beyond initial deliverable specifications',
        'External dependency delays or integration blockers',
        'Resource contention near milestone deadlines',
      ],
      milestones: [
        {
          title: 'Phase 1: Foundation & Requirements Alignment (Draft)',
          description:
            'Establish core technical architecture, define schemas, and clarify ambiguities.',
          dueDate: m1DateStr,
          tasks: [
            {
              title: 'Audit project brief and document edge cases',
              description: `Review requirements for ${input.deliverable ?? 'the core deliverable'} and record constraints.`,
              ownerSuggestion: primaryOwner,
              dueDate: m1DateStr,
              dependencyTitles: [],
            },
            {
              title: 'Set up development workspace and CI verification',
              description: 'Initialize repositories, environment templates, and automated checks.',
              ownerSuggestion: secondaryOwner,
              dueDate: m1DateStr,
              dependencyTitles: ['Audit project brief and document edge cases'],
            },
          ],
        },
        {
          title: 'Phase 2: Core Implementation & Feature Delivery (Draft)',
          description: 'Build primary functional components and domain logic.',
          dueDate: m2DateStr,
          tasks: [
            {
              title: 'Implement core business logic and persistence models',
              description: 'Develop required data schemas and validation rules.',
              ownerSuggestion: primaryOwner,
              dueDate: m2DateStr,
              dependencyTitles: ['Set up development workspace and CI verification'],
            },
            {
              title: 'Build user-facing interfaces and workflow interactions',
              description: 'Create responsive views, loading states, and form validations.',
              ownerSuggestion: secondaryOwner,
              dueDate: m2DateStr,
              dependencyTitles: ['Implement core business logic and persistence models'],
            },
          ],
        },
        {
          title: 'Phase 3: Verification, Hardening & Delivery (Draft)',
          description:
            'Complete end-to-end testing, review against acceptance criteria, and deliver.',
          dueDate: m3DateStr,
          tasks: [
            {
              title: 'Execute test suites and verify acceptance criteria',
              description:
                'Run unit, integration, and user scenario tests to confirm zero regressions.',
              ownerSuggestion: secondaryOwner,
              dueDate: m3DateStr,
              dependencyTitles: ['Build user-facing interfaces and workflow interactions'],
            },
            {
              title: 'Finalize documentation and package delivery artifact',
              description: 'Generate delivery report, export state, and prepare release notes.',
              ownerSuggestion: primaryOwner,
              dueDate: m3DateStr,
              dependencyTitles: ['Execute test suites and verify acceptance criteria'],
            },
          ],
        },
      ],
    };

    return {
      provider: 'mock',
      model: 'deterministic-mock-v1',
      data: draft,
      usage: { promptTokens: 120, completionTokens: 380, totalTokens: 500 },
    };
  }

  async extractRequirements(
    input: RequirementExtractionInput,
  ): Promise<AiProviderResult<RequirementProposal>> {
    const text = input.briefText.trim();
    const excerpt = text.length > 80 ? text.slice(0, 80) + '…' : text;

    const proposal: RequirementProposal = {
      summary: `Extracted candidate requirements from brief: "${excerpt}". Review and accept individual items to create canonical project requirements.`,
      candidates: [
        {
          tempId: 'cand-1',
          title: 'Core Deliverable Specification',
          description: `Deliverable extracted from brief: ${text.slice(0, 200)}`,
          category: 'deliverable',
          priority: 'high',
          sourceReference: text.slice(0, 100),
          rationale: 'Primary project outcome identified in brief text.',
        },
        {
          tempId: 'cand-2',
          title: 'Functional Workflow Requirements',
          description: 'Key user workflows and interactive actions described in the brief.',
          category: 'functional',
          priority: 'normal',
          sourceReference: text.length > 100 ? text.slice(100, 200) : text.slice(0, 50),
          rationale: 'Required for user execution path.',
        },
        {
          tempId: 'cand-3',
          title: 'Technical & Operational Constraints',
          description: 'Platform constraints and boundary conditions declared in the source text.',
          category: 'constraint',
          priority: 'high',
          sourceReference: text.length > 200 ? text.slice(200, 300) : text.slice(0, 50),
          rationale: 'Necessary to prevent out-of-scope architectural deviation.',
        },
      ],
      assumptions: [
        'Stakeholder feedback will be gathered at agreed milestone checkpoints.',
        'Team has uninterrupted access to target execution environments.',
      ],
      ambiguities: [
        'Specific non-functional latency and concurrency targets were not explicitly quantified in the brief text.',
      ],
      conflicts: [],
      risks: [
        'Potential scope expansion beyond initial deliverable boundary.',
        'Unverified third-party dependencies could delay verification.',
      ],
    };

    return {
      provider: 'mock',
      model: 'deterministic-mock-v1',
      data: proposal,
      usage: { promptTokens: 95, completionTokens: 250, totalTokens: 345 },
    };
  }
}

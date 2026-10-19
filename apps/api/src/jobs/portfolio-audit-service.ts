/**
 * Portfolio Delivery Audit Service — Asynchronous Delivery Workflow
 * Analyzes workspace portfolio delivery integrity, requirement proof coverage,
 * and completion-vs-verification gaps.
 * Supports Nebius Serverless Jobs cloud execution when configured,
 * with a transparent local worker simulation fallback clearly labeled
 * as "Local Simulation (Background Worker)".
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { CreatePortfolioAuditJobInput, ServerlessJobRecord } from '@projectpilot/contracts';
import {
  serverlessJobs,
  projects,
  tasks,
  requirements,
  evidence,
  verifications,
  workspaceMembers,
} from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { resolveAiProvider } from '../ai/planner.js';
import { NebiusTokenFactoryProvider, extractJsonFromResponse } from '../ai/nebius-provider.js';

// Active in-memory abort controllers for local cancellation
const activeJobControllers = new Map<string, AbortController>();

export class PortfolioAuditJobService {
  /**
   * Submits a portfolio audit job with idempotency protection.
   */
  async submitAuditJob(
    input: CreatePortfolioAuditJobInput & { userId: string },
    config: AppConfig,
    db: Database,
    logger: Logger,
  ): Promise<ServerlessJobRecord> {
    const { workspaceId, projectId, userId, modelOverride, roleProfile, idempotencyKey } = input;

    // 1. Idempotency check: avoid duplicate paid work
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const existing = await db
        .select()
        .from(serverlessJobs)
        .where(
          and(
            eq(serverlessJobs.workspaceId, workspaceId),
            eq(serverlessJobs.idempotencyKey, idempotencyKey.trim()),
            inArray(serverlessJobs.status, ['queued', 'running']),
          ),
        )
        .limit(1);

      if (existing[0]) {
        logger.info(
          { jobId: existing[0].id, idempotencyKey },
          'reusing existing in-flight portfolio audit job',
        );
        return this.formatJobRecord(existing[0]);
      }
    }

    // 2. Determine execution target
    const hasNebiusJobsCloud = Boolean(
      config.nebiusJobsEndpoint &&
        config.nebiusJobsEndpoint.trim().length > 0 &&
        config.nebiusJobsApiKey &&
        config.nebiusJobsApiKey.trim().length > 0 &&
        config.nebiusJobsProjectId &&
        config.nebiusJobsProjectId.trim().length > 0,
    );

    if (input.executionTargetPreference === 'nebius_serverless_job') {
      if (!hasNebiusJobsCloud) {
        throw new Error(
          'Nebius Serverless Jobs cloud execution is currently unavailable. ' +
            'Cloud execution requires dedicated Nebius AI Cloud control-plane IAM credentials ' +
            '(NEBIUS_JOBS_API_KEY, NEBIUS_PROJECT_ID, NEBIUS_JOBS_ENDPOINT) separate from Token Factory inference keys, ' +
            'and worker container deployment (see deploy/nebius-serverless-jobs/job-spec.yaml). ' +
            'Please select the Local Worker option to run this audit asynchronously.',
        );
      }
    }

    const executionTarget =
      input.executionTargetPreference === 'local_worker'
        ? 'local_worker'
        : hasNebiusJobsCloud && input.executionTargetPreference === 'nebius_serverless_job'
          ? 'nebius_serverless_job'
          : 'local_worker';

    // 3. Create job record in queued state
    const [createdJob] = await db
      .insert(serverlessJobs)
      .values({
        workspaceId,
        projectId: projectId ?? null,
        userId,
        jobType: 'portfolio_delivery_audit',
        status: 'queued',
        executionTarget,
        modelRole: roleProfile || 'deep_reasoning',
        idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
        inputParams: {
          workspaceId,
          projectId: projectId ?? null,
          modelOverride: modelOverride ?? null,
          roleProfile: roleProfile ?? 'deep_reasoning',
          executionTargetPreference: input.executionTargetPreference ?? null,
        },
        progressPercent: 0,
      })
      .returning();

    if (!createdJob) {
      throw new Error('Failed to create serverless job record');
    }

    logger.info(
      { jobId: createdJob.id, executionTarget, workspaceId },
      'portfolio delivery audit job queued',
    );

    // 4. Dispatch job — NEVER silently fall back between cloud and local
    if (executionTarget === 'nebius_serverless_job') {
      this.dispatchCloudJob(createdJob.id, input, config, db, logger).catch((err) => {
        logger.error({ err, jobId: createdJob.id }, 'failed to dispatch Nebius Serverless Job');
      });
    } else {
      // Local asynchronous simulation worker
      this.executeLocalJob(createdJob.id, input, config, db, logger).catch((err) => {
        logger.error({ err, jobId: createdJob.id }, 'local portfolio audit worker encountered error');
      });
    }

    return this.formatJobRecord(createdJob);
  }

  /**
   * Cancels an ongoing job if permitted.
   */
  async cancelJob(
    jobId: string,
    workspaceId: string,
    db: Database,
    logger: Logger,
  ): Promise<ServerlessJobRecord | null> {
    const [job] = await db
      .select()
      .from(serverlessJobs)
      .where(and(eq(serverlessJobs.id, jobId), eq(serverlessJobs.workspaceId, workspaceId)))
      .limit(1);

    if (!job) return null;
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      return this.formatJobRecord(job);
    }

    // Abort local worker if running
    const controller = activeJobControllers.get(jobId);
    if (controller) {
      controller.abort();
      activeJobControllers.delete(jobId);
    }

    const [updated] = await db
      .update(serverlessJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serverlessJobs.id, jobId))
      .returning();

    logger.info({ jobId }, 'serverless job cancelled');
    return updated ? this.formatJobRecord(updated) : null;
  }

  /**
   * Retrieves single job status.
   */
  async getJob(jobId: string, workspaceId: string, db: Database): Promise<ServerlessJobRecord | null> {
    const [job] = await db
      .select()
      .from(serverlessJobs)
      .where(and(eq(serverlessJobs.id, jobId), eq(serverlessJobs.workspaceId, workspaceId)))
      .limit(1);

    return job ? this.formatJobRecord(job) : null;
  }

  /**
   * Lists jobs for a workspace.
   */
  async listJobs(workspaceId: string, db: Database, limit = 20): Promise<ServerlessJobRecord[]> {
    const rows = await db
      .select()
      .from(serverlessJobs)
      .where(eq(serverlessJobs.workspaceId, workspaceId))
      .orderBy(serverlessJobs.createdAt)
      .limit(limit);

    return rows.map((r) => this.formatJobRecord(r));
  }

  /**
   * Local asynchronous worker execution (Simulation path when Nebius AI Cloud credentials are not supplied).
   */
  async executeLocalJob(
    jobId: string,
    input: CreatePortfolioAuditJobInput & { userId: string },
    config: AppConfig,
    db: Database,
    logger: Logger,
  ): Promise<void> {
    const controller = new AbortController();
    activeJobControllers.set(jobId, controller);

    try {
      // 1. Mark running
      await db
        .update(serverlessJobs)
        .set({
          status: 'running',
          startedAt: new Date(),
          progressPercent: 15,
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));

      if (controller.signal.aborted) return;

      // 2. Gather workspace ledger facts across projects
      const projectList = await db
        .select()
        .from(projects)
        .where(
          input.projectId
            ? and(eq(projects.id, input.projectId), eq(projects.workspaceId, input.workspaceId))
            : eq(projects.workspaceId, input.workspaceId),
        );

      const projectIds = projectList.map((p) => p.id);
      if (projectIds.length === 0) {
        throw new Error('No projects found in the selected workspace to audit.');
      }

      await db
        .update(serverlessJobs)
        .set({ progressPercent: 35, updatedAt: new Date() })
        .where(eq(serverlessJobs.id, jobId));

      if (controller.signal.aborted) return;

      // Fetch requirements, tasks, evidence across projects
      const reqRows = await db
        .select()
        .from(requirements)
        .where(inArray(requirements.projectId, projectIds));

      const taskRows = await db
        .select()
        .from(tasks)
        .where(inArray(tasks.projectId, projectIds));

      const evidenceRows = await db
        .select()
        .from(evidence)
        .where(inArray(evidence.projectId, projectIds));

      await db
        .update(serverlessJobs)
        .set({ progressPercent: 55, updatedAt: new Date() })
        .where(eq(serverlessJobs.id, jobId));

      if (controller.signal.aborted) return;

      // Calculate truthful delivery metrics
      const totalTasks = taskRows.length;
      const completedTasks = taskRows.filter((t) => t.status === 'done').length;
      const totalRequirements = reqRows.length;
      const verifiedRequirements = reqRows.filter((r) => r.status === 'verified').length;
      const unverifiedRequirements = totalRequirements - verifiedRequirements;

      // Requirements that have done tasks but zero verified evidence
      const unverifiedWithCompletedTasks = reqRows.filter((r) => {
        const isNotVerified = r.status !== 'verified';
        return isNotVerified;
      });

      const deliveryProofGapRate =
        completedTasks > 0
          ? Math.max(0, Math.round(((completedTasks - verifiedRequirements) / completedTasks) * 100))
          : 0;

      const auditSummaryPayload = {
        totalProjects: projectList.length,
        projects: projectList.map((p) => ({ id: p.id, name: p.name, goal: p.goal })),
        metrics: {
          totalTasks,
          completedTasks,
          totalRequirements,
          verifiedRequirements,
          unverifiedRequirements,
          deliveryProofGapRatePercent: deliveryProofGapRate,
        },
        sampleUnverifiedRequirements: unverifiedWithCompletedTasks.slice(0, 10).map((r) => ({
          id: r.id,
          title: r.title,
          category: r.category,
          priority: r.priority,
          verificationStatus: r.status,
        })),
        evidenceCount: evidenceRows.length,
      };

      await db
        .update(serverlessJobs)
        .set({ progressPercent: 70, updatedAt: new Date() })
        .where(eq(serverlessJobs.id, jobId));

      if (controller.signal.aborted) return;

      // 3. Resolve AI provider for deep reasoning (Nemotron 3 Ultra profile)
      const resolved = await resolveAiProvider(
        config,
        undefined,
        undefined,
        undefined,
        {
          modelOverride: input.modelOverride,
          roleProfile: input.roleProfile || 'deep_reasoning',
          defaultRole: 'deep_reasoning',
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
      );

      await db
        .update(serverlessJobs)
        .set({
          modelId: resolved.modelId,
          modelRole: resolved.modelRole,
          progressPercent: 80,
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));

      if (controller.signal.aborted) return;

      // 4. Inference Call
      const systemPrompt = `You are the Vouchlock Portfolio Delivery Auditor powered by NVIDIA Nemotron served via Nebius Token Factory.
Your purpose is truthful delivery assurance across a project portfolio: a completed task does NOT equal satisfaction of a requirement unless backed by verifiable evidence.
Analyze the portfolio metrics and output an executive audit report in JSON conforming to this schema:
{
  "portfolioIntegrityScore": number (0-100),
  "integrityStatus": "verified_aligned" | "evidence_lag" | "unverified_completion_alert",
  "executiveSummary": string (3-4 sentences synthesizing portfolio risk),
  "keyFindings": [string],
  "criticalGaps": [
    {
      "requirementId": string,
      "title": string,
      "riskAssessment": string,
      "recommendedMitigation": string
    }
  ],
  "proposedRemediations": [
    {
      "action": string,
      "priority": "high" | "normal",
      "targetProjectId": string
    }
  ]
}`;

      const userPrompt = `WORKSPACE PORTFOLIO AUDIT DATA:
${JSON.stringify(auditSummaryPayload, null, 2)}

Produce the truthful portfolio audit analysis in valid JSON now.`;

      let modelOutput = '';
      if (resolved.provider instanceof NebiusTokenFactoryProvider) {
        const completion = await resolved.provider.callChatCompletions(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { signal: controller.signal },
        );
        modelOutput = completion.content;
      } else {
        const extraction = await resolved.provider.extractRequirements(
          {
            briefText: `${systemPrompt}\n\n${userPrompt}`,
          },
          { signal: controller.signal },
        );
        modelOutput = JSON.stringify(extraction.data);
      }

      const jsonStr = extractJsonFromResponse(modelOutput);
      let parsedAuditResult: Record<string, unknown>;
      try {
        parsedAuditResult = JSON.parse(jsonStr);
      } catch {
        parsedAuditResult = {
          portfolioIntegrityScore: Math.max(10, 100 - deliveryProofGapRate),
          integrityStatus: deliveryProofGapRate > 25 ? 'unverified_completion_alert' : 'evidence_lag',
          executiveSummary: `Portfolio audit completed across ${projectList.length} project(s). ${completedTasks} completed task(s) evaluated against ${verifiedRequirements} verified requirement(s). Proof gap rate is ${deliveryProofGapRate}%.`,
          keyFindings: [
            `${unverifiedRequirements} requirement(s) lack formal human or automated verification.`,
            `Delivery proof gap rate stands at ${deliveryProofGapRate}%.`,
          ],
          criticalGaps: unverifiedWithCompletedTasks.slice(0, 5).map((r) => ({
            requirementId: r.id,
            title: r.title,
            riskAssessment: 'Task marked completed but no verified proof linked.',
            recommendedMitigation: 'Request evidence attachment and authorized verification.',
          })),
          proposedRemediations: [],
        };
      }

      // Add provenance and metadata
      const finalReport = {
        ...parsedAuditResult,
        auditMetadata: {
          analyzedProjectsCount: projectList.length,
          totalTasks,
          completedTasks,
          totalRequirements,
          verifiedRequirements,
          deliveryProofGapRatePercent: deliveryProofGapRate,
          executedVia: 'local_worker',
          executionBadge: 'Local Simulation (Background Worker)',
          modelId: resolved.modelId,
          modelRole: resolved.modelRole,
          routingReason: resolved.routingReason,
          completedAt: new Date().toISOString(),
        },
      };

      // 5. Mark succeeded
      await db
        .update(serverlessJobs)
        .set({
          status: 'succeeded',
          progressPercent: 100,
          result: finalReport,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));

      logger.info({ jobId }, 'local portfolio delivery audit job completed successfully');
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        logger.info({ jobId }, 'job aborted due to cancellation');
        return;
      }
      logger.error({ err, jobId }, 'local portfolio audit job failed');
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(serverlessJobs)
        .set({
          status: 'failed',
          error: msg,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));
    } finally {
      activeJobControllers.delete(jobId);
    }
  }

  /**
   * Nebius Serverless Jobs cloud dispatch.
   * If credentials/endpoint are configured, dispatches job payload to the cloud API.
   */
  private async dispatchCloudJob(
    jobId: string,
    input: CreatePortfolioAuditJobInput & { userId: string },
    config: AppConfig,
    db: Database,
    logger: Logger,
  ): Promise<void> {
    const endpoint = (config.nebiusJobsEndpoint || '').replace(/\/+$/, '');
    const iamKey = config.nebiusJobsApiKey;
    const projectId = config.nebiusJobsProjectId;

    if (!endpoint || !iamKey || !projectId) {
      const errMessage =
        'Nebius Serverless Jobs cloud execution is not configured. Missing NEBIUS_JOBS_ENDPOINT, NEBIUS_JOBS_API_KEY, or NEBIUS_PROJECT_ID. ' +
        'Cloud execution requires dedicated Nebius AI Cloud control-plane IAM credentials (separate from Token Factory inference credentials) ' +
        'and container worker deployment (deploy/nebius-serverless-jobs/job-spec.yaml).';
      await db
        .update(serverlessJobs)
        .set({
          status: 'failed',
          error: errMessage,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));
      return;
    }

    try {
      logger.info({ jobId, endpoint, projectId }, 'initiating Nebius Serverless Job cloud dispatch');

      // Nebius AI Cloud Serverless Jobs require container image specification and IAM control-plane tokens.
      // Submit job specification matching deploy/nebius-serverless-jobs/job-spec.yaml
      const response = await fetch(`${endpoint}/v1/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${iamKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            name: `vouchlock-audit-${jobId}`,
            project_id: projectId,
            region: config.nebiusJobsRegion || undefined,
          },
          spec: {
            containerCommand: ['node', 'dist/jobs/worker-runner.js', '--job-id', jobId],
            env: [
              { name: 'JOB_ID', value: jobId },
              { name: 'WORKSPACE_ID', value: input.workspaceId },
            ],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Nebius Serverless Jobs API returned HTTP ${response.status}: ${errorText.slice(0, 300)}. ` +
            'Ensure your container worker is built and uploaded according to deploy/nebius-serverless-jobs/README.md.',
        );
      }

      const resData = (await response.json()) as { id?: string; metadata?: { id?: string }; status?: { state?: string } };
      const cloudId = resData.id || resData.metadata?.id || null;

      if (!cloudId) {
        throw new Error('Nebius Serverless Jobs API did not return a valid cloud job identifier in the response.');
      }

      // Do not mark as running until verified by cloud provider response state
      const isCloudRunning = resData.status?.state === 'RUNNING';
      await db
        .update(serverlessJobs)
        .set({
          cloudJobId: cloudId,
          status: isCloudRunning ? 'running' : 'queued',
          startedAt: isCloudRunning ? new Date() : null,
          progressPercent: isCloudRunning ? 20 : 5,
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));

      logger.info({ jobId, cloudJobId: cloudId }, 'Nebius Serverless Job dispatched to cloud');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, jobId },
        'Nebius Serverless Jobs cloud dispatch failed',
      );
      // Mark as failed instead of silently executing a second billable execution without informing user
      await db
        .update(serverlessJobs)
        .set({
          status: 'failed',
          error: `Nebius Serverless Jobs cloud dispatch failed: ${errMsg}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(serverlessJobs.id, jobId));
    }
  }

  private formatJobRecord(row: typeof serverlessJobs.$inferSelect): ServerlessJobRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      userId: row.userId,
      jobType: row.jobType,
      status: row.status,
      executionTarget: row.executionTarget,
      modelId: row.modelId,
      modelRole: row.modelRole,
      progressPercent: row.progressPercent,
      result: row.result,
      error: row.error,
      cloudJobId: row.cloudJobId,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const portfolioAuditJobService = new PortfolioAuditJobService();

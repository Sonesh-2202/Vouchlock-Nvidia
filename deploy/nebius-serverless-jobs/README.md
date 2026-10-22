# Nebius Serverless Jobs Workflow Guide: Portfolio Delivery Audit

This directory details the asynchronous delivery audit workflow designed for **Nebius Serverless Jobs** and **NVIDIA Nemotron**.

---

## Workflow Overview

The **Portfolio Delivery Audit** is an asynchronous, background analytical workflow designed for workspaces containing multiple projects or large delivery ledgers:

- **Goal:** Scan all brief revisions, requirements, execution tasks, and verification records across a workspace to detect delivery gaps, unlinked tasks, and completion claims lacking verifiable evidence.
- **Deep Reasoning Engine:** Invokes NVIDIA Nemotron (preferring Nemotron 3 Ultra discovered from the live Token Factory catalog) for multi-project synthesis.
- **Strict Ledger Protection:** The job produces proposals and reports only. No automatic database writes or canonical state mutations occur without explicit, authorized human approval.
- **Idempotency:** Submitted with an idempotency key (`workspaceId + idempotencyKey`) to avoid triggering duplicate paid jobs when users refresh or retry.
- **Least-Privilege Security:** The job payload transmits only scoped identifiers (`workspaceId`, `projectId`, `userId`), never raw database passwords, master keys, or personal BYOK secrets.

---

## Dual Execution Path: Cloud vs. Local Simulation

Vouchlock provides an explicit choice between two execution targets:

1. **Nebius Serverless Jobs Cloud Runner (`nebius_serverless_job`):**
   - Dispatched when `NEBIUS_JOBS_ENDPOINT`, `NEBIUS_JOBS_API_KEY`, and `NEBIUS_PROJECT_ID` are configured.
   - **Zero Inference Key Fallback:** Token Factory inference keys (`NEBIUS_API_KEY`) are NEVER used as a substitute for Nebius AI Cloud control-plane credentials.
   - **No Silent Fallback:** If cloud dispatch is requested when credentials or endpoints are unconfigured, the system returns a clear error (`nebius_jobs_not_configured`) rather than silently mislabeling a local run as cloud execution.

2. **Local Background Simulation Worker (`local_worker`):**
   - Active out-of-the-box for local development and review.
   - Executes asynchronously on a background worker thread with progress tracking (`15% -> 35% -> 55% -> 70% -> 100%`).
   - Truthfully labeled in the UI and audit logs with the badge:
     `"Local Simulation (Background Worker)"`
   - Never fabricated or misrepresented as a cloud job run.

---

## Required Prerequisites for Live Cloud Execution

To transition from the local simulation worker to live Nebius Serverless Job execution, the following infrastructure must be configured:

1. **Nebius AI Cloud IAM Credentials:** `NEBIUS_JOBS_API_KEY` with permissions to create and manage Serverless Jobs in the target project.
2. **Project & Region Identifiers:** `NEBIUS_PROJECT_ID` and `NEBIUS_REGION` (e.g., `eu-west1`).
3. **Control-Plane Jobs Endpoint:** `NEBIUS_JOBS_ENDPOINT` pointing to the official Nebius AI Cloud job orchestrator.
4. **Worker Container Image in Registry:** Container built using `Dockerfile.worker` and pushed to the Nebius Container Registry (`cr.nemax.nebius.cloud/<PROJECT_ID>/vouchlock-audit-worker:latest`).
5. **Job Manifest:** Executed via `nebius ai job create -f deploy/nebius-serverless-jobs/job-spec.yaml` or control-plane API integration.

---

## Status & Boundaries Notice

> **Important Truthfulness Boundary:**
>
> - Local simulation worker execution is fully implemented and tested with asynchronous job tracking, progress polling, and truthful reporting.
> - Nebius AI Cloud Serverless Job execution requires the container registry and IAM control-plane prerequisites above. Cloud execution remains marked as unconfigured until those credentials and endpoints are supplied.
> - Neither automated tests nor billable live job dispatches were run during this integration phase.

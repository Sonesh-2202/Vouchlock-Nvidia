# Nebius Serverless Jobs Workflow Guide: Portfolio Delivery Audit

This directory details the asynchronous delivery audit workflow powered by **Nebius Serverless Jobs** and **NVIDIA Nemotron**.

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

Vouchlock supports two execution targets:

1. **Nebius Serverless Jobs Cloud Runner (`nebius_serverless_job`):**
   - Dispatched when `NEBIUS_JOBS_ENDPOINT` and `NEBIUS_JOBS_API_KEY` are provided in the environment.
   - The cloud runner spins up an isolated container job on Nebius AI Cloud, queries live Token Factory Nemotron models, and records outputs to the audit database.

2. **Local Background Simulation Worker (`local_worker`):**
   - Used automatically when Nebius AI Cloud serverless job endpoints are unconfigured.
   - Executes asynchronously on an in-process background worker thread with progress tracking (`15% -> 35% -> 55% -> 70% -> 100%`).
   - Clearly labeled in the UI and audit logs with the badge:
     `"Local Simulation (Background Worker)"`
   - Never fabricated or misrepresented as a cloud job run.

---

## Remaining Prerequisites for Cloud Execution

To transition from the local simulation worker to live Nebius Serverless Job execution, the account owner must supply:

1. **Nebius AI Cloud Account & Project ID**
2. **Serverless Jobs API Endpoint:** Configured via `NEBIUS_JOBS_ENDPOINT`.
3. **Jobs Service Account Key:** Configured via `NEBIUS_JOBS_API_KEY` (with Serverless Jobs invocation permissions).
4. **Worker Container Image in Registry:** Built and pushed to `cr.nemax.nebius.cloud/<PROJECT_ID>/vouchlock-audit-worker:latest`.

---

## Verification & Status Notice

> **Important Notice:**
> Local simulation worker fallback is fully operational in the codebase. Cloud Serverless Job execution requires the remaining cloud account and endpoint prerequisites listed above. Do not claim cloud jobs have succeeded until verified in an authorized execution task.

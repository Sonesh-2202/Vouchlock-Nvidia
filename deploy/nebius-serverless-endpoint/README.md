# Nebius Serverless Endpoint Deployment Guide

This directory contains the production container specification and deployment configuration for running the **Vouchlock** interactive application on **Nebius AI Cloud Serverless Endpoints**.

---

## Architecture Clarification

It is essential to distinguish the three separate runtime components:

1. **Nebius Token Factory (Hosted Model Inference API):**
   - Base URL: `https://api.tokenfactory.nebius.com/v1`
   - Role: Serverless API for NVIDIA open-source Nemotron models (Nano, Super, Nemotron 3 Ultra).
   - Dynamic Discovery: Called strictly by the Vouchlock API backend via `GET /v1/models` using the authenticated account's API key.

2. **Nebius Serverless Endpoint (Application Hosting):**
   - Host: Nebius AI Cloud Serverless Endpoints infrastructure.
   - Role: Hosts the containerized interactive Vouchlock web application and Fastify API backend.
   - Traffic: Listens on HTTP port `8080`, responds to `/health` and `/health/ready` probes, and scales from min to max instances based on incoming HTTP request concurrency.

3. **Dedicated Model Endpoint (Optional):**
   - If an account provisions a dedicated private model endpoint inside Nebius AI Cloud, set `NEBIUS_BASE_URL` to point to that endpoint URL instead of the public Token Factory URL.

---

## Deployment Prerequisites

Before deploying the Serverless Endpoint, the account owner must provide the following infrastructure prerequisites:

- **Nebius AI Cloud Account & Project ID:** An active project ID (e.g. `project-xxxxxxxxxx`).
- **Target Region:** Supported region with Serverless Endpoint availability (e.g. `eu-north1-c`).
- **Nebius Container Registry:** Authenticated access to push container images to `cr.nemax.nebius.cloud/<NEBIUS_PROJECT_ID>/vouchlock`.
- **PostgreSQL Database:** Reachable PostgreSQL 16+ instance (such as Nebius Managed Service for PostgreSQL or cloud-hosted database).
- **Nebius Secret Manager / Lockbox:** Secure storage for secrets (`DATABASE_URL`, `JWT_SECRET`, `NEBIUS_API_KEY`).
- **Quota:** Ensure adequate container instance quota is allocated in your Nebius project.

---

## Step-by-Step Deployment Instructions

### 1. Build and Push Container Image

From the workspace root directory:

```bash
# 1. Log in to Nebius Container Registry
nebius cr login

# 2. Build the unified single-container image
docker build -f deploy/nebius-serverless-endpoint/Dockerfile -t cr.nemax.nebius.cloud/<NEBIUS_PROJECT_ID>/vouchlock:latest .

# 3. Push image to registry
docker push cr.nemax.nebius.cloud/<NEBIUS_PROJECT_ID>/vouchlock:latest
```

### 2. Configure Secrets in Nebius Lockbox

Create secret objects in Nebius Lockbox:

- `vouchlock-db-url`: `postgresql://<user>:<password>@<db-host>:5432/<db-name>?sslmode=require`
- `vouchlock-jwt-secret`: Cryptographically secure secret (minimum 32 characters)
- `vouchlock-token-factory-key`: Your Nebius Token Factory API key

### 3. Deploy Serverless Endpoint

Apply the declarative configuration:

```bash
nebius serverless endpoint create -f deploy/nebius-serverless-endpoint/endpoint.yaml
```

Alternatively, use the Nebius Web Console:

1. Navigate to **Serverless Endpoints** -> **Create Endpoint**.
2. Select your container image: `cr.nemax.nebius.cloud/<NEBIUS_PROJECT_ID>/vouchlock:latest`.
3. Set listening port to `8080`.
4. Configure readiness probe: HTTP GET `/health/ready` on port `8080`.
5. Configure liveness probe: HTTP GET `/health` on port `8080`.
6. Attach Lockbox secrets to environment variables (`DATABASE_URL`, `JWT_SECRET`, `NEBIUS_API_KEY`).
7. Click **Deploy**.

---

## Verification & Status Notice

> **Important Deployment Notice:**
> The configuration files in this directory prepare Vouchlock for deployment. This repository and task do **not** claim that the endpoint has been deployed or verified until an authorized cloud deployment and live verification task have been explicitly executed.

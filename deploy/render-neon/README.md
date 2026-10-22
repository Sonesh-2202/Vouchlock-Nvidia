# Render + Neon Demo Deployment

This is a low-cost **hackathon/demo** deployment path for Vouchlock. It runs the built Vite app and Fastify API from one Render web service, uses Neon for managed PostgreSQL, and calls Nemotron through Nebius Token Factory from the server.

```text
Browser ── same-origin HTTPS ──> Render Web Service
                                  ├── React/Vite static app
                                  ├── Fastify API and session auth
                                  └── Drizzle migrations at startup
                                             ├──> Neon PostgreSQL
                                             └──> Nebius Token Factory (Nemotron)
```

The Render service sleeps after inactivity on its free plan and can take about a minute to wake. Free Render Postgres is intentionally not used because it expires after 30 days. Free service instances are for previews and demos, not production workloads. See [Render's current free limits](https://render.com/docs/free).

## 1. Create the Neon database

1. Create a Neon account and a PostgreSQL project.
2. Create or select the production database/branch for this demo.
3. Copy the **pooled** connection string from Neon. Keep it private; do not put it in GitHub, a client-side `VITE_*` variable, or a public issue.
4. Keep this string for the Render Blueprint setup. It becomes `DATABASE_URL`.

Neon exposes a pooled connection URI option in its connection details. Use that URI for the web service rather than opening one direct database connection per browser user. Review the current [Neon free plan limits](https://neon.com/pricing) and do not store important production data in this demo database without a backup/restore plan.

## 2. Create the Render service from the Blueprint

1. Push this repository to GitHub and ensure the deployment branch contains `render.yaml`.
2. In Render, create a **Blueprint** from the repository and choose its root directory.
3. The Blueprint defines one Docker web service named `vouchlock-demo-sonesh`. If that service name is unavailable in Render, choose another unique name in Render and update the Blueprint name before creating it.
4. When Render asks for secret values, supply:
   - `DATABASE_URL`: the Neon pooled connection string.
   - `NEBIUS_API_KEY`: the server-side Nebius Token Factory key.
5. Render generates `JWT_SECRET` and `ENCRYPTION_SECRET`. Do not replace these with values from a local `.env` file.
6. Create the service. On startup, the container applies Drizzle migrations and then starts Fastify. A failed migration stops startup rather than serving an API against an outdated schema.
7. Wait for Render's `/health/ready` check to succeed, then open the generated `https://<service-name>.onrender.com` URL.

The frontend and API share one origin, so the existing HttpOnly session cookie works without cross-site cookie settings or a public API URL in the frontend bundle. Fastify serves Vite's built `apps/web/dist`; `/api/v1/*` and `/mcp/*` continue to reach their API routes, while frontend routes fall back to `index.html`.

## 3. Demo account and first-use checklist

1. Open the deployment URL and create a demo account through the app's signup flow.
2. Create a disposable demo workspace/project and enter non-sensitive sample brief data.
3. Open Workspace & AI Settings and refresh the model catalog. The API key is used only by the server; never paste it into the browser or expose it in a screenshot.
4. Select an actually discovered model, then walk through the Delivery Agent's brief-to-proof workflow. Model calls consume Token Factory credits.
5. Make sure the demo is reachable without payment or a private network, and include concise signup/demo instructions in the hackathon submission.
6. Revisit the URL before the judging window. The free Render service can sleep, and free tiers can change or pause.

## What this demo deployment does not provide

- It does not provision Nebius AI Cloud compute or Nebius Serverless Jobs. The app uses Token Factory for model inference; local jobs remain labeled as local.
- It does not provide an always-on API. Render's free web service sleeps after inactivity and may cold-start when a judge opens the app.
- It does not provide a production backup/restore guarantee for the Neon free project. Export any demo data you need to retain.
- It does not make signup abuse or model-credit usage impossible. Keep rate limits enabled, use disposable demo data, and monitor Token Factory usage.
- It does not make a legal open-source license decision. Confirm the repository license before hackathon submission; the current README describes a founder-controlled license.

## Upgrade path

When real users depend on Vouchlock, move the API to an always-on service, configure database backups and monitoring, establish an email-verification/password-recovery flow, and review encrypted BYOK storage for multi-instance deployments. Keep the Render/Neon free setup as a demo environment rather than treating it as production hosting.

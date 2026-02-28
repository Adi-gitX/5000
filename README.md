# Survival Cash Engine - Complete Working Prototype

Production-oriented prototype product with:
- orchestration backend (Node + TypeScript + SQLite)
- small frontend control panel
- model routing (OpenClaw/OpenAI/Anthropic with fallback)
- webhook contracts for replies and payments
- n8n and Make dispatch integration
- automated job scheduler with conservative compliance limits

## What You Get
- Fully runnable app at `http://localhost:8787`
- Dashboard to manage settings, leads, jobs, metrics, logs
- Endpoints to integrate email/reply/payment workflows
- Launch governance docs (cutover, monitoring, rollback)

## Project Structure
- `src/`: backend API + job engine + model router
- `public/`: frontend dashboard (no build step)
- `scripts/`: local gate, webhook replay, clasp deploy helper
- `docs/`: setup, cutover, rollback, week-1 ops
  - `docs/PROTOTYPE_ARCHITECTURE.md`
  - `docs/N8N_MAKE_INTEGRATION.md`
  - `docs/MODEL_ROUTER.md`
- `apps-script/`: Google Apps Script implementation (legacy/alternate path)

## Quick Start (Local)
1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Run app:
   - `npm run dev`
4. Open dashboard:
   - `http://localhost:8787`
5. Run local launch gate:
   - `./scripts/run_local_gate.sh`

## Docker + n8n
1. Ensure `.env` exists.
2. Start stack:
   - `docker compose up --build`
3. App:
   - `http://localhost:8787`
4. n8n:
   - `http://localhost:5678`

## Core API Endpoints
- `GET /api/health`
- `GET /api/settings`, `PUT /api/settings`
- `GET /api/leads`, `POST /api/leads`
- `POST /api/lead-intake`, `POST /api/lead-intake/bulk`, `POST /api/lead-intake/promote`
- `POST /api/jobs/:jobName` (`prospecting|outreach|followups|reply-triage|digest`)
- `POST /api/webhooks/reply`
- `POST /api/webhooks/stripe`
- `POST /api/integrations/dispatch`
- `POST /api/agent/generate`

## Required Webhook Contracts
- Reply webhook: `reply_id, email, body, received_at, message_id`
- Stripe webhook: `webhook_token, event_id, payment_id, amount, status`
- Response contract: `{ ok, status_code, duplicate?, error? }`

## Automation Safety Defaults
- `DRY_RUN=TRUE` until cutover complete
- `MAX_SENDS_PER_HOUR=20`
- `WARMUP_DAILY_LIMIT=80`
- quiet-hours guard with timezone fallback
- terminal suppression statuses:
  - `suppressed_optout`
  - `suppressed_bounce`

## Launch Docs
- Setup: `docs/SETUP_RUNBOOK.md`
- Cutover gate: `docs/PROD_CUTOVER_CHECKLIST.md`
- Monitoring + rollback: `docs/LAUNCH_MONITORING_ROLLBACK.md`
- Week-1 operations: `docs/WEEK1_OPS_PLAYBOOK.md`
- Baseline artifacts: `docs/BASELINE_ARTIFACTS.md`
- Release notes: `docs/RELEASE_NOTES_v0.1.md`

## Helper Scripts
- `./scripts/run_local_gate.sh`
- `./scripts/smoke_api.sh`
- `WEBAPP_URL='https://script.google.com/.../exec' ./scripts/replay_webhooks.sh`
- `SCRIPT_ID='AKfycb...' ./scripts/deploy_with_clasp.sh`

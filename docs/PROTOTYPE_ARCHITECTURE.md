# Prototype Architecture

## Components
1. `Frontend`
- Static dashboard (`public/`) served by backend.
- Controls settings, leads, jobs, and integrations.

2. `Backend API`
- Express + TypeScript (`src/`).
- SQLite persistence (`better-sqlite3`).
- Endpoints for webhooks, jobs, dispatch, and metrics.

3. `Automation Engine`
- Job runners:
  - `runDailyProspectingBatch`
  - `runOutreachBatch`
  - `runFollowUpBatch`
  - `runReplyTriage`
  - `runPipelineDigest`
- Scheduler via `node-cron`.

4. `Model Router`
- Provider chain (default): `openclaw -> openai -> anthropic`.
- Falls back automatically and logs attempts.

5. `Integration Layer`
- Event fan-out to `N8N_WEBHOOK_URL` and/or `MAKE_WEBHOOK_URL`.
- Event payload: `{ event_name, payload }`.

## Data Model
- `lead_intake`
- `leads`
- `outreach_log`
- `replies_inbox`
- `deals`
- `payments`
- `delivery`
- `settings`
- `job_runs`

## Production Behavior
- Conservative send controls (hourly + daily caps)
- Quiet-hours blocking by timezone
- Terminal suppression states for opt-out/bounce
- Idempotent reply/payment webhook handling

## Deployment Modes
1. Local Dev: `npm run dev`
2. Docker + n8n: `docker compose up --build`
3. Optional Apps Script alternate path (`apps-script/`)

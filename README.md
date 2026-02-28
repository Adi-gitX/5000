# Survival Cash Engine - Production Automation App

Full working automation app for lead reactivation, reply triage, booking, deposit tracking, onboarding triggers, and operator control via `/agents`.

## Runtime
- Node.js + TypeScript API worker
- SQLite operational store (with production safety controls and idempotent webhooks)
- Signed workflow dispatch to n8n/Make with retry queue
- Model routing with provider circuit breaker (OpenClaw -> OpenAI -> Anthropic -> deterministic fallback)
- Admin control center at `/agents` with session auth + CSRF

## Routes
- Main dashboard: `/`
- Agents control center: `/agents`
- API health: `GET /api/health`
- Strict webhooks:
  - `POST /exec?route=reply-hook`
  - `POST /exec?route=stripe-webhook`
- Legacy webhooks:
  - `POST /api/webhooks/reply`
  - `POST /api/webhooks/stripe`
  - `POST /api/webhooks/workflow-callback`

## `/api/agents` APIs
- `POST /api/agents/session/login`
- `POST /api/agents/session/logout`
- `GET /api/agents/session/me`
- `GET /api/agents/overview`
- `GET /api/agents/connectors`
- `POST /api/agents/connectors/test/:name`
- `GET /api/agents/jobs`
- `POST /api/agents/jobs/:jobKey/run`
- `POST /api/agents/jobs/:jobKey/pause`
- `POST /api/agents/manual-tasks`
- `PATCH /api/agents/manual-tasks/:id`

## Quick Start
1. `npm install`
2. `cp .env.example .env`
3. Configure required keys in `.env` and/or dashboard settings.
4. `npm run dev`
5. Open [http://localhost:8787](http://localhost:8787)
6. Run local gate: `./scripts/run_local_gate.sh`

## Settings Keys (Required for Production)
- `OPERATOR_EMAIL`
- `CALENDLY_LINK`
- `STRIPE_DEPOSIT_LINK`
- `STRIPE_WEBHOOK_TOKEN`
- `ADMIN_BOOTSTRAP_TOKEN`
- `WEBHOOK_SIGNING_SECRET`
- `DRY_RUN`
- `MAX_SENDS_PER_HOUR`
- `WARMUP_DAILY_LIMIT`
- `QUIET_HOURS_START`
- `QUIET_HOURS_END`
- `DEFAULT_OWNER_TZ`
- `OPENCLAW_BASE_URL`
- `OPENCLAW_API_KEY`
- `OPENAI_API_KEY`
- `N8N_WEBHOOK_BASE` (or `N8N_WEBHOOK_URL`)

## Deploy (Managed Cloud)
- Render config: `render.yaml`
- CI pipeline: `.github/workflows/ci.yml`
- Runbooks:
  - `docs/SETUP_RUNBOOK.md`
  - `docs/PROD_CUTOVER_CHECKLIST.md`
  - `docs/LAUNCH_MONITORING_ROLLBACK.md`
  - `docs/WEEK1_OPS_PLAYBOOK.md`

## Pinned OSS Submodules
- `vendor/openclaw` @ `f0c86039`
- `vendor/n8n-nodes-starter` @ `2e9e5c61`

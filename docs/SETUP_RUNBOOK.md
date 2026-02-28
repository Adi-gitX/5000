# Setup Runbook (Production App)

## 1) Local Boot
1. `cp .env.example .env`
2. Fill required keys:
   - `OPERATOR_EMAIL`
   - `ADMIN_BOOTSTRAP_TOKEN`
   - `CALENDLY_LINK`
   - `STRIPE_DEPOSIT_LINK`
   - `STRIPE_WEBHOOK_TOKEN`
   - `WEBHOOK_SIGNING_SECRET`
3. Install dependencies: `npm install`
4. Start service: `npm run dev`
5. Open:
   - Dashboard: `http://localhost:8787`
   - Agents control center: `http://localhost:8787/agents`

## 2) Configure Safety Defaults
Confirm in settings:
- `DRY_RUN=TRUE`
- `MAX_SENDS_PER_HOUR=20`
- `WARMUP_DAILY_LIMIT=80`
- `QUIET_HOURS_START=20`
- `QUIET_HOURS_END=08`
- `DEFAULT_OWNER_TZ=America/New_York`

## 3) Configure Integrations
- Workflow automation:
  - `N8N_WEBHOOK_BASE` or `N8N_WEBHOOK_URL`
  - optional `MAKE_WEBHOOK_URL`
- Model providers:
  - `OPENCLAW_API_KEY`
  - `OPENAI_API_KEY`
- Email delivery:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`
- Optional observability:
  - `SENTRY_DSN`
  - `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`

## 4) Validate with Local Gate
Run:
- `./scripts/run_local_gate.sh`

Then run smoke checks:
- `POST /api/jobs/smoke-checks`

## 5) Verify Webhooks
Strict ingress:
- `POST /exec?route=reply-hook`
- `POST /exec?route=stripe-webhook`

Required response contract:
- `{ ok, status_code, duplicate?, error? }`

## 6) Validate `/agents` Control Center
1. Login via `/agents` using `ADMIN_BOOTSTRAP_TOKEN`.
2. Run connector tests for Stripe, Calendly, Gmail, n8n, OpenClaw/OpenAI.
3. Run/pause jobs from Jobs panel.
4. Create and patch manual setup tasks.

## 7) Production Cutover
1. Complete `docs/PROD_CUTOVER_CHECKLIST.md`.
2. Keep `DRY_RUN=TRUE` until all gate checks pass.
3. Set `DRY_RUN=FALSE`.
4. Launch controlled wave.
5. Monitor first 2 hours with `docs/LAUNCH_MONITORING_ROLLBACK.md`.

## 8) Managed Cloud Deploy
- Render blueprint: `render.yaml`
- CI: `.github/workflows/ci.yml`
- After deploy, verify:
  - `/api/health`
  - `/agents` login
  - webhook endpoints
  - scheduled workflow drain (`workflow-dispatch`)

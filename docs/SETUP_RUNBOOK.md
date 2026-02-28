# Setup Runbook (Prototype Product)

## 1) Local Boot
1. `cp .env.example .env`
2. Fill required keys in `.env`:
   - `OPERATOR_EMAIL`
   - `CALENDLY_LINK`
   - `STRIPE_DEPOSIT_LINK`
   - `STRIPE_WEBHOOK_TOKEN`
3. Install dependencies: `npm install`
4. Start app: `npm run dev`
5. Open dashboard: `http://localhost:8787`

## 2) Configure Settings in UI
In dashboard Settings, verify conservative defaults:
- `DRY_RUN=TRUE`
- `MAX_SENDS_PER_HOUR=20`
- `WARMUP_DAILY_LIMIT=80`
- `QUIET_HOURS_START=20`
- `QUIET_HOURS_END=08`
- `DEFAULT_OWNER_TZ=America/New_York`

Add optional integrations:
- `N8N_WEBHOOK_URL`
- `MAKE_WEBHOOK_URL`
- SMTP config (`SMTP_*`) for real sending
- model provider keys for OpenClaw/OpenAI/Anthropic

## 3) Validate Locally
Run:
- `./scripts/run_local_gate.sh`

Then in dashboard:
1. Insert sample intake rows.
2. Click `Promote Intake to Leads`.
3. Trigger jobs in order:
   - `Run Prospecting Batch`
   - `Run Outreach Batch`
   - `Run Reply Triage`
4. Verify logs and metrics update.

## 4) Connect n8n / Make
### n8n
- Start n8n (`docker compose up`) or hosted n8n.
- Build workflows that receive `{event_name, payload}`.
- Set `N8N_WEBHOOK_URL` in settings.

### Make
- Create webhook scenario.
- Set `MAKE_WEBHOOK_URL` in settings.

Use dispatch test from dashboard (`Integration Dispatch Test`) to validate both.

## 5) Webhook Contracts
### Reply webhook
`POST /api/webhooks/reply`
Required JSON fields:
- `reply_id`
- `email`
- `body`
- `received_at`
- `message_id`

### Stripe webhook
`POST /api/webhooks/stripe`
Required JSON fields:
- `webhook_token`
- `event_id`
- `payment_id`
- `amount`
- `status`

Both return:
- `ok`
- `status_code`
- optional `duplicate`
- optional `error`

## 6) Production Cutover
1. Complete `docs/PROD_CUTOVER_CHECKLIST.md`.
2. Set `DRY_RUN=FALSE`.
3. Start controlled wave and monitor first 2 hours.
4. Follow `docs/LAUNCH_MONITORING_ROLLBACK.md` for pause/rollback.

## 7) Optional Apps Script Path
If you want Google Apps Script deployment as alternate backend, use:
- `apps-script/Code.gs`
- `apps-script/appsscript.json`
- `./scripts/deploy_with_clasp.sh`

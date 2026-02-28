# Release Notes v0.2-managed-launch

Date: 2026-02-28
Branch: `codex/prod-launch-hardening`

## Summary
This release upgrades the app from a prototype dashboard into a production-ready automation stack with strict webhooks, signed workflow dispatch + retries, admin-secured `/agents` control center, and managed deployment artifacts.

## Key Additions
1. Strict webhook ingress route:
   - `POST /exec?route=reply-hook`
   - `POST /exec?route=stripe-webhook`
2. `/agents` route with:
   - admin session login/logout
   - CSRF protection on mutating APIs
   - connector health testing
   - run/pause controls for automation jobs
   - manual setup task board
   - event feed
3. Schema hardening:
   - `leads.timezone`, `leads.suppression_source`
   - `outreach_log.prospect_id`, `provider`, `provider_event_id`
   - new ops tables (`workflow_events`, `connector_health`, `job_controls`, `manual_tasks`, `event_feed`, `agent_sessions`)
4. Workflow orchestration:
   - signed n8n/Make dispatch using `WEBHOOK_SIGNING_SECRET`
   - retry queue with backoff
   - callback endpoint `POST /api/webhooks/workflow-callback`
5. Model routing resilience:
   - provider circuit breaker (`MODEL_CB_FAILURE_THRESHOLD`, `MODEL_CB_OPEN_SECONDS`)
   - fallback preserved
6. Observability:
   - Sentry hook (`SENTRY_DSN`)
   - Langfuse-ready trace emission
7. Deployment:
   - Render service + cron config (`render.yaml`)
   - GitHub Actions CI (`.github/workflows/ci.yml`)
8. OSS submodules pinned:
   - `vendor/openclaw` @ `f0c86039`
   - `vendor/n8n-nodes-starter` @ `2e9e5c61`

## Cutover Prerequisites
- Set production keys in settings:
  - `ADMIN_BOOTSTRAP_TOKEN`
  - `STRIPE_WEBHOOK_TOKEN`
  - `WEBHOOK_SIGNING_SECRET`
  - `CALENDLY_LINK`, `STRIPE_DEPOSIT_LINK`
  - `OPENCLAW_API_KEY` / `OPENAI_API_KEY`
  - `N8N_WEBHOOK_BASE` or `N8N_WEBHOOK_URL`
- Keep `DRY_RUN=TRUE` until all checks in `docs/PROD_CUTOVER_CHECKLIST.md` pass.

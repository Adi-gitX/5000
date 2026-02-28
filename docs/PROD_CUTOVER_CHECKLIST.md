# Production Cutover Checklist

All checks below must pass before `DRY_RUN=FALSE`.

## A) Core Validation
- [ ] `./scripts/run_local_gate.sh` passes
- [ ] `POST /api/jobs/smoke-checks` reports `failed=0`
- [ ] 5-row dry-run renders correct personalization
- [ ] `outreach_log` shows `delivery_status`, `message_id`, `provider`
- [ ] invalid email maps to `suppressed_bounce` with `error_code`

## B) Suppression & Compliance
- [ ] positive reply clears follow-up scheduling
- [ ] opt-out reply sets:
  - `status=suppressed_optout`
  - `optout_at` populated
  - `do_not_contact_reason=user_optout`
- [ ] suppressed rows are never re-sent
- [ ] quiet-hours guard blocks sends in configured windows

## C) Webhook Contracts
- [ ] `/exec?route=reply-hook` rejects missing required fields
- [ ] `/exec?route=stripe-webhook` rejects missing required fields
- [ ] duplicate `reply_id` returns `duplicate=true`
- [ ] duplicate `event_id` returns `duplicate=true`
- [ ] `/api/webhooks/workflow-callback` signature check passes with valid secret

## D) Agents Control Center
- [ ] `/agents` loads and can authenticate with `ADMIN_BOOTSTRAP_TOKEN`
- [ ] Connector tests run for Stripe, Calendly, Gmail, n8n, OpenClaw/OpenAI
- [ ] Jobs panel can run and pause automation jobs
- [ ] Manual tasks can be created and patched

## E) Integrations
- [ ] n8n signed dispatch test succeeds (if configured)
- [ ] Make signed dispatch test succeeds (if configured)
- [ ] workflow retry queue drains via `workflow-dispatch` job
- [ ] SMTP sending succeeds or DRY_RUN mode intentionally retained

## F) KPI and Operations
- [ ] digest job runs and includes sends/replies/cash totals
- [ ] hourly and daily caps enforce expected throttling
- [ ] scheduler executes jobs on cadence

## G) Go-Live Action
- [ ] set `DRY_RUN=FALSE`
- [ ] run first controlled outreach wave
- [ ] monitor first 2 hours for failures and invalid transitions

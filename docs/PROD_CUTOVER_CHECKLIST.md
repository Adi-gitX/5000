# Production Cutover Checklist

All checks below must pass before `DRY_RUN=FALSE`.

## A) Core Validation
- [ ] `./scripts/run_local_gate.sh` passes
- [ ] 5-row dry-run renders correct personalization
- [ ] `outreach_log` shows `delivery_status` and `message_id`
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
- [ ] `/api/webhooks/reply` rejects missing required fields
- [ ] `/api/webhooks/stripe` rejects missing required fields
- [ ] duplicate `reply_id` returns `duplicate=true`
- [ ] duplicate `event_id` returns `duplicate=true`

## D) Integrations
- [ ] n8n dispatch test succeeds (if configured)
- [ ] Make dispatch test succeeds (if configured)
- [ ] SMTP sending succeeds or DRY_RUN mode intentionally retained

## E) KPI and Operations
- [ ] digest job runs and includes sends/replies/cash totals
- [ ] hourly and daily caps enforce expected throttling
- [ ] scheduler executes jobs on cadence

## F) Go-Live Action
- [ ] set `DRY_RUN=FALSE`
- [ ] run first controlled outreach wave
- [ ] monitor first 2 hours for failures and invalid transitions

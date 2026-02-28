# Production Cutover Checklist

All checks below must pass before `DRY_RUN=FALSE`.

## A) Core Validation
- [ ] `runSmokeChecks()` returns zero failures
- [ ] 5-row dry-run renders correct personalization
- [ ] `outreach_log` receives `delivery_status` and `message_id`
- [ ] invalid email maps to `suppressed_bounce` and `error_code`

## B) Suppression & Compliance
- [ ] positive reply stops follow-up (`next_touch_at` cleared)
- [ ] opt-out reply sets:
  - `status=suppressed_optout`
  - `optout_at` populated
  - `do_not_contact_reason=user_optout`
- [ ] suppressed rows are skipped by outreach jobs
- [ ] quiet-hours logic blocks sends in configured window

## C) Webhook Contracts
- [ ] `/exec?route=reply-hook` rejects missing required fields
- [ ] `/exec?route=stripe-webhook` rejects missing required fields
- [ ] duplicate `reply_id` handled idempotently
- [ ] duplicate `event_id` handled idempotently

## D) KPI and Operations
- [ ] `runPipelineDigest()` sends operator email successfully
- [ ] daily and hourly caps produce expected throttling
- [ ] trigger set exists for all scheduled jobs

## E) Go-Live Action
- [ ] set `DRY_RUN=FALSE`
- [ ] run first controlled wave
- [ ] monitor first 2 hours of logs for send errors and suppression behavior

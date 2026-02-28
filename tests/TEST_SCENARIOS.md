# Test Scenarios

These checks map directly to the hardened production plan.

## 1) Outbound Dry-Run Rendering (5 records)
- Set `DRY_RUN=TRUE`.
- Load 5 records into `lead_intake` and run `runDailyProspectingBatch()`.
- Run `runOutreachBatch()`.
- Verify in `outreach_log`:
  - 5 `step_1` rows
  - placeholders resolved
  - `delivery_status` populated (`dry_run`)
  - `message_id` populated

## 2) Follow-up Suppression on Positive Reply
- Post valid `reply-hook` payload with positive text.
- Run `runReplyTriage()`.
- Verify:
  - `prospects.status=positive_reply`
  - `prospects.next_touch_at` is blank
  - no follow-up send for this prospect

## 3) Opt-Out Suppression Persistence
- Post valid `reply-hook` payload containing opt-out phrase.
- Verify in `prospects`:
  - `status=suppressed_optout`
  - `optout_at` populated
  - `do_not_contact_reason=user_optout`
- Run outreach jobs and confirm zero sends for this prospect.

## 4) Bounce/Invalid Handling
- Add `ready` prospect with malformed email.
- Run `runOutreachBatch()`.
- Verify:
  - `status=suppressed_bounce`
  - `last_error=invalid_email_format`
  - `outreach_log.error_code=invalid_email_format`

## 5) Stripe Idempotency
- Send same Stripe payload twice with same `event_id`.
- Verify:
  - first call appends payment row
  - second returns `duplicate=true`
  - no duplicate `payments` row

## 6) Reply-Hook Idempotency
- Send same reply payload twice with same `reply_id`.
- Verify second response has `duplicate=true`.

## 7) Hourly and Daily Cap Enforcement
- Set `MAX_SENDS_PER_HOUR=2` and `WARMUP_DAILY_LIMIT=3`.
- With 10 ready leads, run outreach repeatedly.
- Verify no more than 2 sends/hour and 3 sends/day.

## 8) Quiet-Hours Block
- Set quiet window to cover current test hour.
- Run outreach.
- Verify no outbound rows appended.

## 9) Digest KPI Accuracy
- Set `OPERATOR_EMAIL`.
- Run `runPipelineDigest()`.
- Verify email includes sends, replies, deposits, and cash total.

## 10) Webhook Required-Field Rejection
- Omit required keys in webhook payloads.
- Verify API returns `ok=false` with `status_code=400`.

# Setup Runbook

## 1) Create Base Assets
1. Create one Google Sheet.
2. Add Apps Script project via Extensions -> Apps Script.
3. Copy in:
   - `apps-script/Code.gs`
   - `apps-script/appsscript.json`
4. Save and authorize.

## 2) Initialize Sheets
Run `setupSystem()` once.

It creates:
- `prospects`
- `outreach_log`
- `deals`
- `payments`
- `delivery`
- `settings`
- `lead_intake`
- `replies_inbox`

## 3) Configure Settings
Update values in `settings` sheet.

Required at launch:
- `OPERATOR_EMAIL`
- `CALENDLY_LINK`
- `STRIPE_DEPOSIT_LINK`
- `STRIPE_WEBHOOK_TOKEN`
- `DRY_RUN` (keep `TRUE` through validation)

Conservative defaults (already seeded):
- `MAX_SENDS_PER_HOUR=20`
- `WARMUP_DAILY_LIMIT=80`
- `QUIET_HOURS_START=20`
- `QUIET_HOURS_END=08`
- `DEFAULT_OWNER_TZ=America/New_York`
- `PIVOT_REPLY_RATE_FLOOR=0.01`

## 4) Schema Notes
### `prospects`
Includes safety fields:
- `optout_at`
- `do_not_contact_reason`
- `last_error`

### `outreach_log`
Includes delivery telemetry:
- `delivery_status`
- `error_code`
- `message_id`

### Suppression statuses
- `suppressed_optout`
- `suppressed_bounce`

Suppressed rows are excluded from all outreach jobs.

## 5) Seed and Promote Leads
1. Paste prospects into `lead_intake`.
2. Required intake fields:
   - `business_name`
   - `email`
3. Run `runDailyProspectingBatch()`.
4. Confirm new rows in `prospects` with `status=ready`.

## 6) Validate Before Live Send
1. Keep `DRY_RUN=TRUE`.
2. Run:
   - `runOutreachBatch()`
   - `runFollowUpBatch()`
   - `runReplyTriage()`
   - `runSmokeChecks()`
3. Verify in `outreach_log`:
   - `delivery_status` populated
   - `message_id` populated
   - errors mapped to `error_code`
4. Execute scenarios in `tests/TEST_SCENARIOS.md`.

## 7) Create Triggers
Run `createOrResetTriggers()`.

Created schedule:
- `runDailyProspectingBatch`: every 6 hours
- `runOutreachBatch`: hourly
- `runFollowUpBatch`: hourly
- `runReplyTriage`: hourly
- `runPipelineDigest`: daily at 9 PM script timezone

## 8) Deploy Web App + Webhooks
1. Apps Script -> Deploy -> New deployment -> Web app.
2. Execute as: your account.
3. Access: anyone with link (or restricted behind relay).

Use query-based routes:
- `https://script.google.com/.../exec?route=stripe-webhook`
- `https://script.google.com/.../exec?route=reply-hook`

### Stripe webhook required JSON keys
- `webhook_token`
- `event_id`
- `payment_id`
- `amount`
- `status`

### Reply webhook required JSON keys
- `reply_id`
- `email`
- `body`
- `received_at`
- `message_id`

Both endpoints return JSON with:
- `ok`
- `status_code`
- optional `duplicate`
- optional `error`

## 9) Production Cutover
1. Complete `docs/PROD_CUTOVER_CHECKLIST.md`.
2. Set `DRY_RUN=FALSE`.
3. Run first controlled wave and monitor digest.

## 10) Known Constraints
- Gmail does not provide reliable open-rate telemetry by default.
- LinkedIn DM send remains manual by design; use templates in `templates/`.
- Stripe signature header verification is not native in this script; secure relay + token gate is used.

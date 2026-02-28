# 72-Hour Survival Cash Engine

A deployable Google Sheets + Google Apps Script system to run:
- lead intake and dedupe
- cold outreach and timed follow-ups
- reply triage with suppression handling
- Stripe payment webhook ingestion with idempotency
- onboarding task creation
- daily pipeline digest

This implementation is configured for a compliant conservative launch profile.

## Stack
- CRM/data: Google Sheets
- Automation: Google Apps Script
- Messaging: Gmail + LinkedIn (manual DM execution)
- Payments: Stripe payment links + webhook relay
- Scheduling: Calendly link in templates

## What Is Included
- `apps-script/Code.gs`: full automation logic and guardrails
- `apps-script/appsscript.json`: Apps Script manifest and scopes
- `docs/SETUP_RUNBOOK.md`: deployment, cutover, and webhook contract
- `docs/72H_EXECUTION_CHECKLIST.md`: first 72-hour operating checklist
- `docs/WEEK1_OPS_PLAYBOOK.md`: day-by-day week-1 cadence
- `docs/PROD_CUTOVER_CHECKLIST.md`: dry-run to production cutover gate
- `docs/LAUNCH_MONITORING_ROLLBACK.md`: pause criteria, recovery, rollback flow
- `docs/RELEASE_NOTES_v0.1.md`: launch candidate release notes and contracts
- `docs/BASELINE_ARTIFACTS.md`: frozen artifact list and checksums
- `docs/OFFER_ONE_PAGER.md`: one-page offer spec
- `docs/SALES_CALL_SCRIPT.md`: close script for calls
- `tests/TEST_SCENARIOS.md`: acceptance checks mapped to plan
- `templates/`: outreach templates and webhook payload examples
- `scripts/run_local_gate.sh`: local launch gate checks
- `scripts/replay_webhooks.sh`: sample webhook replay against deployed web app
- `scripts/deploy_with_clasp.sh`: optional scripted push/deploy for Apps Script

## Core Functions
- `runDailyProspectingBatch()`
- `runOutreachBatch()`
- `runFollowUpBatch()`
- `runReplyTriage()`
- `runPipelineDigest()`
- `doPost()` with routes: `stripe-webhook`, `reply-hook`

## Key Hardening Implemented
- suppression statuses:
  - `suppressed_optout`
  - `suppressed_bounce`
- schema extensions:
  - `prospects`: `optout_at`, `do_not_contact_reason`, `last_error`
  - `outreach_log`: `delivery_status`, `error_code`, `message_id`
  - `settings`: `MAX_SENDS_PER_HOUR`, `WARMUP_DAILY_LIMIT`, `QUIET_HOURS_START`, `QUIET_HOURS_END`, `DEFAULT_OWNER_TZ`
- strict webhook required fields and JSON response contract with `status_code`
- per-hour and warmup daily send limit enforcement
- quiet-hours send guard (default US Eastern)

## Quick Start
1. Create a Google Sheet named `Survival Cash Engine`.
2. Open Extensions -> Apps Script and paste:
   - `apps-script/Code.gs`
   - `apps-script/appsscript.json`
3. Run `setupSystem()` once.
4. Fill `settings` sheet values:
   - `OPERATOR_EMAIL`
   - `CALENDLY_LINK`
   - `STRIPE_DEPOSIT_LINK`
   - `STRIPE_WEBHOOK_TOKEN`
   - keep `DRY_RUN=TRUE` for validation
5. Run `createOrResetTriggers()`.
6. Load leads into `lead_intake`, then run `runDailyProspectingBatch()`.
7. Run local gate script: `./scripts/run_local_gate.sh`.
8. Validate with `runSmokeChecks()` and test scenarios in `tests/TEST_SCENARIOS.md`.
9. Deploy as web app and configure relay routes:
   - `.../exec?route=stripe-webhook`
   - `.../exec?route=reply-hook`
10. Switch `DRY_RUN` to `FALSE` only after cutover checklist passes.
11. Optional endpoint sanity check:
    - `WEBAPP_URL='https://script.google.com/.../exec' ./scripts/replay_webhooks.sh`
12. Optional scripted Apps Script push:
    - `SCRIPT_ID='AKfycb...' ./scripts/deploy_with_clasp.sh`

Detailed setup is in `docs/SETUP_RUNBOOK.md`.

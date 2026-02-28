# Test Scenarios (Production Gate)

## 1) Outbound Dry-Run Rendering + Logging Completeness
- Set `DRY_RUN=TRUE`.
- Insert 5 intake rows and run:
  - `runDailyProspectingBatch()`
  - `runOutreachBatch()`
- Verify `outreach_log` rows include:
  - `delivery_status`
  - `message_id`
  - `provider`
  - `provider_event_id`

## 2) Positive Reply Suppresses Follow-Ups
- Post valid payload to `POST /exec?route=reply-hook` with positive text.
- Verify lead transitions to `positive_reply`.
- Verify `next_touch_at` is cleared and no follow-up is sent.

## 3) Opt-Out Terminal Suppression
- Post opt-out payload (`stop`, `unsubscribe`, etc).
- Verify:
  - `status=suppressed_optout`
  - `optout_at` populated
  - `do_not_contact_reason=user_optout`
  - `suppression_source=reply`
- Verify outreach jobs never re-queue this lead.

## 4) Bounce / Invalid Email Terminal Suppression
- Insert `ready` lead with malformed email.
- Run outreach.
- Verify:
  - `status=suppressed_bounce`
  - `last_error=invalid_email_format`
  - `suppression_source=validation`

## 5) Stripe Idempotency
- Send same stripe payload twice to `POST /exec?route=stripe-webhook`.
- Verify second response has `duplicate=true`.
- Verify only one row in `payments` for that `event_id`.

## 6) Reply Idempotency
- Send same reply payload twice to `POST /exec?route=reply-hook`.
- Verify second response has `duplicate=true`.

## 7) Webhook Required Fields
- Omit required fields for reply and stripe payloads.
- Verify `status_code=400` and `ok=false`.

## 8) Hourly + Daily Send Caps
- Configure `MAX_SENDS_PER_HOUR=2`, `WARMUP_DAILY_LIMIT=3`.
- Run outreach with >10 eligible leads.
- Verify caps are enforced in `outreach_log`.

## 9) Quiet-Hours Enforcement
- Configure quiet window covering current lead timezone hour.
- Run outreach.
- Verify sends are skipped.

## 10) Workflow Dispatch Retry Queue
- Configure unreachable n8n URL.
- Trigger `dispatchAutomationEvent`.
- Verify `workflow_events.status=retry`.
- Fix endpoint and run `POST /api/jobs/workflow-dispatch`.
- Verify event transitions to `sent` or `completed`.

## 11) `/agents` Session + CSRF Protection
- Login with `POST /api/agents/session/login`.
- Use returned CSRF token for mutating `/api/agents/*`.
- Verify mutating request without CSRF returns `403`.

## 12) KPI Digest Accuracy
- Run `runPipelineDigest()`.
- Verify digest totals reconcile with:
  - `leads`
  - `outreach_log`
  - `payments`

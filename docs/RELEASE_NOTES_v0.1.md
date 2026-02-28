# Release Notes - v0.1-launch-candidate

## Release Metadata
- Version tag: `v0.1-launch-candidate`
- Baseline commit: `ba4c885c2b1eb836341655f7543370ecdf9bdd78`
- Release date: `2026-02-28`
- Branch for hardening work: `codex/prod-launch-hardening`

## Scope
This release establishes the first production-ready candidate of the Survival Cash Engine with conservative safety defaults.

## Public Interface Contracts

### Sheets
- `prospects`:
  - `id, business_name, niche, city, website, email, linkedin_url, pain_signal, status, last_touch_at, next_touch_at, owner, optout_at, do_not_contact_reason, last_error`
- `outreach_log`:
  - `prospect_id, step, channel, subject, message, sent_at, reply_class, delivery_status, error_code, message_id`
- `settings` keys required for operation:
  - `OPERATOR_EMAIL, CALENDLY_LINK, STRIPE_DEPOSIT_LINK, STRIPE_WEBHOOK_TOKEN, DRY_RUN, MAX_SENDS_PER_HOUR, WARMUP_DAILY_LIMIT, QUIET_HOURS_START, QUIET_HOURS_END, DEFAULT_OWNER_TZ`

### Webhooks
- `POST /exec?route=reply-hook` requires:
  - `reply_id, email, body, received_at, message_id`
- `POST /exec?route=stripe-webhook` requires:
  - `webhook_token, event_id, payment_id, amount, status`
- Response contract for both endpoints:
  - `{ ok, status_code, duplicate?, error? }`

### Status Model
- active states:
  - `ready, followup_1_due, followup_2_due, completed_outreach, positive_reply, neutral_reply, negative_reply, hold, closed_won, closed_lost`
- terminal suppression states:
  - `suppressed_optout, suppressed_bounce`

## Safety and Compliance Defaults
- `DRY_RUN=TRUE` before cutover.
- `MAX_SENDS_PER_HOUR=20`.
- `WARMUP_DAILY_LIMIT=80`.
- Quiet hours enforced with default timezone fallback `America/New_York`.
- Opt-out and bounce statuses are excluded from outreach jobs.

## Cutover Prerequisites
- All checklist items in `docs/PROD_CUTOVER_CHECKLIST.md` pass.
- Webhook relay is configured and validated against template payloads.
- Operator receives digest email successfully.
- `DRY_RUN` is set to `FALSE` only after gate completion.

## Known Constraints
- Google Apps Script deployment, trigger creation, and live webhook tests require Google account context and cannot be completed solely from local shell automation.

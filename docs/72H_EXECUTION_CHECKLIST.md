# 72-Hour Execution Checklist (Conservative Profile)

## Hour 0-6
- [ ] Publish offer one-pager
- [ ] Create Stripe links (deposit + full)
- [ ] Configure Calendly 15-min fit check
- [ ] Deploy Apps Script and run `setupSystem()`
- [ ] Set required `settings` values
- [ ] Keep `DRY_RUN=TRUE`

## Hour 6-12
- [ ] Load first 150 high-quality leads into `lead_intake`
- [ ] Run `runDailyProspectingBatch()`
- [ ] Run dry-run send test for 5 rows
- [ ] Verify message rendering and log telemetry (`delivery_status`, `message_id`)

## Hour 12-24
- [ ] Set `DRY_RUN=FALSE` only after passing `docs/PROD_CUTOVER_CHECKLIST.md`
- [ ] Launch controlled outbound wave
- [ ] Respect `MAX_SENDS_PER_HOUR` and `WARMUP_DAILY_LIMIT`
- [ ] Send first LinkedIn DM batch manually from template

## Hour 24-36
- [ ] Verify follow-up cadence only targets non-suppressed records
- [ ] Triage inbound replies with `runReplyTriage()`
- [ ] Prioritize positive replies for calls within 2 hours

## Hour 36-60
- [ ] Run all booked calls using fixed script
- [ ] Collect deposits on call via Stripe link
- [ ] Verify webhook ingestion and idempotency in `payments`
- [ ] Confirm onboarding rows created in `delivery`

## Hour 60-72
- [ ] Deliver first workflows to paid clients
- [ ] Capture quick-win proof and request referral intro
- [ ] Run second wave for warm leads
- [ ] Review 9 PM digest and confirm collected cash total

# 72-Hour Execution Checklist (Prototype Product)

## Hour 0-6
- [ ] Configure `.env` and launch app + dashboard
- [ ] Connect Stripe deposit link and Calendly link
- [ ] Keep `DRY_RUN=TRUE`
- [ ] Validate with `./scripts/run_local_gate.sh`

## Hour 6-12
- [ ] Insert first 150 qualified leads via bulk intake
- [ ] Promote intake to active leads
- [ ] Run dry-run outreach and verify logs

## Hour 12-24
- [ ] Complete cutover checklist
- [ ] Set `DRY_RUN=FALSE`
- [ ] Run first controlled wave within caps
- [ ] Dispatch integration test to n8n/Make

## Hour 24-36
- [ ] Run followups and reply triage on schedule
- [ ] Route positive replies to booking + payment flow
- [ ] Confirm opt-outs and bounces stay suppressed

## Hour 36-60
- [ ] Close calls with one-package script
- [ ] Confirm payment webhook ingestion and delivery row creation
- [ ] Track real-time cash in metrics panel

## Hour 60-72
- [ ] Deploy second wave to warm leads
- [ ] Capture quick-win evidence for referrals
- [ ] Review digest + conversion metrics and adjust targeting

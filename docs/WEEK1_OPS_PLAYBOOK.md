# Week-1 Operations Playbook

## Daily Rhythm (Days 1-7)
- 09:00: review overnight replies and update `deals.stage`
- 10:00: load and promote fresh leads via `runDailyProspectingBatch()`
- 11:00-17:00: run calls, collect deposits, trigger onboarding
- 18:00: list hygiene and invalid/suppression review
- 21:00: review digest and set next-day wave size

## Daily Guardrails
- keep within `MAX_SENDS_PER_HOUR`
- keep within `WARMUP_DAILY_LIMIT`
- never remove suppression statuses from opt-outs/bounces
- do not send during quiet-hours window

## 48-Hour Decision Rule
Evaluate after every 150 sends:
- if positive reply rate < 1%, pivot next batch niche to roofing/HVAC
- if >= 1%, keep med spa/dental and improve list quality

## KPI Targets
- positive reply rate >= 1%
- time-to-first-response for positives <= 2 hours
- call-to-deposit close rate >= 30%
- data integrity: 100% payment rows with unique `stripe_event_id`

## Failure Escalation
- repeated send errors: pause live sends and inspect `error_code`
- webhook failures: route to fallback endpoint and replay payload
- digest missing: run `runPipelineDigest()` manually and verify `OPERATOR_EMAIL`

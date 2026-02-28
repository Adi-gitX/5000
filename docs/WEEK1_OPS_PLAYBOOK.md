# Week-1 Operations Playbook

## Daily Cadence
- 09:00: check `/agents` overview (replies, deals, suppression, connector status)
- 10:00: load new leads and run prospecting promotion
- 11:00-17:00: calls, deposits, onboarding transitions
- 18:00: clean invalid leads and enrich top prospects
- 21:00: run digest and set next-day send volume

## Hard Guardrails
- Respect `MAX_SENDS_PER_HOUR` and `WARMUP_DAILY_LIMIT`
- Keep quiet-hours enabled
- Never unsuppress opt-outs
- Keep all payment events idempotent by `event_id`
- Keep workflow retry queue healthy (`workflow_events.retry` should trend down)

## 48-Hour Pivot Rule
After every 150 sends:
- if positive reply rate < 1%, pivot next segment to roofing/HVAC
- otherwise continue med spa/dental with better lead quality

## KPI Targets
- positive reply rate >= 1%
- response time for positive replies <= 2 hours
- call-to-deposit rate >= 30%
- payment dedupe integrity = 100%

## Incident Path
- pause threshold: >10% send failures in rolling 1-hour window
- immediate action: set `DRY_RUN=TRUE`
- follow `docs/LAUNCH_MONITORING_ROLLBACK.md`

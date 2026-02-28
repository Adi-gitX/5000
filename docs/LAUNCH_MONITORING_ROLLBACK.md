# Launch Monitoring and Rollback Playbook

## Monitoring Window
- Start: immediately after switching `DRY_RUN=FALSE`
- Intensive watch: first 2 hours
- Stabilization watch: first 24 hours

## Metrics to Monitor
- send failure rate by `outreach_log.error_code`
- new suppression count (`suppressed_optout`, `suppressed_bounce`)
- webhook duplicate rates (`duplicate=true` on reply/payment endpoints)
- workflow dispatch retry growth (`workflow_events.status=retry`)
- digest receipt status in operator inbox
- payment row integrity (`stripe_event_id` uniqueness)

## Alert Thresholds (Pause Criteria)
- send failures > 10% in any rolling 1-hour window
- repeated webhook 5xx responses
- unexpected state transitions (suppressed rows receiving outreach)
- payment duplicates with distinct `stripe_event_id` collisions

## Immediate Pause Procedure
1. Set `DRY_RUN=TRUE` in `settings`.
2. Pause outreach jobs from `/agents` only:
   - `runOutreachBatch`
   - `runFollowUpBatch`
3. Keep these active:
   - `runReplyTriage`
   - `workflow-dispatch`
   - `runPipelineDigest`
   - payment webhook endpoint
4. Capture evidence snapshot:
   - copy last 100 rows from `outreach_log`
   - copy last 50 rows from `payments`
   - store exact timestamp and observed symptoms

## Rollback Procedure
1. Confirm baseline target:
   - tag `v0.1-launch-candidate` (legacy fallback)
   - latest stable commit from `docs/RELEASE_NOTES_v0.2.md`
2. Compare current deployed runtime with baseline checksums from `docs/BASELINE_ARTIFACTS.md`.
3. If regression confirmed:
   - restore script content from baseline tag
   - redeploy web app
   - rerun cutover checks in `docs/PROD_CUTOVER_CHECKLIST.md` with `DRY_RUN=TRUE`
4. Re-enable outreach triggers only after gate passes.

## Recovery Resume Criteria
- send error rate below 3% for two consecutive hourly checks
- no invalid suppressed-state transitions in last 200 processed rows
- webhook endpoints returning stable 2xx without unexplained duplicates
- digest is delivered and KPI totals reconcile with sheets

## Post-Incident Notes
Record:
- incident start/end timestamps
- root cause
- corrective action
- prevention action in code/process/docs

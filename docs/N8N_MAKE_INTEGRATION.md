# n8n and Make Integration Guide (Signed + Retry)

## Dispatch Model
All automation events are queued in `workflow_events` and dispatched with HMAC signing.

Headers sent:
- `x-event-id`
- `x-webhook-timestamp`
- `x-webhook-signature` (SHA256 HMAC over `timestamp.body`)

Signing key:
- `WEBHOOK_SIGNING_SECRET`

## Event Envelope
```json
{
  "event_id": "WF-...",
  "event_name": "payment_received",
  "occurred_at": "2026-02-28T18:00:00.000Z",
  "payload": {
    "payment_id": "pi_...",
    "deal_id": "DL-..."
  }
}
```

## n8n Setup
1. Build webhook workflow(s) in n8n.
2. Set either:
   - `N8N_WEBHOOK_URL` (single endpoint), or
   - `N8N_WEBHOOK_BASE` (event-specific route suffixes).
3. Verify signature in first node using `WEBHOOK_SIGNING_SECRET`.
4. Return 2xx quickly; long work should continue asynchronously in n8n.

## Make Setup
1. Configure custom webhook scenario.
2. Set `MAKE_WEBHOOK_URL`.
3. Verify HMAC signature before state-changing actions.

## Retry Behavior
- Failed dispatches are marked `retry`.
- Retry backoff is exponential up to 30 minutes.
- Queue drain job:
  - scheduler: every 15 minutes
  - manual trigger: `POST /api/jobs/workflow-dispatch`

## Callback
Workflows can report terminal status back to:
- `POST /api/webhooks/workflow-callback`

Payload:
```json
{
  "event_id": "WF-...",
  "status": "completed",
  "details": "onboarding package sent"
}
```

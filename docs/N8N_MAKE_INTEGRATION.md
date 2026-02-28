# n8n and Make Integration Guide

This prototype emits automation events to both platforms when URLs are configured.

## Event Envelope
All outbound dispatches use:

```json
{
  "event_name": "positive_reply",
  "payload": {
    "lead_id": "PR-...",
    "email": "owner@example.com"
  }
}
```

## Configure n8n
1. Create a Webhook trigger node (POST).
2. Copy webhook production URL.
3. Set `N8N_WEBHOOK_URL` in settings/UI.
4. Add routing by `event_name` in n8n workflow.

Suggested events:
- `positive_reply`
- `payment_received`
- `manual_test`

## Configure Make
1. Create Custom Webhook in Make.
2. Copy webhook URL.
3. Set `MAKE_WEBHOOK_URL` in settings/UI.
4. Route by `event_name` in scenario.

## Validation
From dashboard:
- Use `Integration Dispatch Test`.

From API:

```bash
curl -X POST http://localhost:8787/api/integrations/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"event_name":"manual_test","payload":{"source":"cli"}}'
```

## Idempotency Advice
- Use `event_name + payload.payment_id` or `event_name + payload.lead_id + timestamp` as dedupe keys in n8n/Make.
- Do not trigger billing actions without checking duplicate event IDs.

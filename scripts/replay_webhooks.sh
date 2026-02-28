#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${WEBAPP_URL:-}" ]]; then
  echo "Usage: WEBAPP_URL='https://script.google.com/.../exec' ./scripts/replay_webhooks.sh" >&2
  exit 1
fi

reply_url="${WEBAPP_URL}?route=reply-hook"
stripe_url="${WEBAPP_URL}?route=stripe-webhook"

echo "Posting sample reply payload to: $reply_url"
curl -sS -X POST "$reply_url" \
  -H 'Content-Type: application/json' \
  --data @templates/webhook_reply_payload.json

echo "\nPosting sample stripe payload to: $stripe_url"
curl -sS -X POST "$stripe_url" \
  -H 'Content-Type: application/json' \
  --data @templates/webhook_stripe_payload.json

echo "\nWebhook sample replay complete"

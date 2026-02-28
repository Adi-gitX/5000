#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npm run -s build >/dev/null

npm run -s start >/tmp/survival-cash-engine-smoke.log 2>&1 &
SERVER_PID=$!

cleanup() {
  if ps -p "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in {1..30}; do
  if curl -sS http://localhost:8787/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

curl -sS http://localhost:8787/api/health >/dev/null

LEAD_ID=$(curl -sS -X POST http://localhost:8787/api/leads \
  -H 'Content-Type: application/json' \
  -d '{"business_name":"Smoke Clinic","email":"owner@smokeclinic.com","niche":"dental","city":"Dallas"}' \
  | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));if(!d.ok){process.exit(1)};process.stdout.write(d.data.lead_id)")

sleep 1
curl -sS -X POST http://localhost:8787/api/jobs/outreach >/dev/null

curl -sS -X POST http://localhost:8787/api/webhooks/reply \
  -H 'Content-Type: application/json' \
  -d "{\"reply_id\":\"rp_smoke_1\",\"prospect_id\":\"$LEAD_ID\",\"email\":\"owner@smokeclinic.com\",\"body\":\"Interested\",\"received_at\":\"2026-02-28T14:10:00Z\",\"message_id\":\"msg_smoke_1\"}" >/dev/null

curl -sS -X POST http://localhost:8787/api/webhooks/stripe \
  -H 'Content-Type: application/json' \
  -d "{\"webhook_token\":\"smoke\",\"event_id\":\"evt_smoke_1\",\"payment_id\":\"pi_smoke_1\",\"amount\":1050,\"status\":\"paid\",\"prospect_id\":\"$LEAD_ID\"}" >/dev/null

curl -sS http://localhost:8787/api/metrics \
  | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));if(!d.ok){process.exit(1)};if(Number(d.data.cashCollected)<1050){console.error('Cash not updated');process.exit(1)};console.log('Smoke API test passed')"

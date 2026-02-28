#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

pass() {
  echo "[PASS] $1"
}

echo "Running local launch gate checks..."

node --check --input-type=commonjs < apps-script/Code.gs || fail "Code.gs syntax check failed"
pass "Code.gs syntax check"

required_files=(
  "apps-script/Code.gs"
  "apps-script/appsscript.json"
  "docs/SETUP_RUNBOOK.md"
  "docs/PROD_CUTOVER_CHECKLIST.md"
  "docs/LAUNCH_MONITORING_ROLLBACK.md"
  "docs/RELEASE_NOTES_v0.1.md"
  "docs/BASELINE_ARTIFACTS.md"
  "tests/TEST_SCENARIOS.md"
  "templates/webhook_reply_payload.json"
  "templates/webhook_stripe_payload.json"
)

for f in "${required_files[@]}"; do
  [[ -f "$f" ]] || fail "Missing required file: $f"
done
pass "Required file presence"

node - <<'NODE'
const fs = require('fs');

const reply = JSON.parse(fs.readFileSync('templates/webhook_reply_payload.json', 'utf8'));
const stripe = JSON.parse(fs.readFileSync('templates/webhook_stripe_payload.json', 'utf8'));

const replyRequired = ['reply_id', 'email', 'body', 'received_at', 'message_id'];
const stripeRequired = ['webhook_token', 'event_id', 'payment_id', 'amount', 'status'];

const missingReply = replyRequired.filter((key) => !Object.prototype.hasOwnProperty.call(reply, key));
const missingStripe = stripeRequired.filter((key) => !Object.prototype.hasOwnProperty.call(stripe, key));

if (missingReply.length) {
  throw new Error('Missing reply payload keys: ' + missingReply.join(', '));
}
if (missingStripe.length) {
  throw new Error('Missing stripe payload keys: ' + missingStripe.join(', '));
}

console.log('[PASS] Webhook template payload keys');
NODE

grep -q "v0.1-launch-candidate" docs/BASELINE_ARTIFACTS.md || fail "Baseline tag not documented"
pass "Baseline manifest tag presence"

grep -q "ba4c885c2b1eb836341655f7543370ecdf9bdd78" docs/RELEASE_NOTES_v0.1.md || fail "Release notes commit hash mismatch"
pass "Release notes commit hash"

cat <<'TXT'
[MANUAL CHECKS REQUIRED]
- Run setupSystem(), createOrResetTriggers(), and runSmokeChecks() in Google Apps Script UI.
- Validate webhook endpoints with relay against /exec?route=reply-hook and /exec?route=stripe-webhook.
- Execute docs/PROD_CUTOVER_CHECKLIST.md before setting DRY_RUN=FALSE.
TXT

pass "Local launch gate complete"

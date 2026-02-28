#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v clasp >/dev/null 2>&1; then
  echo "clasp is not installed. Install with: npm i -g @google/clasp" >&2
  exit 1
fi

if [[ ! -f "apps-script/.clasp.json" ]]; then
  if [[ -z "${SCRIPT_ID:-}" ]]; then
    echo "Set SCRIPT_ID or create apps-script/.clasp.json manually." >&2
    echo "Example: SCRIPT_ID='AKfycb...' ./scripts/deploy_with_clasp.sh" >&2
    exit 1
  fi

  cat > apps-script/.clasp.json <<JSON
{
  "scriptId": "${SCRIPT_ID}",
  "rootDir": "apps-script"
}
JSON
fi

echo "Pushing Apps Script project..."
clasp push --force

echo "Current deployments:"
clasp deployments || true

echo "Done. If needed, deploy web app via Apps Script UI or: clasp deploy --description 'prod launch'."

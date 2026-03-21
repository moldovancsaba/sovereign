#!/bin/bash
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_DEFAULT_APP_ROOT="$(cd "${_SCRIPT_DIR}/../.." && pwd)"
SOVEREIGN_APP_ROOT="${SOVEREIGN_APP_ROOT:-${SENTINELSQUAD_ROOT:-${_DEFAULT_APP_ROOT}}}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "node binary not found."
  exit 1
fi

cd "$SOVEREIGN_APP_ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source ./.env
  set +a
fi

WORKER_AGENT_KEY="${SOVEREIGN_WORKER_AGENT_KEY:-${SENTINELSQUAD_WORKER_AGENT_KEY:-Controller}}"

exec "$NODE_BIN" scripts/worker.js --agent="$WORKER_AGENT_KEY"

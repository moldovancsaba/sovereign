#!/bin/bash
set -euo pipefail

SENTINELSQUAD_ROOT="${SENTINELSQUAD_ROOT:-/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
LSOF_BIN="/usr/sbin/lsof"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "node binary not found."
  exit 1
fi

cd "$SENTINELSQUAD_ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source ./.env
  set +a
fi

WORKER_AGENT_KEY="${SENTINELSQUAD_WORKER_AGENT_KEY:-Controller}"

if [[ -x "$LSOF_BIN" ]]; then
  : # keep shellcheck quiet for portable future expansion
fi

exec "$NODE_BIN" scripts/worker.js --agent="$WORKER_AGENT_KEY"

#!/bin/bash
set -euo pipefail

LABELS=(
  "com.sentinelsquad.ollama"
  "com.sentinelsquad.app"
)

for label in "${LABELS[@]}"; do
  echo "=================================="
  echo "$label"
  TMP_FILE="$(mktemp /tmp/nexus-launchctl-status.XXXXXX)"
  if launchctl print "gui/$UID/$label" >"$TMP_FILE" 2>&1; then
    grep -E "state =|pid =|last exit code =" "$TMP_FILE" || true
    echo "status: loaded"
  else
    echo "status: not loaded"
    sed -n '1,2p' "$TMP_FILE"
  fi
  rm -f "$TMP_FILE"
  echo
done

echo "=================================="
echo "SentinelSquad services"
echo "status: auxiliary MCP bridge remains on-demand via Roo MCP settings"

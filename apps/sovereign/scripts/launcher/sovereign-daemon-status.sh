#!/bin/bash
set -euo pipefail

LABELS=(
  "com.sovereign.ollama"
  "com.sovereign.app"
  "com.sovereign.worker"
  "com.sentinelsquad.ollama"
  "com.sentinelsquad.app"
  "com.sentinelsquad.worker"
)

for label in "${LABELS[@]}"; do
  echo "--- $label ---"
  launchctl print "gui/$UID/$label" 2>&1 | head -20 || echo "(not loaded)"
  echo
done

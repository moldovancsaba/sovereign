#!/bin/bash
set -euo pipefail

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLISTS=(
  "$LAUNCH_AGENTS_DIR/com.sovereign.ollama.plist"
  "$LAUNCH_AGENTS_DIR/com.sovereign.app.plist"
  "$LAUNCH_AGENTS_DIR/com.sovereign.worker.plist"
  "$LAUNCH_AGENTS_DIR/com.sentinelsquad.ollama.plist"
  "$LAUNCH_AGENTS_DIR/com.sentinelsquad.app.plist"
  "$LAUNCH_AGENTS_DIR/com.sentinelsquad.worker.plist"
)
LABELS=(
  "com.sovereign.ollama"
  "com.sovereign.app"
  "com.sovereign.worker"
  "com.sentinelsquad.ollama"
  "com.sentinelsquad.app"
  "com.sentinelsquad.worker"
)

for label in "${LABELS[@]}"; do
  launchctl bootout "gui/$UID/$label" >/dev/null 2>&1 || true
done

for plist in "${PLISTS[@]}"; do
  rm -f "$plist"
done

rm -f "$LAUNCH_AGENTS_DIR/com.mvpfactory.ollama.plist" "$LAUNCH_AGENTS_DIR/com.mvpfactory.sentinelsquad.plist"

echo "Uninstalled {sovereign} and legacy SentinelSquad LaunchAgents."

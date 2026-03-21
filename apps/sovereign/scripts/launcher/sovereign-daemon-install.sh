#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOVEREIGN_APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$SOVEREIGN_APP_ROOT/.sovereign/daemon-logs"
mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"
chmod +x "$SCRIPT_DIR/sovereign-daemon.sh" "$SCRIPT_DIR/ollama-daemon.sh" "$SCRIPT_DIR/sovereign-worker-daemon.sh"

NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
OLLAMA_BIN="${OLLAMA_BIN:-$(command -v ollama || true)}"
LSOF_BIN="/usr/sbin/lsof"
CURL_BIN="/usr/bin/curl"
PKILL_BIN="/usr/bin/pkill"
APP_PORT="${SOVEREIGN_APP_PORT:-${SENTINELSQUAD_APP_PORT:-3007}}"
APP_URL="${SOVEREIGN_APP_URL:-${SENTINELSQUAD_APP_URL:-http://127.0.0.1:${APP_PORT}}}"
SIGNIN_PATH="${SOVEREIGN_SIGNIN_PATH:-${SENTINELSQUAD_SIGNIN_PATH:-/signin}}"

if [[ -z "$NPM_BIN" || -z "$NODE_BIN" || -z "$OLLAMA_BIN" ]]; then
  echo "Missing required binary. npm=$NPM_BIN node=$NODE_BIN ollama=$OLLAMA_BIN"
  exit 1
fi

PLIST_OLLAMA="$LAUNCH_AGENTS_DIR/com.sovereign.ollama.plist"
PLIST_APP="$LAUNCH_AGENTS_DIR/com.sovereign.app.plist"
PLIST_WORKER="$LAUNCH_AGENTS_DIR/com.sovereign.worker.plist"
PLIST_MCP_LEGACY="$LAUNCH_AGENTS_DIR/com.mvpfactory.nexus-mcp.plist"

cat > "$PLIST_OLLAMA" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sovereign.ollama</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SCRIPT_DIR/ollama-daemon.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OLLAMA_BIN</key><string>$OLLAMA_BIN</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/ollama.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/ollama.err.log</string>
</dict>
</plist>
PLIST

cat > "$PLIST_WORKER" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sovereign.worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SCRIPT_DIR/sovereign-worker-daemon.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SOVEREIGN_APP_ROOT</key><string>$SOVEREIGN_APP_ROOT</string>
    <key>SENTINELSQUAD_ROOT</key><string>$SOVEREIGN_APP_ROOT</string>
    <key>NODE_BIN</key><string>$NODE_BIN</string>
    <key>SOVEREIGN_WORKER_AGENT_KEY</key><string>${SOVEREIGN_WORKER_AGENT_KEY:-${SENTINELSQUAD_WORKER_AGENT_KEY:-Controller}}</string>
    <key>SENTINELSQUAD_WORKER_AGENT_KEY</key><string>${SOVEREIGN_WORKER_AGENT_KEY:-${SENTINELSQUAD_WORKER_AGENT_KEY:-Controller}}</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key><string>$SOVEREIGN_APP_ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/worker.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/worker.err.log</string>
</dict>
</plist>
PLIST

cat > "$PLIST_APP" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sovereign.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SCRIPT_DIR/sovereign-daemon.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SOVEREIGN_APP_ROOT</key><string>$SOVEREIGN_APP_ROOT</string>
    <key>SENTINELSQUAD_ROOT</key><string>$SOVEREIGN_APP_ROOT</string>
    <key>NPM_BIN</key><string>$NPM_BIN</string>
    <key>SOVEREIGN_LAUNCH_MODE</key><string>${SOVEREIGN_LAUNCH_MODE:-${SENTINELSQUAD_LAUNCH_MODE:-dev}}</string>
    <key>SENTINELSQUAD_LAUNCH_MODE</key><string>${SOVEREIGN_LAUNCH_MODE:-${SENTINELSQUAD_LAUNCH_MODE:-dev}}</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key><string>$SOVEREIGN_APP_ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/app.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/app.err.log</string>
</dict>
</plist>
PLIST

if [[ -x "$LSOF_BIN" ]]; then
  pids="$($LSOF_BIN -t -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      kill "$pid" >/dev/null 2>&1 || true
    done <<< "$pids"
    sleep 1
  fi
fi

if [[ -x "$PKILL_BIN" ]]; then
  "$PKILL_BIN" -f "${SOVEREIGN_APP_ROOT}/scripts/worker.js" >/dev/null 2>&1 || true
  sleep 1
fi

for label in com.sovereign.ollama com.sovereign.app com.sovereign.worker \
  com.sentinelsquad.ollama com.sentinelsquad.app com.sentinelsquad.worker \
  com.mvpfactory.ollama com.mvpfactory.sentinelsquad com.mvpfactory.nexus-mcp; do
  launchctl bootout "gui/$UID/$label" >/dev/null 2>&1 || true
done
rm -f "$PLIST_MCP_LEGACY"

bootstrap_label() {
  local label="$1"
  local plist="$2"
  if launchctl bootstrap "gui/$UID" "$plist" >/dev/null 2>&1; then
    return 0
  fi
  sleep 1
  if launchctl bootstrap "gui/$UID" "$plist" >/dev/null 2>&1; then
    return 0
  fi
  if launchctl print "gui/$UID/$label" >/dev/null 2>&1; then
    return 0
  fi
  echo "Failed to bootstrap $label from $plist"
  return 1
}

bootstrap_label "com.sovereign.ollama" "$PLIST_OLLAMA"
bootstrap_label "com.sovereign.app" "$PLIST_APP"
bootstrap_label "com.sovereign.worker" "$PLIST_WORKER"

launchctl enable "gui/$UID/com.sovereign.ollama"
launchctl enable "gui/$UID/com.sovereign.app"
launchctl enable "gui/$UID/com.sovereign.worker"

launchctl kickstart -k "gui/$UID/com.sovereign.ollama"
launchctl kickstart -k "gui/$UID/com.sovereign.app"
launchctl kickstart -k "gui/$UID/com.sovereign.worker"

wait_for_health() {
  local url="$1"
  local max_tries="$2"
  local i=1
  while [[ "$i" -le "$max_tries" ]]; do
    if "$CURL_BIN" -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

if ! wait_for_health "http://127.0.0.1:11434/api/tags" 20; then
  echo "Warning: Ollama did not pass health check in 20s."
fi

if ! wait_for_health "${APP_URL%/}${SIGNIN_PATH}" 60; then
  echo "Warning: {sovereign} app did not pass health check (${APP_URL%/}${SIGNIN_PATH}) in 60s."
fi

echo "Installed and started LaunchAgents:"
echo "- com.sovereign.ollama"
echo "- com.sovereign.app"
echo "- com.sovereign.worker"
echo "Logs: $LOG_DIR"
echo "Note: MCP bridge is on-demand from Roo MCP settings (no launchd daemon)."

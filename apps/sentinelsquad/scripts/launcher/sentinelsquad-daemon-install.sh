#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SENTINELSQUAD_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$SENTINELSQUAD_ROOT/.sentinelsquad/daemon-logs"
mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
OLLAMA_BIN="${OLLAMA_BIN:-$(command -v ollama || true)}"
LSOF_BIN="/usr/sbin/lsof"
CURL_BIN="/usr/bin/curl"
SENTINELSQUAD_APP_PORT="${SENTINELSQUAD_APP_PORT:-3007}"
SENTINELSQUAD_APP_URL="${SENTINELSQUAD_APP_URL:-http://127.0.0.1:${SENTINELSQUAD_APP_PORT}}"
SENTINELSQUAD_SIGNIN_PATH="${SENTINELSQUAD_SIGNIN_PATH:-/signin}"

if [[ -z "$NPM_BIN" || -z "$OLLAMA_BIN" ]]; then
  echo "Missing required binary. npm=$NPM_BIN ollama=$OLLAMA_BIN"
  exit 1
fi

PLIST_OLLAMA="$LAUNCH_AGENTS_DIR/com.sentinelsquad.ollama.plist"
PLIST_SENTINELSQUAD="$LAUNCH_AGENTS_DIR/com.sentinelsquad.app.plist"
PLIST_MCP_LEGACY="$LAUNCH_AGENTS_DIR/com.mvpfactory.nexus-mcp.plist"

cat > "$PLIST_OLLAMA" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sentinelsquad.ollama</string>
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

cat > "$PLIST_SENTINELSQUAD" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sentinelsquad.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SCRIPT_DIR/sentinelsquad-daemon.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SENTINELSQUAD_ROOT</key><string>$SENTINELSQUAD_ROOT</string>
    <key>NPM_BIN</key><string>$NPM_BIN</string>
    <key>SENTINELSQUAD_LAUNCH_MODE</key><string>dev</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key><string>$SENTINELSQUAD_ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/sentinelsquad.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/sentinelsquad.err.log</string>
</dict>
</plist>
PLIST

# Restart behavior: stop any existing listener on the SentinelSquad port first.
if [[ -x "$LSOF_BIN" ]]; then
  pids="$($LSOF_BIN -t -iTCP:"$SENTINELSQUAD_APP_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      kill "$pid" >/dev/null 2>&1 || true
    done <<< "$pids"
    sleep 1
  fi
fi

for label in com.sentinelsquad.ollama com.sentinelsquad.app com.mvpfactory.ollama com.mvpfactory.sentinelsquad com.mvpfactory.nexus-mcp; do
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

bootstrap_label "com.sentinelsquad.ollama" "$PLIST_OLLAMA"
bootstrap_label "com.sentinelsquad.app" "$PLIST_SENTINELSQUAD"

launchctl enable "gui/$UID/com.sentinelsquad.ollama"
launchctl enable "gui/$UID/com.sentinelsquad.app"

launchctl kickstart -k "gui/$UID/com.sentinelsquad.ollama"
launchctl kickstart -k "gui/$UID/com.sentinelsquad.app"

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

if ! wait_for_health "${SENTINELSQUAD_APP_URL%/}${SENTINELSQUAD_SIGNIN_PATH}" 60; then
  echo "Warning: SentinelSquad did not pass health check (${SENTINELSQUAD_APP_URL%/}${SENTINELSQUAD_SIGNIN_PATH}) in 60s."
fi

echo "Installed and started LaunchAgents:"
echo "- com.sentinelsquad.ollama"
echo "- com.sentinelsquad.app"
echo "Logs: $LOG_DIR"
echo "Note: MCP bridge is on-demand from Roo MCP settings (no launchd daemon)."

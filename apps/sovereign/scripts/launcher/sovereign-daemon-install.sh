#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOVEREIGN_APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$SOVEREIGN_APP_ROOT/.sovereign/daemon-logs"
mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"
chmod +x "$SCRIPT_DIR/sovereign-daemon.sh" "$SCRIPT_DIR/ollama-daemon.sh" "$SCRIPT_DIR/nexus-bridge-daemon.sh" "$SCRIPT_DIR/vanguard-daemon.sh"

NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
OLLAMA_BIN="${OLLAMA_BIN:-$(command -v ollama || true)}"
CURL_BIN="/usr/bin/curl"
APP_PORT="${SOVEREIGN_APP_PORT:-3007}"

# Extract Env for Sentinel Oxygen
DOT_ENV="$SOVEREIGN_APP_ROOT/.env"
DISCORD_TOKEN=$(grep "DISCORD_TOKEN=" "$DOT_ENV" | cut -d'=' -f2- || true)
DATABASE_URL=$(grep "DATABASE_URL=" "$DOT_ENV" | cut -d'=' -f2- || true)

PLIST_OLLAMA="$LAUNCH_AGENTS_DIR/com.sovereign.ollama.plist"
PLIST_APP="$LAUNCH_AGENTS_DIR/com.sovereign.app.plist"
PLIST_BRIDGE="$LAUNCH_AGENTS_DIR/com.sovereign.nexus-bridge.plist"
PLIST_VANGUARD="$LAUNCH_AGENTS_DIR/com.sovereign.vanguard.plist"
PLIST_MENUBAR="$LAUNCH_AGENTS_DIR/com.sovereign.menubar.plist"

write_plist() {
  local label="$1"
  local script="$2"
  local log_prefix="$3"
  local plist="$4"
  local extra_env="$5"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>$script</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/${log_prefix}.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/${log_prefix}.err.log</string>
  <key>WorkingDirectory</key><string>$SOVEREIGN_APP_ROOT</string>
  $extra_env
</dict>
</plist>
PLIST
}

ENV_BLOCK="<key>EnvironmentVariables</key><dict><key>DISCORD_TOKEN</key><string>$DISCORD_TOKEN</string><key>DATABASE_URL</key><string>$DATABASE_URL</string></dict>"

write_plist "com.sovereign.ollama" "$SCRIPT_DIR/ollama-daemon.sh" "ollama" "$PLIST_OLLAMA" ""
write_plist "com.sovereign.app" "$SCRIPT_DIR/sovereign-daemon.sh" "app" "$PLIST_APP" ""
write_plist "com.sovereign.nexus-bridge" "$SCRIPT_DIR/nexus-bridge-daemon.sh" "nexus-bridge" "$PLIST_BRIDGE" "$ENV_BLOCK"
write_plist "com.sovereign.vanguard" "$SCRIPT_DIR/vanguard-daemon.sh" "vanguard" "$PLIST_VANGUARD" "$ENV_BLOCK"

# Special plist for the Menubar app
cat > "$PLIST_MENUBAR" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sovereign.menubar</string>
  <key>ProgramArguments</key>
  <array><string>$HOME/Applications/SovereignMenubar.app/Contents/MacOS/SovereignMenubar</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/menubar.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/menubar.err.log</string>
</dict>
</plist>
PLIST

bootstrap_label() {
  local label="$1"
  local plist="$2"
  launchctl bootout "gui/$UID/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID" "$plist" || true
}

bootstrap_label "com.sovereign.ollama" "$PLIST_OLLAMA"
bootstrap_label "com.sovereign.app" "$PLIST_APP"
bootstrap_label "com.sovereign.nexus-bridge" "$PLIST_BRIDGE"
bootstrap_label "com.sovereign.vanguard" "$PLIST_VANGUARD"
bootstrap_label "com.sovereign.menubar" "$PLIST_MENUBAR"

echo "Sentinels Deployed with Oxygen: Ollama, App, Bridge, Vanguard, Menubar."

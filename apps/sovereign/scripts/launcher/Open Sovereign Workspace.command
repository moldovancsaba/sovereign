#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
  SOVEREIGN_APP_ROOT="${SOVEREIGN_APP_ROOT:-${SENTINELSQUAD_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"
  SENTINELSQUAD_ROOT="$SOVEREIGN_APP_ROOT"
else
  echo "Could not locate {sovereign} app root (expected package.json next to this launcher)."
  read -r -p "Press Enter to exit..."
  exit 1
fi

if [[ ! -f "$SOVEREIGN_APP_ROOT/package.json" ]]; then
  echo "Could not locate app root: $SOVEREIGN_APP_ROOT"
  read -r -p "Press Enter to exit..."
  exit 1
fi

REPO_ROOT="$(cd "$SOVEREIGN_APP_ROOT/../.." && pwd)"

OPEN_BIN="/usr/bin/open"
CODIUM_BIN="${CODIUM_BIN:-$(command -v codium || true)}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"

for bin in "$OPEN_BIN" "$PYTHON_BIN"; do
  if [[ -z "$bin" || ! -x "$bin" ]]; then
    echo "Missing required binary: ${bin:-<empty>}"
    read -r -p "Press Enter to exit..."
    exit 1
  fi
done

echo "=========================================="
echo "   SOVEREIGN WORKSPACE LAUNCHER"
echo "=========================================="
echo "Sovereign app: $SOVEREIGN_APP_ROOT"
echo "Repo:    $REPO_ROOT"
echo "------------------------------------------"

cd "$SOVEREIGN_APP_ROOT"

# Ensure MCP settings are present
if [[ -x "scripts/nexus/setup_mcp.sh" ]]; then
  echo "Applying MCP settings..."
  bash "scripts/nexus/setup_mcp.sh" >/dev/null
fi

# Start or restart background daemons so services survive terminal closure.
echo "Restarting managed background services..."
bash "scripts/launcher/sovereign-daemon-install.sh"

# Open VSCodium workspace
if [[ -n "$CODIUM_BIN" && -x "$CODIUM_BIN" ]]; then
  "$CODIUM_BIN" "$REPO_ROOT" >/dev/null 2>&1 || true
else
  # fallback by app bundle if codium is not on PATH
  "$OPEN_BIN" -a "VSCodium" "$REPO_ROOT" >/dev/null 2>&1 || true
fi

# Open primary web entrypoints
"$OPEN_BIN" "http://127.0.0.1:3007/chat" >/dev/null 2>&1 || true
"$OPEN_BIN" "http://127.0.0.1:3007/nexus" >/dev/null 2>&1 || true

echo "Sovereign workspace launch requested."
echo "1) LaunchAgents restarted: Ollama + Sovereign"
echo "2) VSCodium opened on repo"
echo "3) Chat + operations pages opened"
echo ""
echo "In Roo chat, trigger with plain text (MCP is on-demand):"
echo "@Controller run cell: build a secure python cli tool with tests"

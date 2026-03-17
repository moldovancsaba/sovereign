#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_SENTINELSQUAD_ROOT="/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad"
DEFAULT_REPO_ROOT="/Users/moldovancsaba/Projects/sentinelsquad"

if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
  SENTINELSQUAD_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
  SENTINELSQUAD_ROOT="$DEFAULT_SENTINELSQUAD_ROOT"
fi

if [[ ! -f "$SENTINELSQUAD_ROOT/package.json" ]]; then
  echo "Could not locate SentinelSquad root: $SENTINELSQUAD_ROOT"
  read -r -p "Press Enter to exit..."
  exit 1
fi

REPO_ROOT="$(cd "$SENTINELSQUAD_ROOT/../.." && pwd 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT" ]]; then
  REPO_ROOT="$DEFAULT_REPO_ROOT"
fi

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
echo "   SENTINELSQUAD WORKSPACE LAUNCHER"
echo "=========================================="
echo "SentinelSquad: $SENTINELSQUAD_ROOT"
echo "Repo:    $REPO_ROOT"
echo "------------------------------------------"

cd "$SENTINELSQUAD_ROOT"

# Ensure MCP settings are present
if [[ -x "scripts/nexus/setup_mcp.sh" ]]; then
  echo "Applying MCP settings..."
  bash "scripts/nexus/setup_mcp.sh" >/dev/null
fi

# Start or restart background daemons so services survive terminal closure.
echo "Restarting managed background services..."
bash "scripts/launcher/sentinelsquad-daemon-install.sh"

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

echo "SentinelSquad workspace launch requested."
echo "1) LaunchAgents restarted: Ollama + SentinelSquad"
echo "2) VSCodium opened on repo"
echo "3) Chat + squad operations pages opened"
echo ""
echo "In Roo chat, trigger with plain text (MCP is on-demand):"
echo "@Controller run cell: build a secure python cli tool with tests"

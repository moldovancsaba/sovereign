#!/usr/bin/env bash
set -euo pipefail

_SETUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(cd "${_SETUP_DIR}/../../.." && pwd)"
_DEFAULT_APP_ROOT="$(cd "${_SETUP_DIR}/../.." && pwd)"
CHATDEV_PATH="${CHATDEV_PATH:-${_REPO_ROOT}/external/ChatDev}"
SOVEREIGN_PATH="${SOVEREIGN_PATH:-${_DEFAULT_APP_ROOT}}"
BASE_SETTINGS_DIR="$HOME/Library/Application Support/VSCodium/User/globalStorage"
SETTINGS_PATH_CLAUDE_DEV="$BASE_SETTINGS_DIR/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
SETTINGS_PATH_ROO_CLINE="$BASE_SETTINGS_DIR/rooveterinaryinc.roo-cline/settings/mcp_settings.json"
SETTINGS_PATH_ROO_NIGHTLY="$BASE_SETTINGS_DIR/rooveterinaryinc.roo-code-nightly/settings/mcp_settings.json"

MCP_JSON=$(cat <<JSON
{
  "mcpServers": {
    "nexus-orchestrator": {
      "command": "python3",
      "args": ["$SOVEREIGN_PATH/scripts/sovereign_dag/mcp_server_py.py"],
      "env": {
        "CHATDEV_PATH": "$CHATDEV_PATH",
        "OLLAMA_HOST": "http://127.0.0.1:11434",
        "PYTHONPATH": "$SOVEREIGN_PATH"
      },
      "disabled": false
    },
    "local-terminal": {
      "command": "bash",
      "args": ["-c", "cd $SOVEREIGN_PATH && exec $SHELL"],
      "disabled": false
    }
  }
}
JSON
)

write_settings() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  printf "%s\n" "$MCP_JSON" > "$path"
  echo "MCP settings written: $path"
}

write_settings "$SETTINGS_PATH_CLAUDE_DEV"
write_settings "$SETTINGS_PATH_ROO_CLINE"
write_settings "$SETTINGS_PATH_ROO_NIGHTLY"

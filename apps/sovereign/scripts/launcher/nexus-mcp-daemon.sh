#!/bin/bash
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_DEFAULT_APP_ROOT="$(cd "${_SCRIPT_DIR}/../.." && pwd)"
SENTINELSQUAD_ROOT="${SENTINELSQUAD_ROOT:-${_DEFAULT_APP_ROOT}}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"

if [[ -z "$PYTHON_BIN" || ! -x "$PYTHON_BIN" ]]; then
  echo "python3 binary not found."
  exit 1
fi

cd "$SENTINELSQUAD_ROOT"
exec "$PYTHON_BIN" scripts/nexus/mcp_server_py.py

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NEXUS_DIR="$ROOT_DIR/nexus"

check_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    echo "[ok] $name"
  else
    echo "[missing] $name"
    return 1
  fi
}

check_http() {
  local name="$1"
  local url="$2"
  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "[ok] $name $url"
  else
    echo "[warn] $name unreachable at $url"
    return 1
  fi
}

echo "Nexus bootstrap root: $ROOT_DIR"
echo "Nexus config dir: $NEXUS_DIR"

failures=0
check_cmd python3 || failures=$((failures + 1))
check_cmd node || failures=$((failures + 1))
check_cmd npm || failures=$((failures + 1))
check_cmd ollama || failures=$((failures + 1))
check_cmd jq || failures=$((failures + 1))

if ! check_http "ollama" "${OLLAMA_HOST:-http://127.0.0.1:11434}/api/tags"; then
  failures=$((failures + 1))
fi

for file in ChatChainConfig.json PhaseConfig.json benchmarks.json agent_manager.py; do
  if [[ -f "$NEXUS_DIR/$file" ]]; then
    echo "[ok] found $file"
  else
    echo "[missing] $file"
    failures=$((failures + 1))
  fi
done

if [[ "$failures" -gt 0 ]]; then
  echo "Nexus bootstrap result: FAILED ($failures issue(s))"
  exit 1
fi

echo "Nexus bootstrap result: PASS"

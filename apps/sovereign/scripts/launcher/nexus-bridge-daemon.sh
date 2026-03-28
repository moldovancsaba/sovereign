#!/bin/bash
set -euo pipefail
SOVEREIGN_APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$SOVEREIGN_APP_ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
echo "Starting Nexus Bridge Sentinel..."
export DATABASE_URL="$(grep 'DATABASE_URL=' .env | cut -d'=' -f2- | tr -d '\r')"
scripts/sovereign_dag/venv/bin/python3 scripts/sovereign_dag/bridge.py

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"<your task>\""
  exit 1
fi

TASK="$*"
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
python3 scripts/sovereign_dag/cell_runner.py --task "$TASK"

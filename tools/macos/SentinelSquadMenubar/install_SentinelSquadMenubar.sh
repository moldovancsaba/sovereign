#!/usr/bin/env bash
# Deprecated: use SovereignMenubar / npm run menubar:install
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/../SovereignMenubar" && pwd)/install_SovereignMenubar.sh"

#!/usr/bin/env bash
# Deprecated: installs Sovereign.app via the canonical installer.
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/../SovereignDesktop" && pwd)/install_SovereignDesktop.sh"

#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="$REPO_ROOT/apps/sovereign"
BOOTSTRAP_SCRIPT="$APP_ROOT/scripts/launcher/bootstrap-local-dev.sh"
DESKTOP_INSTALL_SCRIPT="$REPO_ROOT/tools/macos/SovereignDesktop/install_SovereignDesktop.sh"

SKIP_DESKTOP_INSTALL="${SKIP_DESKTOP_INSTALL:-0}"
SKIP_START="${SKIP_START:-0}"

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    echo "Hint: $hint"
    exit 1
  fi
}

echo "==> Sovereign macOS installer"
echo "Repo: $REPO_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is intended for macOS only."
  exit 1
fi

require_cmd "bash" "Install a standard shell environment."
require_cmd "node" "Install Node.js 20+ (https://nodejs.org/)."
require_cmd "npm" "Install npm with Node.js."
require_cmd "docker" "Install Docker Desktop and keep it running."
require_cmd "swiftc" "Install Xcode Command Line Tools: xcode-select --install"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start Docker Desktop and rerun."
  exit 1
fi

if [[ ! -x "$BOOTSTRAP_SCRIPT" ]]; then
  echo "Bootstrap script not found or not executable: $BOOTSTRAP_SCRIPT"
  exit 1
fi

echo "==> Installing app dependencies"
npm run install:app --prefix "$REPO_ROOT"

echo "==> Starting local database"
npm run db:up --prefix "$REPO_ROOT"

echo "==> Bootstrapping app (env, prisma, seed, runtime doctor)"
bash "$BOOTSTRAP_SCRIPT"

if [[ "$SKIP_DESKTOP_INSTALL" != "1" ]]; then
  echo "==> Installing Sovereign.app desktop launcher"
  bash "$DESKTOP_INSTALL_SCRIPT"
else
  echo "==> Skipping desktop app install (SKIP_DESKTOP_INSTALL=1)"
fi

if [[ "$SKIP_START" != "1" ]]; then
  echo "==> Starting web app and worker"
  nohup npm run dev --prefix "$REPO_ROOT" >/tmp/sovereign-dev.log 2>&1 &
  nohup npm run worker --prefix "$REPO_ROOT" >/tmp/sovereign-worker.log 2>&1 &
  sleep 2
fi

echo ""
echo "Sovereign install completed."
echo "- App URL: http://127.0.0.1:3007"
echo "- Logs:"
echo "  - /tmp/sovereign-dev.log"
echo "  - /tmp/sovereign-worker.log"
echo ""
echo "Useful commands:"
echo "  npm run service:install      # optional launchd managed daemon"
echo "  npm run service:status"
echo "  npm run service:uninstall"
echo "  npm run db:down"

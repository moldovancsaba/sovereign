#!/usr/bin/env bash

# {sovereign} Docker portability preflight.
# Validates host/container prerequisites before Docker stack startup.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_FILE="$REPO_ROOT/apps/sovereign/.env"
DB_PORT="${SOVEREIGN_DB_PORT:-${SENTINELSQUAD_DB_PORT:-34765}}"
APP_PORT="${SOVEREIGN_APP_PORT:-${SENTINELSQUAD_APP_PORT:-3577}}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "[PASS] $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "[FAIL] $1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo "[WARN] $1"
}

check_required_env_key() {
  local file="$1"
  local key="$2"
  local line value compact
  line="$(grep -E "^${key}=" "$file" | tail -1 || true)"
  if [ -z "$line" ]; then
    fail "Missing required key in apps/sovereign/.env: ${key}. Remediation: copy apps/sovereign/.env.example and set ${key}."
    return
  fi
  value="${line#*=}"
  compact="$(printf "%s" "$value" | tr -d '[:space:]')"
  if [ -z "$compact" ]; then
    fail "Empty required key in apps/sovereign/.env: ${key}. Remediation: set a non-empty value."
    return
  fi
  case "$value" in
    *change-me*|*CHANGE_ME*|*REPLACE_ME*|*replace-me*|*\<*|*\>*)
      warn "Key ${key} looks placeholder-like. Remediation: replace with a real value before runtime use."
      ;;
    *)
      pass "Required env key present: ${key}"
      ;;
  esac
}

check_any_github_token() {
  local file="$1"
  local s line l value compact
  s=0
  for key in SOVEREIGN_GITHUB_TOKEN SENTINELSQUAD_GITHUB_TOKEN; do
    line="$(grep -E "^${key}=" "$file" | tail -1 || true)"
    if [ -z "$line" ]; then
      continue
    fi
    value="${line#*=}"
    compact="$(printf "%s" "$value" | tr -d '[:space:]')"
    if [ -n "$compact" ]; then
      s=1
      pass "GitHub token present (${key})"
      return
    fi
  done
  fail "No non-empty SOVEREIGN_GITHUB_TOKEN or SENTINELSQUAD_GITHUB_TOKEN in apps/sovereign/.env. Remediation: set at least one for board/API features (use a placeholder for local Docker smoke tests)."
}

check_port_listener() {
  local port="$1"
  local label="$2"
  local output
  output="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$output" ]; then
    warn "Host port ${port} (${label}) is already in LISTEN state. Docker stack startup may fail on port bind. Remediation: stop conflicting service or remap ports."
  else
    pass "Host port ${port} (${label}) appears free for bind checks."
  fi
}

echo "{sovereign} Docker portability preflight"
echo "Repo: $REPO_ROOT"
echo

if command -v docker >/dev/null 2>&1; then
  pass "Docker CLI is available."
else
  fail "Docker CLI is missing. Remediation: install Docker Desktop (or compatible Docker runtime) and ensure 'docker' is on PATH."
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    pass "Docker daemon is reachable."
  else
    fail "Docker daemon is not reachable. Remediation: start Docker Desktop (or your Docker daemon) and retry."
  fi

  if docker compose version >/dev/null 2>&1; then
    pass "Docker Compose plugin is available."
  else
    fail "Docker Compose plugin is unavailable. Remediation: install/enable Docker Compose v2 ('docker compose')."
  fi
fi

if [ -f "$COMPOSE_FILE" ]; then
  pass "Compose file exists: docker-compose.yml"
else
  fail "Compose file missing at repository root. Remediation: restore docker-compose.yml."
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && [ -f "$COMPOSE_FILE" ]; then
  if docker compose -f "$COMPOSE_FILE" config -q >/dev/null 2>&1; then
    pass "Compose file parses successfully."
  else
    fail "Compose file failed parse check. Remediation: run 'docker compose -f docker-compose.yml config' and fix validation errors."
  fi
fi

if [ -f "$ENV_FILE" ]; then
  pass "App env file exists: apps/sovereign/.env"
  check_required_env_key "$ENV_FILE" "NEXTAUTH_URL"
  check_required_env_key "$ENV_FILE" "NEXTAUTH_SECRET"
  check_required_env_key "$ENV_FILE" "DATABASE_URL"
  check_any_github_token "$ENV_FILE"
else
  fail "App env file is missing: apps/sovereign/.env. Remediation: copy apps/sovereign/.env.example to apps/sovereign/.env and fill required keys."
fi

if command -v lsof >/dev/null 2>&1; then
  check_port_listener "$DB_PORT" "SOVEREIGN_DB_PORT"
  check_port_listener "$APP_PORT" "SOVEREIGN_APP_PORT"
else
  warn "lsof is unavailable. Port collision checks were skipped."
fi

echo
echo "Summary: pass=${PASS_COUNT} warn=${WARN_COUNT} fail=${FAIL_COUNT}"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "Preflight result: FAIL"
  exit 1
fi

echo "Preflight result: PASS"
exit 0

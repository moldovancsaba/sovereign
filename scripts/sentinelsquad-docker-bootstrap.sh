#!/usr/bin/env bash

# One-command Docker bootstrap for SentinelSquad:
# preflight -> start db -> migrate -> start app -> health verify

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
PREFLIGHT_SCRIPT="$SCRIPT_DIR/sentinelsquad-docker-preflight.sh"

DB_PORT="${SENTINELSQUAD_DB_PORT:-34765}"
APP_PORT="${SENTINELSQUAD_APP_PORT:-3577}"
NEXTAUTH_URL_VALUE="${NEXTAUTH_URL:-http://localhost:${APP_PORT}}"
HEALTH_TIMEOUT_SECONDS="${SENTINELSQUAD_DOCKER_HEALTH_TIMEOUT_SECONDS:-120}"

dc() {
  (
    cd "$REPO_ROOT"
    SENTINELSQUAD_DB_PORT="$DB_PORT" \
    SENTINELSQUAD_APP_PORT="$APP_PORT" \
    NEXTAUTH_URL="$NEXTAUTH_URL_VALUE" \
      docker compose -f "$COMPOSE_FILE" "$@"
  )
}

wait_for_health() {
  local container="$1"
  local timeout="$2"
  local waited=0
  local status=""

  while [ "$waited" -lt "$timeout" ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      echo "[PASS] ${container} health=healthy"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  echo "[FAIL] Timed out waiting for ${container} to become healthy. Last status='${status}'."
  docker logs --tail 80 "$container" >/dev/null 2>&1 && docker logs --tail 80 "$container" || true
  return 1
}

reclaim_port() {
  local port="$1"
  local label="$2"
  local pids=""

  if ! command -v lsof >/dev/null 2>&1; then
    echo "[WARN] lsof unavailable; cannot reclaim busy port ${port} (${label})."
    return 0
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  pids="$(printf "%s\n" "$pids" | sed '/^$/d' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [ -z "$pids" ]; then
    echo "[PASS] Port ${port} (${label}) is free."
    return 0
  fi

  echo "[WARN] Port ${port} (${label}) is busy. Reclaiming listener PID(s): ${pids}"
  # shellcheck disable=SC2086
  kill $pids >/dev/null 2>&1 || true
  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  pids="$(printf "%s\n" "$pids" | sed '/^$/d' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [ -n "$pids" ]; then
    echo "[WARN] Port ${port} still busy after TERM. Sending KILL to PID(s): ${pids}"
    # shellcheck disable=SC2086
    kill -9 $pids >/dev/null 2>&1 || true
    sleep 1
  fi

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[FAIL] Could not reclaim port ${port} (${label})."
    lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
    return 1
  fi

  echo "[PASS] Reclaimed port ${port} (${label})."
  return 0
}

echo "SentinelSquad Docker bootstrap"
echo "Repo: $REPO_ROOT"
echo "Ports: db=$DB_PORT app=$APP_PORT"
echo "NextAuth URL: $NEXTAUTH_URL_VALUE"
echo

if [ ! -x "$PREFLIGHT_SCRIPT" ]; then
  echo "[FAIL] Missing preflight script: $PREFLIGHT_SCRIPT"
  exit 1
fi

"$PREFLIGHT_SCRIPT"
echo

echo "[STEP] Stopping existing SentinelSquad stack (if running)"
dc down --remove-orphans >/dev/null 2>&1 || true
echo "[PASS] Existing stack stopped (or was not running)"
echo

echo "[STEP] Reclaiming configured host ports"
reclaim_port "$DB_PORT" "SENTINELSQUAD_DB_PORT"
reclaim_port "$APP_PORT" "SENTINELSQUAD_APP_PORT"
echo

echo "[STEP] Starting database service"
dc up -d sentinelsquad-db
wait_for_health "sentinelsquad-db" "$HEALTH_TIMEOUT_SECONDS"
echo

echo "[STEP] Applying Prisma migrations (idempotent)"
dc run --rm --no-deps sentinelsquad-app npx prisma migrate deploy
echo "[PASS] Prisma migrations applied"
echo

echo "[STEP] Starting app service"
dc up -d sentinelsquad-app
wait_for_health "sentinelsquad-app" "$HEALTH_TIMEOUT_SECONDS"
echo

echo "[STEP] Verifying app endpoint"
if curl -fsS "http://127.0.0.1:${APP_PORT}/signin" >/dev/null; then
  echo "[PASS] /signin endpoint reachable on host port ${APP_PORT}"
else
  echo "[FAIL] /signin endpoint check failed on host port ${APP_PORT}"
  docker logs --tail 80 sentinelsquad-app || true
  exit 1
fi

echo
echo "[PASS] SentinelSquad Docker bootstrap completed."
echo "Use this to inspect health: docker compose -f docker-compose.yml ps"

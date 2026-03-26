#!/usr/bin/env bash

# Automated Docker portability gate for {sovereign}.
# Validates compose parse + startup + health expectations with concise remediation output.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
PREFLIGHT_SCRIPT="$SCRIPT_DIR/sovereign-docker-preflight.sh"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/sovereign-docker-bootstrap.sh"

DB_PORT="${SOVEREIGN_DB_PORT:-34765}"
APP_PORT="${SOVEREIGN_APP_PORT:-3577}"
NEXTAUTH_URL_VALUE="${NEXTAUTH_URL:-http://localhost:${APP_PORT}}"

dc() {
  (
    cd "$REPO_ROOT"
    SOVEREIGN_DB_PORT="$DB_PORT" \
    SOVEREIGN_APP_PORT="$APP_PORT" \
    NEXTAUTH_URL="$NEXTAUTH_URL_VALUE" \
      docker compose -f "$COMPOSE_FILE" "$@"
  )
}

pass() {
  echo "[PASS] $1"
}

fail() {
  echo "[FAIL] $1"
  exit 1
}

health_status() {
  local container="$1"
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo "missing"
}

assert_health() {
  local container="$1"
  local expected="$2"
  local actual
  actual="$(health_status "$container")"
  if [ "$actual" = "$expected" ]; then
    pass "${container} health=${actual}"
  else
    fail "${container} health expected=${expected}, actual=${actual}. Remediation: inspect container logs and rerun ./scripts/sovereign-docker-bootstrap.sh."
  fi
}

assert_route_status() {
  local path="$1"
  local expected_codes_csv="$2"
  local expected_location_contains="${3:-}"
  local url="http://127.0.0.1:${APP_PORT}${path}"
  local headers
  local status
  local location
  local ok=0

  headers="$(mktemp)"
  if ! status="$(curl -sS -o /dev/null -D "$headers" -w "%{http_code}" "$url")"; then
    rm -f "$headers"
    fail "Route check failed for ${path}. Remediation: inspect app logs and verify Next.js runtime startup."
  fi

  IFS=',' read -r -a expected_codes <<< "$expected_codes_csv"
  for code in "${expected_codes[@]}"; do
    if [ "$status" = "$code" ]; then
      ok=1
      break
    fi
  done

  if [ "$ok" -ne 1 ]; then
    rm -f "$headers"
    fail "Route ${path} returned HTTP ${status}; expected one of [${expected_codes_csv}]. Remediation: inspect docker logs --tail 200 sovereign-app and verify route guards."
  fi

  if [ -n "$expected_location_contains" ]; then
    location="$(
      awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/^location:[[:space:]]*/,"",$0); sub(/\r$/,"",$0); print; exit}' "$headers"
    )"
    if ! printf "%s\n" "$location" | grep -F -q "$expected_location_contains"; then
      rm -f "$headers"
      fail "Route ${path} location header '${location:-<missing>}' does not contain '${expected_location_contains}'. Remediation: verify auth/session redirect policy."
    fi
  fi

  rm -f "$headers"
  pass "Route ${path} status=${status}${expected_location_contains:+, location contains '${expected_location_contains}'}"
}

assert_no_regression_signatures() {
  local logs

  if ! logs="$(docker logs --tail 200 sovereign-app 2>&1)"; then
    fail "Unable to read sovereign-app logs for regression signature checks. Remediation: inspect container status/logging and rerun the gate."
  fi

  if printf "%s\n" "$logs" | grep -F -q "EACCES: permission denied, mkdir '/app/.sovereign'"; then
    fail "Detected known regression signature: EACCES /app/.sovereign write failure. Remediation: verify /app/.sovereign ownership/permissions in Docker image."
  fi

  if printf "%s\n" "$logs" | grep -E -q "ps: bad -o argument 'command'|bad -o argument 'command'"; then
    fail "Detected known regression signature: non-portable ps flag usage. Remediation: use portable process listing (ps -eo pid=,args=)."
  fi

  pass "No known runtime portability regression signatures detected in sovereign-app logs."
}

dump_diagnostics() {
  echo
  echo "---- portability gate diagnostics ----"
  dc ps || true
  echo
  docker logs --tail 200 sovereign-db 2>/dev/null || true
  echo
  docker logs --tail 200 sovereign-app 2>/dev/null || true
  echo "--------------------------------------"
}

cleanup() {
  local exit_code="$1"
  set +e
  if [ "$exit_code" -ne 0 ]; then
    dump_diagnostics
  fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  if [ "$exit_code" -ne 0 ]; then
    echo "[FAIL] {sovereign} Docker portability gate failed."
    echo "Remediation: run ./scripts/sovereign-docker-preflight.sh, then rerun ./scripts/sovereign-docker-bootstrap.sh."
  fi
}

trap 'rc=$?; cleanup "$rc"; exit "$rc"' EXIT

echo "{sovereign} Docker portability gate"
echo "Repo: $REPO_ROOT"
echo "Ports: db=$DB_PORT app=$APP_PORT"
echo "NextAuth URL: $NEXTAUTH_URL_VALUE"
echo

[ -x "$PREFLIGHT_SCRIPT" ] || fail "Missing executable preflight script at scripts/sovereign-docker-preflight.sh."
[ -x "$BOOTSTRAP_SCRIPT" ] || fail "Missing executable bootstrap script at scripts/sovereign-docker-bootstrap.sh."
[ -f "$COMPOSE_FILE" ] || fail "Missing docker-compose.yml at repository root."

echo "[STEP] Preflight checks"
"$PREFLIGHT_SCRIPT"
echo

echo "[STEP] Compose parse check"
dc config -q
pass "docker compose config -q"
echo

echo "[STEP] Bootstrap stack and verify startup path"
"$BOOTSTRAP_SCRIPT"
echo

echo "[STEP] Assert expected healthy conditions"
assert_health "sovereign-db" "healthy"
assert_health "sovereign-app" "healthy"
echo

echo "[STEP] Assert route-level runtime behavior"
# /signin may be served directly (200) or redirected by auth/runtime middleware (3xx).
assert_route_status "/signin" "200,302,303,307,308"
# Depending on auth/runtime mode, protected routes may redirect to /signin or be reachable directly.
assert_route_status "/products" "200,302,303,307,308"
assert_route_status "/agents" "200,302,303,307,308"
echo

echo "[STEP] Assert known runtime regression signatures are absent"
assert_no_regression_signatures
echo

echo "[STEP] Assert expected unhealthy condition probe"
if curl -fsS "http://127.0.0.1:${APP_PORT}/__sovereign_missing_health_probe__" >/dev/null; then
  fail "Unexpected success for invalid endpoint probe. Health gate may be misconfigured."
fi
pass "Invalid endpoint probe failed as expected."
echo

pass "{sovereign} Docker portability gate passed."

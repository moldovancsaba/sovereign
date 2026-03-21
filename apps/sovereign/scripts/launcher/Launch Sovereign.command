#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
  SOVEREIGN_APP_ROOT="${SOVEREIGN_APP_ROOT:-${SENTINELSQUAD_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"
  SENTINELSQUAD_ROOT="$SOVEREIGN_APP_ROOT"
else
  echo "Could not locate {sovereign} app root (expected package.json next to this launcher)."
  read -r -p "Press Enter to exit..."
  exit 1
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
OLLAMA_BIN="${OLLAMA_BIN:-$(command -v ollama || true)}"
OPENCLAW_BIN="${OPENCLAW_BIN:-$(command -v openclaw || true)}"
LSOF_BIN="/usr/sbin/lsof"
CURL_BIN="/usr/bin/curl"
OPEN_BIN="/usr/bin/open"
SLEEP_BIN="/bin/sleep"
PKILL_BIN="/usr/bin/pkill"

for bin in "$NODE_BIN" "$NPM_BIN" "$LSOF_BIN" "$CURL_BIN" "$OPEN_BIN" "$SLEEP_BIN" "$PKILL_BIN"; do
  if [[ -z "$bin" || ! -x "$bin" ]]; then
    echo "Missing required binary: ${bin:-<empty>}"
    read -r -p "Press Enter to exit..."
    exit 1
  fi
done

cd "$SOVEREIGN_APP_ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source ./.env
  set +a
fi

_SOVEREIGN_APP_PORT="${SOVEREIGN_APP_PORT:-${SENTINELSQUAD_APP_PORT:-3007}}"
export SOVEREIGN_APP_PORT="$_SOVEREIGN_APP_PORT"
export SENTINELSQUAD_APP_PORT="$_SOVEREIGN_APP_PORT"
SENTINELSQUAD_APP_URL="${SENTINELSQUAD_APP_URL:-http://127.0.0.1:${_SOVEREIGN_APP_PORT}}"
SENTINELSQUAD_SIGNIN_PATH="${SENTINELSQUAD_SIGNIN_PATH:-/chat}"
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
OPENCLAW_AUTOSTART="${OPENCLAW_AUTOSTART:-0}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
SENTINELSQUAD_WORKER_AUTOSTART="${SENTINELSQUAD_WORKER_AUTOSTART:-1}"
SENTINELSQUAD_WORKER_AGENT_KEY="${SENTINELSQUAD_WORKER_AGENT_KEY:-Controller}"
SENTINELSQUAD_WORKER_RUNTIME="${SENTINELSQUAD_WORKER_RUNTIME:-LOCAL}"
SENTINELSQUAD_WORKER_MODEL="${SENTINELSQUAD_WORKER_MODEL:-Granite-4.0-H-1B}"
SENTINELSQUAD_REQUIRE_AGENTS_ONLINE="${SENTINELSQUAD_REQUIRE_AGENTS_ONLINE:-1}"
SENTINELSQUAD_AGENT_GATE_TIMEOUT_MS="${SENTINELSQUAD_AGENT_GATE_TIMEOUT_MS:-45000}"
SENTINELSQUAD_AGENT_GATE_INTERVAL_MS="${SENTINELSQUAD_AGENT_GATE_INTERVAL_MS:-2000}"
_SOVEREIGN_LAUNCH_MODE="${SOVEREIGN_LAUNCH_MODE:-${SENTINELSQUAD_LAUNCH_MODE:-dev}}"
export SOVEREIGN_LAUNCH_MODE="$_SOVEREIGN_LAUNCH_MODE"
export SENTINELSQUAD_LAUNCH_MODE="$_SOVEREIGN_LAUNCH_MODE"
SENTINELSQUAD_LAUNCH_MODE="$_SOVEREIGN_LAUNCH_MODE"

APP_LOG_DIR="$SOVEREIGN_APP_ROOT/.sovereign/launcher-logs"
mkdir -p "$APP_LOG_DIR"
APP_LOG="$APP_LOG_DIR/sovereign-app.log"
WORKER_LOG="$APP_LOG_DIR/sovereign-worker.log"
OLLAMA_LOG="$APP_LOG_DIR/ollama.log"
OPENCLAW_LOG="$APP_LOG_DIR/openclaw.log"
BUILD_LOG="$APP_LOG_DIR/sovereign-build.log"

app_pid=""
worker_pid=""
ollama_pid=""
openclaw_pid=""
cleanup_done=0

kill_listeners_on_port() {
  local port="$1"
  local label="$2"
  local pids
  pids="$($LSOF_BIN -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi
  echo "Stopping existing $label listener on port $port (PID(s): $(echo "$pids" | tr '\n' ' '))"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done <<< "$pids"
  $SLEEP_BIN 1

  pids="$($LSOF_BIN -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Force stopping stubborn listener on port $port"
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      kill -9 "$pid" >/dev/null 2>&1 || true
    done <<< "$pids"
    $SLEEP_BIN 1
  fi
}

cleanup() {
  if [[ "$cleanup_done" -eq 1 ]]; then
    return
  fi
  cleanup_done=1
  local code=$?
  echo
  echo "Stopping launcher-started processes..."
  if [[ -n "$worker_pid" ]] && kill -0 "$worker_pid" >/dev/null 2>&1; then
    kill "$worker_pid" >/dev/null 2>&1 || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" >/dev/null 2>&1; then
    kill "$app_pid" >/dev/null 2>&1 || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$openclaw_pid" ]] && kill -0 "$openclaw_pid" >/dev/null 2>&1; then
    kill "$openclaw_pid" >/dev/null 2>&1 || true
    wait "$openclaw_pid" 2>/dev/null || true
  fi
  if [[ -n "$ollama_pid" ]] && kill -0 "$ollama_pid" >/dev/null 2>&1; then
    kill "$ollama_pid" >/dev/null 2>&1 || true
    wait "$ollama_pid" 2>/dev/null || true
  fi
  echo "Stopped."
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "=========================================="
echo "       SOVEREIGN SYSTEM LAUNCHER"
echo "=========================================="
echo "Project: $SOVEREIGN_APP_ROOT"
echo "App URL: $SENTINELSQUAD_APP_URL"
echo "Launch mode: $SENTINELSQUAD_LAUNCH_MODE"
echo "Auto-start OpenClaw gateway: $OPENCLAW_AUTOSTART"
echo "------------------------------------------"

echo "Resetting Sovereign listeners (restart mode)..."
kill_listeners_on_port "$_SOVEREIGN_APP_PORT" "Sovereign app"

# Kill stale workers that reference this repo path.
$PKILL_BIN -f "${SOVEREIGN_APP_ROOT}/scripts/worker.js" >/dev/null 2>&1 || true

if [[ -n "$OLLAMA_BIN" ]] && [[ -x "$OLLAMA_BIN" ]]; then
  if $CURL_BIN -fsS "${OLLAMA_BASE_URL%/}/api/tags" >/dev/null 2>&1; then
    echo "Ollama already running on ${OLLAMA_BASE_URL}."
  else
    echo "Starting Ollama service..."
    "$OLLAMA_BIN" serve >"$OLLAMA_LOG" 2>&1 &
    ollama_pid=$!

    ready=0
    for _ in {1..20}; do
      if $CURL_BIN -fsS "${OLLAMA_BASE_URL%/}/api/tags" >/dev/null 2>&1; then
        ready=1
        break
      fi
      $SLEEP_BIN 1
    done
    if [[ "$ready" -ne 1 ]]; then
      echo "Ollama health check failed at ${OLLAMA_BASE_URL}/api/tags"
      exit 1
    fi
  fi
else
  echo "Warning: ollama binary not found. LOCAL agents may fail."
fi

if [[ "$OPENCLAW_AUTOSTART" == "1" ]]; then
  if [[ -n "$OPENCLAW_BIN" && -x "$OPENCLAW_BIN" ]]; then
    if $LSOF_BIN -t -iTCP:"$OPENCLAW_GATEWAY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "OpenClaw gateway already listening on port $OPENCLAW_GATEWAY_PORT."
    else
      echo "Starting OpenClaw gateway on port $OPENCLAW_GATEWAY_PORT..."
      "$OPENCLAW_BIN" gateway --port "$OPENCLAW_GATEWAY_PORT" >"$OPENCLAW_LOG" 2>&1 &
      openclaw_pid=$!
    fi
  else
    echo "Warning: OPENCLAW_AUTOSTART=1 but openclaw binary not found."
  fi
fi

if [[ "$SENTINELSQUAD_LAUNCH_MODE" == "prod" ]]; then
  echo "Building Sovereign for production..."
  "$NPM_BIN" run build >"$BUILD_LOG" 2>&1
  echo "Starting Sovereign app (production)..."
  "$NPM_BIN" run start >"$APP_LOG" 2>&1 &
else
  echo "Starting Sovereign app (development)..."
  "$NPM_BIN" run dev >"$APP_LOG" 2>&1 &
fi
app_pid=$!

app_ready=0
for _ in {1..45}; do
  if $CURL_BIN -fsS "${SENTINELSQUAD_APP_URL%/}${SENTINELSQUAD_SIGNIN_PATH}" >/dev/null 2>&1; then
    app_ready=1
    break
  fi
  if ! kill -0 "$app_pid" >/dev/null 2>&1; then
    break
  fi
  $SLEEP_BIN 1
done

if [[ "$app_ready" -ne 1 ]]; then
  echo "Sovereign app failed health check (${SENTINELSQUAD_APP_URL%/}${SENTINELSQUAD_SIGNIN_PATH})."
  echo "See log: $APP_LOG"
  exit 1
fi

echo "Sovereign app is listening on port $_SOVEREIGN_APP_PORT."

if [[ "$SENTINELSQUAD_WORKER_AUTOSTART" == "1" ]]; then
  echo "Starting orchestrator worker (agent=${SENTINELSQUAD_WORKER_AGENT_KEY}, runtime=${SENTINELSQUAD_WORKER_RUNTIME})..."
  SENTINELSQUAD_WORKER_AGENT_KEY="$SENTINELSQUAD_WORKER_AGENT_KEY" \
  SENTINELSQUAD_WORKER_RUNTIME="$SENTINELSQUAD_WORKER_RUNTIME" \
  SENTINELSQUAD_WORKER_MODEL="$SENTINELSQUAD_WORKER_MODEL" \
  "$NODE_BIN" scripts/worker.js --agent="$SENTINELSQUAD_WORKER_AGENT_KEY" >"$WORKER_LOG" 2>&1 &
  worker_pid=$!
  $SLEEP_BIN 2
  if ! kill -0 "$worker_pid" >/dev/null 2>&1; then
    echo "Worker exited early. See log: $WORKER_LOG"
    exit 1
  fi
  echo "Worker started."
fi

if [[ "$SENTINELSQUAD_REQUIRE_AGENTS_ONLINE" == "1" ]]; then
  echo "Running all-agents-online gate..."
  if ! "$NODE_BIN" scripts/launcher/agent-online-gate.cjs \
      --timeout-ms="$SENTINELSQUAD_AGENT_GATE_TIMEOUT_MS" \
      --interval-ms="$SENTINELSQUAD_AGENT_GATE_INTERVAL_MS"; then
    echo "Agent online gate failed. See worker/app logs for details."
    exit 1
  fi
  echo "All-agents-online gate: PASS"
fi

"$OPEN_BIN" "${SENTINELSQUAD_APP_URL%/}${SENTINELSQUAD_SIGNIN_PATH}" >/dev/null 2>&1 || true

echo "------------------------------------------"
echo "Sovereign launched successfully"
echo "App log: $APP_LOG"
echo "Worker log: $WORKER_LOG"
echo "Press Ctrl+C to stop launcher-started processes."

wait "$app_pid"

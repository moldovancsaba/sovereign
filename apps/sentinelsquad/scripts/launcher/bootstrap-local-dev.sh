#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SENTINELSQUAD_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$SENTINELSQUAD_ROOT/../.." && pwd)"
ENV_FILE="$SENTINELSQUAD_ROOT/.env"
ENV_EXAMPLE="$SENTINELSQUAD_ROOT/.env.example"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
OPENSSL_BIN="${OPENSSL_BIN:-$(command -v openssl || true)}"
DOCKER_BIN="${DOCKER_BIN:-$(command -v docker || true)}"
LSOF_BIN="/usr/sbin/lsof"
DB_PORT="${SENTINELSQUAD_DB_PORT:-34765}"

if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
  echo "npm binary not found."
  exit 1
fi

random_secret() {
  if [[ -n "$OPENSSL_BIN" && -x "$OPENSSL_BIN" ]]; then
    "$OPENSSL_BIN" rand -hex 32
    return 0
  fi
  python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
}

ensure_env_line() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    local current
    current="$(grep "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2-)"
    if [[ -n "$current" && "$current" != "change-me-please" ]]; then
      return 0
    fi
    python3 - "$ENV_FILE" "$key" "$value" <<'PY'
import sys
path, key, value = sys.argv[1:4]
out = []
needle = f"{key}="
with open(path, "r", encoding="utf-8") as fh:
    for line in fh:
        if line.startswith(needle):
            out.append(f"{needle}{value}\n")
        else:
            out.append(line)
with open(path, "w", encoding="utf-8") as fh:
    fh.writelines(out)
PY
    return 0
  fi
  printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
}

wait_for_port() {
  local port="$1"
  local attempts="${2:-45}"
  local delay="${3:-1}"
  local i=1
  while [[ "$i" -le "$attempts" ]]; do
    if [[ -x "$LSOF_BIN" ]] && "$LSOF_BIN" -t -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
    i=$((i + 1))
  done
  return 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

NEXTAUTH_SECRET_VALUE="$(random_secret)"
TOOL_APPROVAL_SECRET_VALUE="$(random_secret)"

ensure_env_line "NEXTAUTH_URL" "http://localhost:3007"
ensure_env_line "NEXT_PUBLIC_SENTINELSQUAD_LOCAL_AUTH_BYPASS" "true"
ensure_env_line "SENTINELSQUAD_LOCAL_AUTH_BYPASS" "true"
ensure_env_line "DATABASE_URL" "postgresql://sentinelsquad:sentinelsquad@localhost:${DB_PORT}/sentinelsquad?schema=public"
ensure_env_line "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET_VALUE"
ensure_env_line "SENTINELSQUAD_TOOL_APPROVAL_SECRET" "$TOOL_APPROVAL_SECRET_VALUE"
ensure_env_line "SENTINELSQUAD_DEV_LOGIN_EMAIL" "dev@sentinelsquad.local"
ensure_env_line "SENTINELSQUAD_DEV_LOGIN_PASSWORD" "sentinelsquad-local"

if ! wait_for_port "$DB_PORT" 1 0; then
  if [[ -n "$DOCKER_BIN" && -x "$DOCKER_BIN" ]] && "$DOCKER_BIN" info >/dev/null 2>&1; then
    "$DOCKER_BIN" compose -f "$REPO_ROOT/docker-compose.yml" up -d sentinelsquad-db
  fi
fi

if ! wait_for_port "$DB_PORT" 45 1; then
  echo "Postgres did not become reachable on localhost:${DB_PORT}."
  exit 1
fi

cd "$SENTINELSQUAD_ROOT"

if [[ ! -d node_modules ]]; then
  "$NPM_BIN" install
fi

"$NPM_BIN" run prisma:generate
"$NPM_BIN" exec prisma migrate deploy
"$NPM_BIN" exec node scripts/launcher/seed-default-agents.js
if ! "$NPM_BIN" exec node scripts/launcher/runtime-doctor.js; then
  echo "Warning: local runtime doctor reported an unavailable provider or no installed models."
  echo "The app can still launch, but local agent execution will remain degraded until Ollama is healthy."
fi

# Sovereign API v1

Sovereign exposes an LLM-compatible API surface under `/api/v1` for local-first and hybrid runtime usage.

## Delivery Traceability

This API surface and related runtime features were delivered under Sovereign issue set:

- `#1` API v1 hardening
- `#2` Trinity stage contract enforcement
- `#3` Trinity retry + failure taxonomy
- `#4` Trinity run query API
- `#5` Manual staffing contract
- `#6` Auto staffing scorer
- `#7` Group registry + nested groups
- `#8` Ranking system
- `#9` API/trinity quality gate e2e
- `#10` rollout tracking umbrella

## Authentication

Optional token auth:

- env: `SOVEREIGN_API_TOKEN`
- headers:
  - `Authorization: Bearer <token>`
  - or `x-sovereign-api-token: <token>`

If `SOVEREIGN_API_TOKEN` is unset, API v1 allows local unauthenticated requests.

## Endpoints

### `POST /api/v1/chat/completions`

OpenAI-compatible response envelope with Sovereign metadata extensions.

Request example:

```json
{
  "mode": "direct",
  "provider": "local",
  "model": "deepseek-r1:1.5b",
  "temperature": 0.2,
  "max_tokens": 256,
  "messages": [
    { "role": "user", "content": "Summarize this repository in 3 bullet points." }
  ]
}
```

Supported fields:

- `mode`: `direct | trinity | team | auto`
- `provider`: `local | cloud | auto`
  - `mock` is available for deterministic local testing (no external runtime call)
- `model`: optional explicit model id
- `temperature`: optional number
- `max_tokens`: optional positive integer
- `messages`: non-empty array of chat messages
- `team` (optional):
  - `strategy`: `manual | auto`
  - `group_key`: optional active group key to bind team execution context
  - `manual_staffing`:
    - `drafter`: agent key
    - `writer`: agent key
    - `judge`: agent key

Manual staffing is currently applied in `trinity` and `team` modes. Assigned agents must be registered, enabled, `READY`, and runnable (`LOCAL` or `CLOUD`).

Auto staffing (`team.strategy=auto`, or `mode=auto`) uses deterministic role scoring per role (`drafter`, `writer`, `judge`) with weighted signals:

- quality: 40%
- role fit: 25%
- latency proxy: 20%
- cost proxy: 10%
- reliability recency: 5%

Selection rationale is returned in `sovereign.metadata.staffing` and persisted into Trinity run metadata.

### Agent Group APIs

- `GET /api/v1/agent-groups` - list groups
- `POST /api/v1/agent-groups` - create group (`key`, `displayName`, optional `description`)
- `GET /api/v1/agent-groups/:key/members` - list group members
- `POST /api/v1/agent-groups/:key/members` - add member
  - `memberType`: `AGENT | GROUP`
  - `memberAgentKey` for AGENT
  - `memberGroupKey` for GROUP

Nested group cycle creation is blocked by policy.

### Ranking API

- `GET /api/v1/rankings/roles`
- `GET /api/v1/rankings/roles?role=drafter|writer|judge`

Returns persisted role ranking snapshots used by auto staffing.

## E2E Validation

Run API v1 coverage script (requires app running on `SOVEREIGN_E2E_BASE_URL` or `http://127.0.0.1:3007`):

```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
npm run e2e:api-v1-trinity
```

Response shape:

- standard:
  - `id`, `object`, `created`, `model`, `choices`, `usage`
- sovereign extension:
  - `sovereign.mode`
  - `sovereign.provider`
  - `sovereign.metadata`

### `GET /api/v1/models`

Returns available model ids (preset + discovered local Ollama models).

### `GET /api/v1/health`

Returns API/provider health summary including local provider status and cloud config status.

### `GET /api/v1/trinity/runs`

Lists persisted Trinity runs (newest first).

Query parameters:

- `page` (default `1`)
- `limit` (default `20`, max `100`)
- `status`
- `provider`
- `model`
- `created_after` (ISO datetime)
- `created_before` (ISO datetime)

### `GET /api/v1/trinity/runs/:id`

Returns a single persisted Trinity run by database `id` or `request_id`.

## Error Contract

Errors are returned as:

```json
{
  "error": {
    "message": "Human-readable message",
    "type": "invalid_request_error | authentication_error | api_error | server_error",
    "code": "machine_readable_code",
    "param": "optional_field_name_or_null"
  }
}
```

Common codes:

- `invalid_json`
- `invalid_body`
- `invalid_messages`
- `invalid_mode`
- `invalid_provider`
- `invalid_temperature`
- `invalid_max_tokens`
- `payload_too_large`
- `unauthorized`
- `provider_timeout`
- `provider_unavailable`
- `provider_http_error`
- `empty_provider_response`
- `internal_error`

## Runtime Guards

- Max request body size: `SOVEREIGN_API_MAX_BODY_BYTES` (default `262144`)
- Provider request timeout: `SOVEREIGN_API_PROVIDER_TIMEOUT_MS` (default `60000`)

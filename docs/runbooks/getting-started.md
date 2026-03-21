# Runbook: Getting started with {sovereign}

Local-first control plane: web app, worker, Postgres, optional MCP servers.

## Prerequisites

- Node.js and npm (see repo root `README.md`)
- Docker (for local Postgres with pgvector) or another Postgres 16 + pgvector host

## Quick path

1. **Repository root:** install and generate Prisma client: `npm run bootstrap`
2. **Database:** `npm run db:up` (or point `DATABASE_URL` in `apps/sovereign/.env`)
3. **Migrations:** `cd apps/sovereign && npx prisma migrate dev`
4. **App:** from repo root, `npm run dev` → [http://127.0.0.1:3007](http://127.0.0.1:3007)
5. **Worker:** separate terminal, `cd apps/sovereign && npm run worker` (requires agent key — see **Agents** in the app)

## MCP (agents / IDE)

| Server   | Command              | Purpose                          |
|----------|----------------------|----------------------------------|
| Backlog  | `npm run mcp:backlog` | Backlog tools over stdio        |
| Memory   | `npm run mcp:memory`  | Memory search + resources       |
| Docs     | `npm run mcp:docs`    | Read-only doc resources (`doc://…`) |

Copy/paste commands from the in-app **Run** page (`/run`).

## Wiki (optional, LLD-007)

Self-hosted BookStack (or similar) is **optional**. See [WIKI_SELF_HOSTED.md](../setup/WIKI_SELF_HOSTED.md). The **MCP docs** server can serve repo runbooks without a wiki; remote wiki bridging is a follow-up.

## Further reading

- [SOVEREIGN_PROJECT_BOARD_SSOT.md](../SOVEREIGN_PROJECT_BOARD_SSOT.md) — delivery checklist
- [HANDOVER.md](../../HANDOVER.md) — release state and verification

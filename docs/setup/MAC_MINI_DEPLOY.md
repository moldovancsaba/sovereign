# Greenfield deploy: second Mac (e.g. Mac mini)

This runbook is the **canonical path** for taking a **new machine** from **zero** to **daily use** with the local app, Postgres, worker, and chat — using **only** this repo and standard tools. Replace `<REPO>` with the directory where you cloned [moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign) (example: `~/Projects/sovereign`). Do not copy another operator’s home-directory paths.

**Board / issue:** Tracked as [mvp-factory-control#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448). **Implementation priority** follows the [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) (Product `{sovereign}`).

---

## Required vs optional

| Area | Required for baseline | Optional |
|------|------------------------|----------|
| **Git / clone** | Yes — you need the repo on disk | — |
| **Node.js 20 + npm** | Yes | — |
| **Docker Desktop** (or compatible runtime) | Yes — for local Postgres via `docker compose` | Use an existing Postgres 16 + **pgvector** host instead; set `DATABASE_URL` (see below) |
| **Ollama** | Yes — for default local LLM routing | — |
| **GitHub / `gh` / tokens** | **No** — not required for runtime | Useful for maintainers (board, CI) |
| **Semantic project memory** (`pgvector` + embeddings) | **No** for “app + worker + chat” | Run `ollama pull nomic-embed-text` and `npm run memory:verify` when you want memory search |
| **MCP servers** (backlog, memory, docs) | **No** for core chat/worker | See [runbooks/getting-started.md](../runbooks/getting-started.md) |
| **Self-hosted wiki** (BookStack / Outline) | **No** | LLD-007; see [WIKI_SELF_HOSTED.md](WIKI_SELF_HOSTED.md) |

---

## 1. Prerequisites (install once)

- **macOS** (or Linux with equivalent paths — this doc is written for macOS first).
- **Node.js 20** and **npm** ([nodejs.org](https://nodejs.org/) or `nvm`).
- **Docker Desktop** (or Podman, etc.) if you use the repo’s Postgres container.
- **Ollama** — install from [ollama.com](https://ollama.com) and ensure `curl http://127.0.0.1:11434/api/tags` works.
- **Git** — clone the repository:

```bash
git clone https://github.com/moldovancsaba/sovereign.git <REPO>
cd <REPO>
```

From here, `<REPO>` means your clone root (the directory containing `package.json` and `apps/sovereign`).

---

## 2. Database (Postgres + pgvector)

**Option A — Docker (recommended):** from `<REPO>`:

```bash
npm run db:up
```

This starts the `sovereign-db` service defined in `docker-compose.yml` (image includes pgvector).

**Option B — your own Postgres:** provision Postgres 16 with the **pgvector** extension, then set `DATABASE_URL` in `apps/sovereign/.env` to a valid connection string (same format as `.env.example`).

If you previously used a plain Postgres image without pgvector, recreate the volume after pulling the updated compose file, then re-run migrations.

---

## 3. Environment and install

```bash
cd <REPO>/apps/sovereign
cp .env.example .env
```

Edit `.env` if you use a non-default `DATABASE_URL` or Ollama host.

**Worker agent key:** `SOVEREIGN_WORKER_AGENT_KEY` must name an **ALPHA** agent (default seed is often `Controller`). See **§6** if you change this.

From `<REPO>`:

```bash
npm run bootstrap
```

(`install:app` + `prisma:generate` — see root `package.json`.)

---

## 4. Migrations

**Greenfield / second machine (no local migration history edits):** use **deploy** migrations (idempotent, no prompts):

```bash
cd <REPO>
npm run prisma:migrate:deploy
```

For **development** on the machine that authors schema changes, `apps/sovereign` uses `npx prisma migrate dev` instead — see [SETUP.md](../SETUP.md).

---

## 5. Run app and worker

**Terminal 1 — web app:**

```bash
cd <REPO>
npm run dev
```

**Terminal 2 — control-plane worker** (picks up tasks for the configured ALPHA agent):

```bash
cd <REPO>
npm run worker
```

Defaults read `SOVEREIGN_WORKER_AGENT_KEY` from `apps/sovereign/.env`. Alternative: `cd <REPO>/apps/sovereign && npm run worker -- --agent=Controller` (or your ALPHA key).

**URLs** (use **`localhost`**, not `127.0.0.1`, so cookies match `NEXTAUTH_URL`):

- App: [http://localhost:3007](http://localhost:3007)
- Chat: [http://localhost:3007/chat](http://localhost:3007/chat)
- Run (copy-paste flows): [http://localhost:3007/run](http://localhost:3007/run)

---

## 6. Agent key and project session (end-to-end)

1. **Sign in** — local dev uses the dev auth path; follow the in-app sign-in flow.
2. **Worker key** — ensure `SOVEREIGN_WORKER_AGENT_KEY` in `apps/sovereign/.env` matches an **ALPHA** agent (default `Controller` matches seed data). The **Agents** page (`/agents`) lists agents and can start/stop the worker per agent; align with [.env.example](../../apps/sovereign/.env.example).
3. **Project session** — open **IDE** (`/ide`). Register or select a **project session** (workspace folder) so chat, tasks, and tools share the same `projectSessionId`. The active session is shown in the IDE UI; MCP tools that need `projectSessionId` refer to this id.

---

## 7. One-command macOS alternative

After the repo exists on disk, you can use the automated installer (installs deps, DB, migrations, seeds, optional Sovereign.app — see [README](../../README.md#one-command-macos-install)):

```bash
cd <REPO>
npm run install:macos
```

Use `SKIP_DESKTOP_INSTALL=1` or `SKIP_START=1` if you only want bootstrap without installing the `.app` or starting background processes.

**Sovereign.app / first-launch smoke (logs, Gatekeeper, models):** [MACOS_APP_CLEAN_INSTALL_SMOKE.md](MACOS_APP_CLEAN_INSTALL_SMOKE.md) ([mvp-factory-control#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450)).

---

## 8. Validation drill (acceptance for #448)

On a **clean user account**, **VM**, or **second physical Mac**:

1. Follow **§1–§5** only (no tribal knowledge).
2. Confirm: app loads, worker stays running, one **chat** message to `@Controller` (or your ALPHA agent) completes.
3. Record any gaps as a comment on [mvp-factory-control#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448) so the runbook can be updated.

**2026-03-27 — Engineering pass:** `npm run verify` green on the integration host; [MACOS_APP_CLEAN_INSTALL_SMOKE.md](MACOS_APP_CLEAN_INSTALL_SMOKE.md) **Recorded smoke** includes `desktop:install-app` to a temp install parent. A **fully isolated** clean macOS user / second physical Mac is still the gold standard for production confidence.

---

## Further reading

- [SETUP.md](../SETUP.md) — detailed local setup
- [BUILD_AND_RUN.md](../BUILD_AND_RUN.md) — build and run
- [runbooks/getting-started.md](../runbooks/getting-started.md) — operator runbook + MCP
- [HANDOVER.md](../../HANDOVER.md) — release state and verification commands

# macOS: Sovereign.app clean-install smoke (QA)

**Board / issue:** [mvp-factory-control#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450). Depends on the greenfield path in [MAC_MINI_DEPLOY.md](MAC_MINI_DEPLOY.md) (clone, Node, Docker, Ollama). **Implementation priority:** [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) (Product `{sovereign}`).

This document is the **checklist** for validating **Sovereign.app** (WebKit shell) and the **first-launch bootstrap** on a **clean macOS user** or **new Mac** — not only `npm run dev` from a terminal.

Gaps discovered during a real run should be filed against [mvp-factory-control#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432) (OSS installability umbrella) or new issues, and linked from the smoke log below.

---

## Native shell behavior (foundation)

**Sovereign.app** is a thin **WKWebView** over **`http://localhost:3007`** (same host as `NEXTAUTH_URL` in `.env` so NextAuth cookies apply). If you change one, change both. It probes **`GET /api/ready`** (instant 200), then loads **`/chat`**. With **`next dev`**, WebKit may **never** call `didStart` / `didCommit` / `didFinish` for that navigation; the shell therefore **always** hides the blocking overlay **~0.5s after `load`**, and still uses **`didStartProvisionalNavigation`** when it fires, plus a **RunLoop.common** watchdog (~12s). Use **⌘R Reload chat** if the page is blank. Reinstall the app after changing `main.swift.template`.

## Scope

| In scope | Out of scope (this issue) |
|----------|---------------------------|
| `npm run desktop:install-app` from a cloned repo | App Store / notarized distribution |
| First open of **Sovereign.app**, bootstrap, chat loads | Linux / Windows |
| Log locations under **`<REPO>/.sovereign/`** | Cloud hosting |

Optional later: **menubar** (`npm run menubar:install`), **LaunchAgent** daemons (`npm run service:install`) — same repo scripts; smoke here focuses on the **.app** path.

---

## Prerequisites (same as greenfield runbook)

- macOS, **Node.js 20**, **npm**, **Docker Desktop** (for local Postgres), **Xcode Command Line Tools** (`swiftc` for the desktop installer).
- **Ollama** installed and running: [https://ollama.com](https://ollama.com) — `curl -s http://127.0.0.1:11434/api/tags` should succeed.
- Clone the repo: `<REPO>` = your path to the repository root (`package.json` at top level).

### Default model for bridge.py (Nexus Bridge) / agents

Seeded agents expect a **local** model. After Ollama is up, pull at least one model the seed uses (see `apps/sovereign/scripts/launcher/seed-default-agents.js`; common default: **Granite-4.0-H-1B** or override via `SOVEREIGN_WORKER_MODEL` / `OLLAMA_MODEL`):

```bash
ollama pull Granite-4.0-H-1B
```

For **semantic memory** verification (optional): `ollama pull nomic-embed-text` and `npm run memory:verify` from `<REPO>`.

---

## Install Sovereign.app

From **`<REPO>`** (repository root):

```bash
cd <REPO>
npm run desktop:install-app
```

- Installs **Sovereign.app** under **`/Applications`** if writable, else **`~/Applications`**.
- Override: `SOVEREIGN_INSTALL_PARENT="$HOME/Applications" npm run desktop:install-app` or see [README](../../README.md#macos-desktop-path).

---

## First launch (what should happen)

2. On first launch the shell runs **`apps/sovereign/scripts/launcher/bootstrap-local-dev.sh`** (creates/updates `apps/sovereign/.env`, starts Docker Postgres if needed, `prisma migrate deploy`, seeds agents), then starts **`next dev`** on port **3007**, the **Nexus Bridge**, and the **External Vanguard**, and loads **Chat** in the window when healthy.

### Log files (repo root, not home)

The desktop template writes under **`<REPO>/.sovereign/desktop-app-logs/`**:

| File | Purpose |
|------|---------|
| `bootstrap.log` | `bootstrap-local-dev.sh` stdout/stderr |
| `service-install.log` | `sovereign-daemon-install.sh` (LaunchAgents; failures often non-fatal) |
| `desktop-web.log` | `npm run dev` (Next.js) |
| `desktop-bridge.log` | `scripts/sovereign_dag/venv/bin/python3 scripts/sovereign_dag/bridge.py` |
| `desktop-vanguard.log` | `scripts/sovereign_dag/venv/bin/python3 scripts/discord_vanguard.py` |

**App-local state** (settings, etc.): `apps/sovereign/.sovereign/` (e.g. `settings.json`). **Launchd daemon logs** (if you installed services): `apps/sovereign/.sovereign/daemon-logs/`.

**Alternative one-shot installer** (no separate `.app` build): `npm run install:macos` logs to `/tmp/sovereign-dev.log` and `/tmp/sovereign-worker.log` — see [README](../../README.md#one-command-macos-install).

---

## Checklist (clean Mac / clean user)

Use this when doing the acceptance smoke; paste results into [mvp-factory-control#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450) or append under **Recorded smoke** below.

- [ ] **Gatekeeper:** If macOS blocks the app: **System Settings → Privacy & Security** → allow, or **right-click → Open** on first launch.
- [ ] **Docker:** Postgres container starts; `localhost:34765` reachable after bootstrap (or your `DATABASE_URL`).
- [ ] **Port 3007:** Nothing else listening. If bind fails: `lsof -iTCP:3007 -sTCP:LISTEN` and stop the conflicting process.
- [ ] **Chat UI:** Window shows unified chat; sign-in with dev bypass if prompted (see `.env` / [SETUP.md](../SETUP.md)).
- [ ] **Nexus Bridge:** `desktop-bridge.log` shows bridge started; or use **Dashboard / Run** in the app.
- [ ] **External Vanguard:** `desktop-vanguard.log` shows vanguard logged in and active.
- [ ] **Ollama:** Model pulled; runtime doctor in bootstrap should not warn indefinitely (see `bootstrap.log`).

---

## Common failures

| Symptom | What to check |
|---------|----------------|
| “npm binary not found” | Install Node 20+; restart Terminal. |
| “swiftc not found” | `xcode-select --install` |
| Postgres never ready | Docker running; `docker compose -f docker-compose.yml ps` |
| Blank window / spinner forever | `desktop-web.log`, `bootstrap.log`; port **3007**; DB up. The shell probes **`GET /api/ready`** (instant 200); after pulling a fix to `tools/macos/SovereignDesktop/main.swift.template`, run **`npm run desktop:install-app`** again to rebuild **Sovereign.app**. |
| Gatekeeper | Allow in Privacy & Security |
| Worker tasks fail | Ollama tags; pull default model; `desktop-bridge.log` |

---

## Recorded smoke (append-only)

*Maintainers: after a successful **clean-account** or **new-Mac** run, add one line: **date — operator — result (link to comment or PR).***

| Date | Environment | Result | Notes |
|------|----------------|--------|--------|
| 2026-03-27 | Engineering — macOS dev host (not isolated clean user); `SOVEREIGN_INSTALL_PARENT` → temp dir | **PASS** (install + verify) | `npm run verify` green. `npm run desktop:install-app` produced **Sovereign.app** and exited 0. Full **clean-account** GUI launch not re-run in this session; operators should still run the checklist once on a greenfield Mac. |

---

## Related

- [MAC_MINI_DEPLOY.md](MAC_MINI_DEPLOY.md) — full greenfield CLI path  
- [BUILD_AND_RUN.md](../BUILD_AND_RUN.md) — dev vs desktop vs service  
- [README.md](../../README.md) — `desktop:install-app`, `install:macos`

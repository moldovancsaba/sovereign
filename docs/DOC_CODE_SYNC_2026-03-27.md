# Documentation ↔ code alignment (2026-03-27)

**Purpose:** Single inventory of **operator-facing and board-related changes** merged on the `main` line through **2026-03-27**, so README / HANDOVER / SSOT / setup docs match the implementation. When you change behaviour in these areas, update this file (or replace it with a newer dated snapshot) and the linked primary docs.

**Authoritative order:** [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) (implementation sequencing) → [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) (mapping) → this note (engineering changelog digest) → code on `main`.

---

## 1. GitHub: mvp-factory-control (board) + moldovancsaba/sovereign (repo)

| Item | State | In repo |
|------|--------|---------|
| Extended Mac mini / install track **#448–#450** | Closed on board (with engineering + PO notes) | Runbooks + UX below |
| Operator paths **#449** | Closed | Run page + docs use placeholders / `git rev-parse` |
| Greenfield runbook **#448** | Closed | [setup/MAC_MINI_DEPLOY.md](setup/MAC_MINI_DEPLOY.md) |
| Sovereign.app smoke **#450** | Closed | [setup/MACOS_APP_CLEAN_INSTALL_SMOKE.md](setup/MACOS_APP_CLEAN_INSTALL_SMOKE.md) |
| Sovereign repo **#22** (macOS install) | Closed | `npm run install:macos`, `scripts/install-sovereign-macos.sh` |
| Sovereign repo **#23** (CI Docker pulls) | Closed | `scripts/sovereign-docker-bootstrap.sh`, workflow + commit noted in SSOT §4.2 |

Alignment comments were added on sovereign issues **#1–#10**, **#12–#16**, **#22–#23** (board SSOT pointers).

---

## 2. SSOT and handover

| Doc | What changed |
|-----|----------------|
| [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | §1: board = implementation ordering; §2.1 rows for **#448–#450** closed; §2.2 / §4.2 / §4.3 Mac mini + repo-first rows; **#449** closed in §4.2 |
| [HANDOVER.md](../HANDOVER.md) | Operator truth: planning vs board vs code SSOT; verification uses `git rev-parse` / clone placeholder; **70 PROTOCOL** log entries for board sync, runbooks, #449/#450, desktop DB fix |
| [WIKI.md](WIKI.md) | Board line clarifies mapping vs implementation board |

---

## 3. Operator docs and copy-paste paths

| File | Change |
|------|--------|
| [README.md](../README.md) | No hardcoded home paths; `<your-sovereign-clone>`; links to MAC_MINI_DEPLOY + MACOS_APP smoke; `desktop:install-app` reinstall note; doc map uses repo-relative links |
| [SETUP.md](SETUP.md) | Paths as `<your-sovereign-clone>`; **Legacy DATABASE_URL** (`sentinelsquad` → `sovereign`) troubleshooting |
| [BUILD_AND_RUN.md](BUILD_AND_RUN.md) | `<repo>`, optional `SOVEREIGN_REPO`; related-doc links relative |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Relative architecture links; clone placeholder in commands |
| [API_V1.md](API_V1.md) | E2E snippet uses `$(git rev-parse --show-toplevel)` |
| [runbooks/getting-started.md](runbooks/getting-started.md) | Pointer to MAC_MINI_DEPLOY for greenfield |

---

## 4. In-app Run page (`/run`)

| File | Change |
|------|--------|
| [apps/sovereign/src/app/run/page.tsx](../apps/sovereign/src/app/run/page.tsx) | `CD_REPO` / `CD_APP` use `cd "$(git rev-parse --show-toplevel)"`; worker uses repo-root `npm run worker`; intro explains `git rev-parse` |

---

## 5. Default paths (no author-specific home)

| File | Change |
|------|--------|
| [apps/sovereign/src/lib/settings-store.ts](../apps/sovereign/src/lib/settings-store.ts) | `DEFAULT_PROJECT_ROOT` = `path.join(os.homedir(), "Projects")` |
| [apps/sovereign/src/lib/ide.ts](../apps/sovereign/src/lib/ide.ts) | `DEFAULT_IDE_ROOT` = `path.join(os.homedir(), "Projects")` |
| [apps/sovereign/scripts/launcher/seed-default-agents.js](../apps/sovereign/scripts/launcher/seed-default-agents.js) | Same for seeded `localProjectFolder` default |
| [apps/sovereign/src/app/settings/page.tsx](../apps/sovereign/src/app/settings/page.tsx) | Placeholder `~/Projects` |

---

## 6. Auth UI and Next.js layout

| File | Change |
|------|--------|
| [apps/sovereign/src/app/signin/page.tsx](../apps/sovereign/src/app/signin/page.tsx) | Renders **SignInCard** when not bypassed (no more `return null` blank page) |
| [apps/sovereign/src/components/Providers.tsx](../apps/sovereign/src/components/Providers.tsx) | **SessionProvider** for `next-auth/react` |
| [apps/sovereign/src/app/layout.tsx](../apps/sovereign/src/app/layout.tsx) | Wraps `children` with **Providers** |

**Operational rule:** Use **`http://localhost:3007`** in the browser and in **Sovereign.app** so host matches **`NEXTAUTH_URL`** (see `.env.example`). `apps/sovereign/src/lib/prisma.ts` may rewrite `@localhost:` → `@127.0.0.1:` for the **database** URL only.

---

## 7. HTTP readiness probe (desktop + automation)

| File | Change |
|------|--------|
| [apps/sovereign/src/app/api/ready/route.ts](../apps/sovereign/src/app/api/ready/route.ts) | **`GET /api/ready`** — instant `{ ok: true }` without DB/Ollama (contrast `/api/v1/health`) |

---

## 8. Native macOS shell (Sovereign.app)

| File | Change |
|------|--------|
| [tools/macos/SovereignDesktop/main.swift.template](../tools/macos/SovereignDesktop/main.swift.template) | Readiness: **`GET http://localhost:3007/api/ready`** (host aligns with `NEXTAUTH_URL`; avoids `127.0.0.1` vs `localhost` cookie split); then load **`/chat`**; overlay cleared on **`didStartProvisionalNavigation`** / **`didCommit`** / **`didFinish`**, **0.5s mandatory delay**, **RunLoop.common** watchdog; failure alerts + **⌘R Reload chat**; no literal `{sovereign}` in UI strings |
| [tools/macos/SovereignDesktop/install_SovereignDesktop.sh](../tools/macos/SovereignDesktop/install_SovereignDesktop.sh) | Post-install note: rebuild from template; `{sovereign}` in loader = stale binary |
| [tools/macos/SovereignMenubar/main.swift.template](../tools/macos/SovereignMenubar/main.swift.template) | Open URLs use **`http://localhost:3007`** |

Logs (first launch): **`<repo>/.sovereign/desktop-app-logs/`** (`bootstrap.log`, `desktop-web.log`, `desktop-worker.log`, …). Documented in [setup/MACOS_APP_CLEAN_INSTALL_SMOKE.md](setup/MACOS_APP_CLEAN_INSTALL_SMOKE.md).

**Rebuild after template edits:** `npm run desktop:install-app`.

---

## 9. Bootstrap and database credentials

| File | Change |
|------|--------|
| [apps/sovereign/scripts/launcher/bootstrap-local-dev.sh](../apps/sovereign/scripts/launcher/bootstrap-local-dev.sh) | If **`DATABASE_URL`** contains **`sentinelsquad`**, rewrite to **`postgresql://sovereign:sovereign@localhost:<port>/sovereign?schema=public`** where `<port>` is **`SOVEREIGN_DB_PORT`** or **34765** (matches [docker-compose.yml](../docker-compose.yml) `POSTGRES_*`) |

Operators with an old `.env` must either run bootstrap once or set **`DATABASE_URL`** to match [.env.example](../apps/sovereign/.env.example).

---

## 10. Other touched files (secondary)

| File | Notes |
|------|--------|
| [apps/sovereign/nexus/VSCODIUM_CHATDEV_PLAYBOOK.md](../apps/sovereign/nexus/VSCODIUM_CHATDEV_PLAYBOOK.md) | `git rev-parse` for app dir |
| [apps/sovereign/next-env.d.ts](../apps/sovereign/next-env.d.ts) | Tooling reference line (Next types) |

**Do not commit:** `apps/sovereign/.sovereign/` (local operator state); operator `.env` (set locally from `.env.example`).

---

## 11. Verification

```bash
cd "$(git rev-parse --show-toplevel)"
npm run verify
```

After changing the Swift template: **`npm run desktop:install-app`**, then quit and reopen **Sovereign.app**.

---

*Maintainers: when this snapshot is superseded, add a newer `DOC_CODE_SYNC_YYYY-MM-DD.md` and link it from [HANDOVER.md](../HANDOVER.md) and [README.md](../README.md) documentation map.*

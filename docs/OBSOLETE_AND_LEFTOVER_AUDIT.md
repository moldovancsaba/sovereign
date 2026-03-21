# Obsolete paths, names, and leftovers — `{sovereign}` audit

**Date:** 2026-03-19 (updated 2026-03-21)  
**Purpose:** Inventory **legacy SentinelSquad / sentinelsquad** artefacts, **stale paths**, and **doc/code drift** so cleanup can be deliberate. Some items are **intentional compatibility** (do not delete without a migration plan).

**External folders removed (operator machine):** A duplicate checkout at `~/Projects/sentinelsquad` and scratch folder `~/Projects/sentinelsquad-orphaned-*` should not exist; canonical clone is `~/Projects/sovereign`. Repo scripts no longer default to the old absolute path.

**Related:** [DOCS_AND_SSOT_AUDIT.md](DOCS_AND_SSOT_AUDIT.md) (SSOT vs implementation), [RENAME_TO_SOVEREIGN.md](RENAME_TO_SOVEREIGN.md) (rename checklist).

---

## Legend

| Tag | Meaning |
|-----|---------|
| **compat** | Kept on purpose for env / DB / operator continuity |
| **rename-candidate** | Safe to rename when you batch-update scripts & docs |
| **obsolete-path** | Path or glob no longer matches the repo layout |
| **artifact** | Generated or local-only; refresh or delete without losing source |
| **review** | May still be valuable; confirm before removal |

---

## 1. Repository layout — stale or parallel trees

| Item | Notes | Suggested action |
|------|--------|------------------|
| **Root `.gitignore`** | Entire block still uses `apps/sentinelsquad/...` (app moved to `apps/sovereign`). **Fixed 2026-03-19** to `apps/sovereign/...` so `.next`, `.env`, prisma dev DB are ignored correctly. | Verify no accidental tracked `.next` / `.env` under `apps/sovereign` |
| **`apps/sentinelsquad/`** | Not present in tree (rename done). Any doc or script still pointing here is wrong. | Grep and fix references |
| **Root `.sentinelsquad/`** | Appears as local operator dir (e.g. desktop logs). | Ensure `.gitignore` covers if sensitive; prefer `.sovereign/` for new data |
| **`apps/sovereign/.sentinelsquad/`** | Legacy settings + daemon logs; code may still read as fallback | Migrate to `.sovereign/`; keep until LLD-001 complete |

---

## 2. macOS / desktop / launchd

| Path | Notes | Tag |
|------|--------|-----|
| `tools/macos/SovereignDesktop/` | Current WebKit shell + installer | **canonical** |
| `tools/macos/SentinelSquadDesktop/install_*.sh` | Delegates to `SovereignDesktop/install_SovereignDesktop.sh` | **compat shim** |
| `tools/macos/SovereignMenubar/` | Menubar app (`com.sovereign.menubar`); `npm run menubar:install` | **current** |
| `tools/macos/SentinelSquadMenubar/install_*.sh` | Delegates to `SovereignMenubar/install_SovereignMenubar.sh` | **compat shim** |
| `tools/launchd/com.sovereign.plist` | LaunchAgent template (`com.sovereign`, `sovereign-daemon.sh`) | **current** |
| `apps/sovereign/scripts/launcher/Launch Sovereign.command` | Interactive launcher | **current** |
| `apps/sovereign/scripts/launcher/Open Sovereign Workspace.command` | Workspace + services | **current** |
| `apps/sovereign/scripts/launcher/sovereign-*.sh` | Daemon install/status/worker | **current** — root `package.json` `service:*` targets these; legacy `com.sentinelsquad.*` still booted out on install |

---

## 3. Root `scripts/` (CI / gates / helpers)

Canonical root scripts use **`sovereign-*`** (examples):

- `sovereign-docker-bootstrap.sh`, `sovereign-docker-preflight.sh`, `sovereign-docker-portability-gate.sh`
- `sovereign-validate-handover.sh`, `sovereign-validate-prompt-package.js`, `sovereign-ready-gate-audit.sh`, `sovereign-set-project-fields.sh`
- `sovereign-defaults.env`

**Tag:** **current** — update any external docs or forks that still cite `sentinelsquad-*` script names.

---

## 4. `.github/workflows/`

Workflow files use **`sovereign-*-gate.yml`** (docker portability, security policy, recovery, provenance, filesystem safety, DLP, etc.).

**Tag:** **current** — external references to old workflow filenames need updating.

---

## 5. App scripts and tests (`apps/sovereign/scripts/`)

| Area | Pattern | Tag |
|------|---------|-----|
| E2E | `sovereign-*.e2e.js` (strict-role, render-contract, postmvp, security, …) | **current** |
| Recovery | `recovery/sovereign-incident-bundle.js` | **current** |
| Launcher | `sovereign-daemon*.sh`, worker daemon | **current** |
| MCP / worker | Names are sovereign-neutral | OK |

`package.json` in app exposes **`e2e:sovereign`**; **`e2e:sentinelsquad`** is a deprecated alias → `e2e:sovereign`.

---

## 6. Runtime and protocol identifiers (high-impact)

These affect **DB rows**, **worker envelopes**, or **compose**:

| Identifier | Where | Tag |
|------------|--------|-----|
| `sentinelsquad.tool-call` | `tool-call-protocol` (TS/JS), worker validation | **compat** — changing breaks in-flight tasks / prompts |
| `sovereign-primary-orchestrator` | `orchestrator-lease.ts`, worker default; SQL migration rewrites legacy `sentinelsquad-primary-orchestrator` | **current** |
| `sovereign-db`, DB user `sovereign`, DB name `sovereign` | `docker-compose.yml` | **current** — fresh volume / `DATABASE_URL` vs old `sentinelsquad_*` stacks |
| `SENTINELSQUAD_*` env vars | `.env.example`, app, worker fallbacks | **compat** — document `SOVEREIGN_*` as preferred |
| `SENTINELSQUAD_STRICT_ORCHESTRATION`, orch role keys | `strict-orchestration.js` | **compat** |

**Recommendation:** Treat renames here as a **single ADR + migration** (not drive-by edits).

---

## 7. Documentation drift

| Document | Issue | Tag |
|----------|--------|-----|
| [GENERAL_KNOWLEDGE.md](GENERAL_KNOWLEDGE.md) | Uses `{sovereign}` as primary product placeholder | **current** |
| [SETUP.md](SETUP.md) | Product copy uses `{sovereign}`; recheck if new sections reintroduce old brand | **verify** |
| [architecture/0001-theia-desktop-foundation.md](architecture/0001-theia-desktop-foundation.md), [0002-rock-solid-open-source-hardening.md](architecture/0002-rock-solid-open-source-hardening.md) | Legacy `{sentinelsquad}` in diagrams/text | **update** when touching ADRs |
| [DOCS_AND_SSOT_AUDIT.md](DOCS_AND_SSOT_AUDIT.md) | Header date `2025-03-19` may be wrong year vs content | **review** |
| **mvp-factory-control** references | Intentional — external board SSOT | **keep** |

---

## 8. Build artefacts (noise, not source)

| Observation | Action |
|-------------|--------|
| `apps/sovereign/.next/**` contains chunk paths like `apps_sentinelsquad_*` | Turbopack/cache from **old folder name** or symlink history | Delete `.next` and rebuild after confirming `.gitignore` |
| Same for `.next/dev` | **artifact** | `rm -rf apps/sovereign/.next` then `npm run build` |

---

## 9. `nexus/` under the app

`apps/sovereign/nexus/*.md` — updated to Sovereign; legacy LaunchAgent names noted where relevant.

**Tag:** **review** when polishing operator docs.

---

## 10. Suggested cleanup phases (safe → risky)

1. **Docs-only:** GENERAL_KNOWLEDGE, SETUP, ADR wording; fix audit doc dates.  
2. **Ignore + artefacts:** Ensure `.gitignore` matches `apps/sovereign`; strip committed build output if any.  
3. **Rename batch:** root `scripts/`, workflows, e2e filenames, `.command` titles, `npm` script keys (update CONTRIBUTING / READMEDEV / CI docs).  
4. **Infrastructure:** `docker-compose` service/user/db names; Launchd plist label.  
5. **Protocol / DB:** `sentinelsquad.tool-call`, orchestrator lease id — **migration + ADR** only.

---

## 11. Quick grep commands (maintenance)

```bash
# Paths and filenames (excluding .next/node_modules)
git ls-files | rg -i sentinel

# Content in tracked source/docs (tune globs as needed)
rg -i sentinelsquad --glob '!**/.next/**' --glob '!**/node_modules/**'
```

---

*Owner: maintainers. Re-run this audit after major renames or directory moves.*

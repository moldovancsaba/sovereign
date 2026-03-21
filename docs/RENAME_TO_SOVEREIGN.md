# Rename: sentinelsquad → {sovereign} / sovereign

**Brand:** {sovereign} in prose and marketing.  
**Code and file names:** `sovereign` where `{}` is not usable (e.g. package names, env vars, folder names, binaries).

This checklist says **what** to change and **who** can do it. The rename affects repo name, local folder, docs, code, env vars, workflows, and the macOS app.

---

## Who does what

| Action | Who | Notes |
|--------|-----|------|
| **Rename GitHub repository** (e.g. `sentinelsquad` → `sovereign`) | **You** (repo owner) | GitHub: Settings → General → Repository name. Then update local `git remote` and any clones. |
| **Rename local project folder** (e.g. `.../sentinelsquad` → `.../sovereign`) | **You** | After repo rename (or before); update paths in docs that reference the absolute path. |
| **In-repo renames** (text, file names, package names, env vars) | **You or Agent Team** | Can be done by search-replace and file renames in this repo; see checklist below. |

So: **you** must do the GitHub repo rename and, if you want, the **local folder** rename. Everything **inside** the repo (docs, code, app name, env vars, script names, workflow names, macOS app display name) can be done by you or by the Agent Team from this checklist.

---

## Checklist (in-repo and related)

### 1. Documentation (all `.md` in repo root and `docs/`)

- [ ] Replace `{sentinelsquad}` with `{sovereign}` in all docs.
- [ ] Replace “sentinelsquad” / “SentinelSquad” / “SENTINELSQUAD” with “sovereign” / “Sovereign” / “SOVEREIGN” where it refers to the product (not e.g. “Sentinel Squad” as a team concept if you keep that phrase).
- [ ] Update any absolute path like `/Users/.../sentinelsquad` to `/Users/.../sovereign` (or use a placeholder “repo root”).
- [ ] Rename files if they contain the old brand: e.g. `SENTINELSQUAD_DELIVERY_ROADMAP.md` → `SOVEREIGN_DELIVERY_ROADMAP.md`, `sentinelsquad-product.md` → `sovereign-product.md`.

### 2. Repo and folder names

- [ ] **GitHub:** Rename repo to `sovereign` (you).
- [ ] **Local folder:** Rename project folder to `sovereign` (you); update docs that reference the path.
- [ ] **App directory:** Decide whether `apps/sentinelsquad` becomes `apps/sovereign`. If yes, update all references (imports, scripts, workflows, Docker, paths in docs).

### 3. Package and app names

- [ ] Root `package.json`: `name` and any “sentinelsquad” in scripts or references.
- [ ] `apps/sentinelsquad/package.json`: `name` (e.g. `sovereign-app` or `sovereign`); app display name / title.
- [ ] `tools/theia-desktop/package.json` and electron app: product name.
- [ ] Any other `package.json` that references “sentinelsquad”.

### 4. Environment variables and config

- [ ] `.env.example` and docs: e.g. `SENTINELSQUAD_*` → `SOVEREIGN_*` (or keep prefix for compatibility and document both).
- [ ] Launcher and scripts that read `SENTINELSQUAD_*`: update or support both during transition.
- [ ] Default login email / app name strings (e.g. `dev@sentinelsquad.local` → `dev@sovereign.local` or keep).

### 5. Code (TypeScript/JavaScript)

- [ ] Comments and user-facing strings: “sentinelsquad” / “SentinelSquad” → “sovereign” / “Sovereign”.
- [ ] Log messages, error messages, UI copy.
- [ ] Internal identifiers: only if they are part of the “product name” surface (e.g. app title); avoid renaming DB enum values or API paths unless you version them.

### 6. Scripts and shell

- [ ] Script names: e.g. `sentinelsquad-*.sh` / `.js` → `sovereign-*.sh` / `.js`; update any caller (workflows, other scripts).
- [ ] Inside scripts: replace sentinelsquad/SentinelSquad/SENTINELSQUAD with sovereign/Sovereign/SOVEREIGN (paths, env vars, log text).
- [ ] `scripts/sentinelsquad-defaults.env` → `scripts/sovereign-defaults.env` (and references).

### 7. GitHub workflows (`.github/workflows/`)

- [ ] Workflow file names: e.g. `sentinelsquad-*.yml` → `sovereign-*.yml` (and any references to workflow names).
- [ ] Job/step names and env vars inside workflows.
- [ ] Repo references: after repo rename, `moldovancsaba/sentinelsquad` → `moldovancsaba/sovereign` (or new org/repo).

### 8. macOS app and launchers

- [ ] Display name: “SentinelSquad” → “Sovereign” (or “{sovereign}”) in menus and window title.
- [ ] Bundle identifier: decide whether to change (e.g. `com.sentinelsquad.*` → `com.sovereign.*`); changing affects install path and upgrades.
- [x] **Desktop:** `SovereignDesktop/` is canonical; `SentinelSquadDesktop/install_*.sh` delegates. **Menubar:** `SovereignMenubar/` + `install_SovereignMenubar.sh`; legacy `SentinelSquadMenubar/install_*.sh` delegates.
- [x] `tools/launchd/com.sovereign.plist`: template uses `com.sovereign` label and `sovereign-daemon.sh` (legacy `com.sentinelsquad.plist` removed from tree).
- [x] Launcher scripts (`Launch Sovereign.command`, `Open Sovereign Workspace.command`): title and internal paths.

### 9. Data and runtime paths

- [ ] `.sentinelsquad` directory (e.g. under app or home): decide keep (compatibility) or rename to `.sovereign`; document and update scripts that reference it.
- [ ] Prisma: no schema rename required for “sentinelsquad” unless you have explicit product-name columns; DB name can stay.

### 10. Issue templates and board

- [ ] `.github/ISSUE_TEMPLATE/*.yml`: replace sentinelsquad with sovereign in labels or body.
- [ ] mvp-factory-control: optionally rename labels `{sentinelsquad}` → `{sovereign}` and update issue titles; link to this doc.

### 11. Docker and external references

- [ ] `docker-compose.yml`: service names, image names, env vars.
- [ ] Any external docs or links that point at repo or app name; update after repo rename.

---

## Safe order of operations

1. **Decide** app directory rename: `apps/sentinelsquad` → `apps/sovereign` or not (affects many imports and scripts).
2. **Branch** for rename (e.g. `chore/rename-to-sovereign`).
3. **In-repo renames:** Apply checklist above (docs, code, scripts, workflows, macOS display name). Run `npm run verify` and tests after each logical chunk.
4. **Rename GitHub repo** (you); update `git remote` in clones.
5. **Rename local folder** (you) if desired; update any absolute paths in docs.
6. **Deploy/install:** Reinstall macOS app if bundle id or paths changed; restart services if launchd plist renamed.

---

## Can you do the rename, or do you need the Agent Team?

- **You can do it:** Yes. Use this checklist; search-replace and file renames; run verify and tests.
- **Agent Team can do it:** Yes. The same checklist can be executed by an agent (or you) in-repo. The only steps that **must** be done by you are: (1) renaming the GitHub repository, (2) renaming your local folder if you want it to match, (3) any renames in **other** repos (e.g. mvp-factory-control labels).

If you want the Agent Team to perform the in-repo rename, say “apply the rename checklist in RENAME_TO_SOVEREIGN” and we’ll do the edits and file renames; you then do repo and folder renames and validation on your side.

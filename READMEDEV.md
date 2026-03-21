# READMEDEV

This file is the developer operating guide for the `{sovereign}` product repository.

Apply the rulebook now. Re-run Start-of-session ritual steps 1–3 and answer with the Objective + Acceptance Criteria + Applicable Gates + SSOT status note before continuing any implementation.

You are an AI Developer Agent. The user is the Product Owner (PO). You have permission to modify/create/delete any project files, but you MUST NOT make autonomous assumptions. When anything material is unclear, stop and ask the PO.

---

## What This Repository Is

This repository is the product codebase for `{sovereign}`.

It is not the `mvp-factory-control` repository.

Use this repository for:

- product implementation
- product architecture
- operator docs
- contributor docs
- local runtime and desktop-launch work

The GitHub project board in `mvp-factory-control` remains the delivery SSOT, but this repo is the engineering truth for `{sovereign}` implementation details.

**SSOT for delivery:** [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md) — canonical LLD issues #437–#446, order, and checklist.

---

## Required Reading Order

1. [README.md](README.md)
2. [CONTRIBUTING.md](CONTRIBUTING.md)
3. [HANDOVER.md](HANDOVER.md)
4. [docs/WIKI.md](docs/WIKI.md)
5. [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md)
6. [docs/architecture/0001-theia-desktop-foundation.md](docs/architecture/0001-theia-desktop-foundation.md)
7. [docs/architecture/0002-rock-solid-open-source-hardening.md](docs/architecture/0002-rock-solid-open-source-hardening.md)
8. [docs/SOVEREIGN_DELIVERY_ROADMAP.md](docs/SOVEREIGN_DELIVERY_ROADMAP.md)

---

## Rulebook (mandatory)

================================================================================
1) NON-NEGOTIABLES (MANDATORY) ✅
================================================================================
A) SSOT DISCIPLINE
- The project board SSOT is [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md). LLD work maps to issues #437–#446 in mvp-factory-control.
- All work must map to an SSOT issue/card. If no card exists, request/confirm one before continuing.
- Keep SSOT updated continuously (see cadence below).

B) DOCUMENTATION = CODE (ABSOLUTE)
- Docs must match the real system state with the same rigor as code.
- NO placeholders, NO "TBD", NO filler, NO unverified claims.
- Every logic/file/feature update triggers immediate doc review + update AS YOU WORK (not at the end).
- "If it's not documented, it's not done."

C) QUALITY & SAFETY GATES
- Builds must be warning-free, error-free, deprecated-free.
- Minimal dependencies: do not add packages unless PO explicitly approves (see dependency workflow).
- No secrets/tokens/keys/personal data in code, commits, logs, or docs.

D) EVIDENCE ("PROVE IT")
- Provide commands run + concise outputs/observations for validation.
- Always cite file paths for changes.

================================================================================
2) ACCEPTED ✅ / PROHIBITED ❌
================================================================================
ACCEPTED ✅
- Small, reversible edits; minimal blast radius; clear rollback path.
- Incremental commits when it reduces risk and improves traceability.
- Explicit uncertainty + targeted PO questions.
- Presenting options with trade-offs when PO constraints are missing.

PROHIBITED ❌ (Hard stops)
- Autonomous assumptions (requirements, priority, architecture, env, deploy steps).
- Placeholder docs or invented details ("it should work", "probably").
- Creating competing planning files (task.md, ROADMAP.md, IDEABANK.md, etc.) that conflict with SSOT.
- Adding deps/framework changes without explicit PO approval.
- Marking "Done" without passing DoD + updating SSOT + updating docs.

================================================================================
3) START-OF-SESSION RITUAL (MANDATORY) ✅
================================================================================
Before changing anything:
1) Sync working context
- Pull latest / sync branch state (if applicable).
- Read: [HANDOVER.md](HANDOVER.md), [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md), and the active SSOT issue/card.
- To see LLD issues on the board: open [SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md) §4 for issue links (#437–#446).
2) Establish the contract (write it explicitly)
- Objective (1–2 lines)
- Acceptance criteria (bullets)
- Applicable gates (build/test/lint/security)
3) Set SSOT status
- Move selected card to "In Progress" (or note in SSOT §4).
- Add a short start note: objective + planned approach.

If any of the above cannot be done, state exactly what is missing and ask the PO.

================================================================================
4) SSOT BOARD CADENCE (ENFORCED BEHAVIOUR) ✅
================================================================================
Update SSOT at these moments (minimum):
- Start of work (move to In Progress + start note).
- Any blocker (move to Blocked + blocker + next attempt).
- After each meaningful milestone (short progress note).
- Before ending a session (status + evidence + next steps).
- When Done (move to Done + acceptance + validation evidence).

================================================================================
5) STOP CONDITIONS (ASK PO — DO NOT PROCEED) 🛑
================================================================================
Stop and ask the PO if ANY of these are true:
- Acceptance criteria ambiguous or conflicting.
- You need a new dependency, version bump, stack change, or major refactor.
- You touch auth/security/privacy, user data, billing, permissions, or storage.
- Schema migrations, destructive operations, or irreversible changes are involved.
- Deployment steps are unclear or environment differs from docs.
- Any instruction conflicts with SSOT or existing docs.

================================================================================
6) DEFINITION OF DONE (DoD) ✅
================================================================================
To mark a card "Done", ALL must be true:
1) Scope & acceptance — Restate acceptance criteria and confirm each is satisfied.
2) Quality gates — Build passes; tests pass (relevant scope); lint/format passes if present; no new warnings/errors/deprecations.
3) Hygiene — Minimal, coherent changes; safe defaults; no secrets; dependencies unchanged unless explicitly approved + documented.
4) Evidence & documentation — What changed / where / how validated / results. Update [HANDOVER.md](HANDOVER.md). Update RELEASE_NOTES only if something is actually shipped. Update SSOT with Done + evidence note.

================================================================================
7) SHIPPING / RELEASE NOTES RULE ✅
================================================================================
"Shipped" must be explicitly defined by the PO or existing docs (e.g., merged to main, deployed).
- Only write RELEASE_NOTES entries for verified shipped changes.
- No speculation, no future tense.
If "shipped" definition is unclear, ask PO before editing RELEASE_NOTES.

================================================================================
8) COMMIT / PR HYGIENE ✅
================================================================================
- Commits must reference the SSOT issue/card (ID or link) when possible.
- Commit messages must be descriptive and scoped (no "fix stuff").
- PR description (if applicable): Objective, summary of changes, validation evidence, risks/rollbacks.

================================================================================
9) DEPENDENCY WORKFLOW (STRICT) ✅
================================================================================
Before adding/upgrading any dependency:
- Provide to PO: WHY needed, alternatives, maintenance health, security posture, impact (bundle/runtime), exact package/version.
- Wait for explicit PO approval.
- After approval: run audit/security checks if available; document change + rationale.

================================================================================
10) DOCUMENTATION TARGETING (WHAT TO UPDATE WHEN) ✅
================================================================================
When you change:
- System behaviour/architecture → docs/ARCHITECTURE or relevant ADR; [docs/SOVEREIGN_MASTER_PLAN_AND_LLD.md](docs/SOVEREIGN_MASTER_PLAN_AND_LLD.md) if scope changes.
- Board/SSOT/delivery → [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md), [docs/SOVEREIGN_DELIVERY_PLAYBOOK.md](docs/SOVEREIGN_DELIVERY_PLAYBOOK.md).
- Running/setup/dev workflow → [README.md](README.md), [docs/BUILD_AND_RUN.md](docs/BUILD_AND_RUN.md), [docs/SETUP.md](docs/SETUP.md).
Always keep [HANDOVER.md](HANDOVER.md) current.

================================================================================
11) EVIDENCE TEMPLATE (STANDARD OUTPUT) ✅
================================================================================
Whenever you claim progress or completion:
- Command(s):
- Expected:
- Actual:
- Notes (incl. failures + fixes):
- Files changed (paths):

================================================================================
12) ALIAS "70" (CONTEXT THRESHOLD TRIGGER) ✅
================================================================================
"70" is a hard trigger meaning you are approaching ~70% context/token usage.
Trigger when:
- PO types "70", OR
- you judge the conversation is getting long/complex (err on triggering early).

When triggered, you MUST execute the 70 PROTOCOL immediately before doing anything else.

================================================================================
13) 70 PROTOCOL (MANDATORY HANDOVER SEQUENCE) ✅
================================================================================
A) SSOT UPDATE (NOW)
- Set correct status (In Progress / Blocked / Done) in [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md) §4 or on the board.
- Add a concise note: completed / in progress / blockers / next steps / key file paths / PR/commit refs if any.

B) UPDATE [HANDOVER.md](HANDOVER.md) (NOW)
Append an entry (no history rewriting unless correcting false info). Include:
- Timestamp (local) + agent label
- Branch + last commit hash (if known)
- Objective (1–2 lines)
- What changed (bullets)
- Files touched (bullets with paths)
- Validation (commands + results)
- Known issues/risks/follow-ups
- Immediate next actions (ordered list)

C) UPDATE RELEASE_NOTES (ONLY if shipped)
- Only verified shipped changes per rule #7.

D) OUTPUT "NEXT AGENT PROMPT PACKAGE" (IN YOUR ANSWER)
Your answer MUST contain:
1) Checklist confirming A/B/C done (or what could not be done + why).
2) A single fenced code block titled "NEXT AGENT PROMPT" with:
   - Read HANDOVER.md and docs/SOVEREIGN_PROJECT_BOARD_SSOT.md first
   - Current objective + explicit next actions
   - Validation commands
   - SSOT board link: [SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md) (issues #437–#446)

================================================================================
14) END-OF-SESSION RITUAL (ALWAYS, EVEN WITHOUT "70") ✅
================================================================================
Before you stop/respond with "done for now":
- SSOT updated (status + note).
- HANDOVER.md appended with current truth.
- Validation evidence provided (or explicitly unavailable).
- Clear next step stated (1–3 bullets).

================================================================================
15) NORMAL UPDATE FORMAT (NON-70) ✅
================================================================================
- Objective / Card
- What I did
- What I'm doing next
- Risks / blockers (or "None")
- Evidence (template #11)
- SSOT update (status + note)

---

## Architecture Truth

The recommended delivery stack is:

- Eclipse Theia Desktop
- Electron
- TypeScript
- Node.js
- PostgreSQL
- Prisma
- `pgvector`
- Ollama
- MLX
- launchd
- custom `{sovereign}` orchestration, memory, and tool policy layers

GitHub is for source hosting and collaboration. It is not required for the local runtime path.

## Current Implementation Truth

Do not treat the target stack as fully shipped.

Implemented baseline:

- Next.js app is still the primary product UI
- native macOS wrapper is the primary packaged launch path
- Ollama-first runtime is real
- managed worker and launchd path are real
- unified multi-agent chat is real
- project sessions and thread events are real
- durable project memory is at foundation stage only
- local backlog API + Kanban UI (read-only) + worker backlog tools + MCP backlog server (stdio)
- final-judgement (JUDGE) semantics in transcript + escalation

Target architecture not yet fully shipped:

- Theia as the primary shell
- MLX as a first-class runtime path
- OpenClaw adapter
- `pgvector` retrieval and curated memory workflows

## Developer Flow

1. Start DB.
2. Prepare `.env`.
3. Install dependencies and run Prisma.
4. Start the local app.
5. Start the local worker.
6. Verify a fresh `@Controller` task in chat if your change affects runtime behavior.

Canonical commands live in:

- [docs/BUILD_AND_RUN.md](docs/BUILD_AND_RUN.md)
- [docs/SETUP.md](docs/SETUP.md)

## Documentation Rule

If you change:

- architecture
- startup flow
- runtime provider behavior
- memory behavior
- desktop app launch behavior
- operator workflow

then update the relevant docs in the same change.

Use these labels in docs when needed:

- `Implemented now`
- `Partially implemented`
- `Target architecture`

## Boundaries

- Do not reintroduce GitHub board assumptions into local runtime surfaces.
- Do not treat browser-first design as the default path.
- Do not couple orchestration logic directly to a provider-specific API if a provider abstraction is expected.
- Do not hide startup truth inside scripts without matching docs.

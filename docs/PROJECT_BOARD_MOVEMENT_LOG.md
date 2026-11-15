# Project board review and manual movement / Scrum journal

Reviewed: 2026-11-15 UTC. Repository: moldovancsaba/sovereign.

Canonical board: [project board](https://github.com/users/moldovancsaba/projects/39). **The board is the owner's source of truth and is read-only. Never add, remove, reorder or move cards or edit project fields.** This file records observations and conditional proposals for manual owner decisions only.

## Verified coverage and limitations

- Repository collection: 23 entries, including 17 issues and 6 pull requests; 0 issues are open.
- Board: all 0 returned items were read; totalCount matches the captured item count.
- Linked issue-state / Done-status discrepancies: 0. Open issues absent from this board snapshot: 0. Absence here does not prove absence from every board and does not authorize creating a card.
- Exact title-and-body duplicate groups among open issues: 0. Similar titles alone were not treated as duplicates.
- Issue and board reads succeeded. No access failure was observed for these captured collections. No board write was attempted.
- This is a documentation-only review. No runtime suite, production flow, user data mutation, external message, dependency upgrade or deployment action was performed. Source presence and previous Done status are not fresh acceptance evidence.

## Source observations and work clusters

All 17 repository issues are closed. This is tracking state, not a fresh proof of runtime availability or desktop acceptance. Historical Trinity/API/auto-staffing items #1–#16 must be interpreted against the current README's governed Python DAG transition; do not resurrect retired implementations merely to satisfy old names. The active orchestrator has an explicit node registry, payload validation and failure handling. Its own infrastructure-failure comment still describes exponential backoff as future work; a closed historical retry ticket is not proof that this current path implements it.

Theia ADR 0001 is accepted target architecture and explicitly partially implemented; hardening ADR 0002 has mixed implementation state. README LIVE claims do not replace fresh startup, approval-policy, failure recovery and target-machine evidence. Preserve local-first operation, PostgreSQL persistence, fail-closed roles/project identity and explicit high-risk human approvals. A generic agent framework or newer model may be evaluated as an adapter, but cannot replace governance, evaluator correctness, project-scoped memory or audit requirements.

#22/#23 record installer and Docker-portability work. Their closed state is retained; this docs-only pass did not launch Docker, install macOS sentinels, call providers, run migrations or send Discord messages. Contributor runtime verification applies when product code changes; this pass changes documentation only. Architecture/startup docs contain historical layers and different completion language; reconcile against current execution paths before selecting a modernization implementation.

Inspected sources: [README.md](../README.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [package.json](../package.json), [docs/ARCHITECTURE_OVERVIEW.md](../docs/ARCHITECTURE_OVERVIEW.md), [docs/architecture/0001-theia-desktop-foundation.md](../docs/architecture/0001-theia-desktop-foundation.md), [docs/architecture/0002-rock-solid-open-source-hardening.md](../docs/architecture/0002-rock-solid-open-source-hardening.md), [apps/sovereign/scripts/sovereign_dag/orchestrator.py](../apps/sovereign/scripts/sovereign_dag/orchestrator.py). Documentation paths and register coverage were checked before publication. No new technology is selected or installed by this assessment.

## Per-card review register

A destination is a proposal, never an executed move. Historical closed cards stay historical; migrated or not-planned closures do not prove feature delivery. Open work remains subject to its issue's acceptance criteria and owner decision.

| Issue / card | Title | Issue state / reason | Observed current column | Proposed destination / next evidence | Owner decision / manual execution |
| --- | --- | --- | --- | --- | --- |
| None | Empty board / no open repository issue | Not applicable | Empty observed | No move proposed | No action / not executed |

## Append-only Scrum / manual movement journal

| Date / Scrum reference | Board and issue | Verified current column | Proposed destination | Evidence / rationale | Dependency / blocker | Owner decision | Manual execution / person | Verified new column | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 review | Board and issues above | Snapshot above | No automatic move | Recorded source/issue/board review | See unresolved requirements | Pending | Not executed | Snapshot only | Preserve history |
| YYYY-MM-DD / meeting link | Board URL + issue URL | Exact observed value | Exact proposed value or remain | Acceptance link | Specific condition | Pending | Not executed | Not verified | — |

Read the issue and actual board before each future proposal. Retain previous observations when a decision changes. Record execution only after the owner performs it and the result is read back. Documentation rollback requires no product or board rollback.

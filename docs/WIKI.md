# Wiki

This is the navigation hub for `{sovereign}` documentation.

## Start Here

- [../README.md](../README.md)
- [../READMEDEV.md](../READMEDEV.md)
- [../CONTRIBUTING.md](../CONTRIBUTING.md)

## Contract and Plan (sovereign)

- [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) — unbreakable contract between PO and Agent Team
- [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) — what to do, when, LLD issues for mvp-factory-control
- [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) — **SSOT for delivery + board**: LLDs (#437–#446), extended (#432, #433, #436), hybrid PO [#447](https://github.com/moldovancsaba/mvp-factory-control/issues/447), **§3.2** how to deliver, **§3.3** reconciling drift
- [SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md) — ready-to-paste issue title + body for each LLD (mvp-factory-control)
- [SOVEREIGN_DELIVERY_PLAYBOOK.md](SOVEREIGN_DELIVERY_PLAYBOOK.md) — one-page delivery rhythm: phases, sprint steps, when to update which doc
- [RENAME_TO_SOVEREIGN.md](RENAME_TO_SOVEREIGN.md) — product rename checklist (sentinelsquad → sovereign)
- [HLD_FEEDBACK_AND_GAP_ANALYSIS.md](HLD_FEEDBACK_AND_GAP_ANALYSIS.md) — old HLD vs current design, gaps, feedback
- [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md) — pipeline IDEABANK→DONE, triage mapping, time language (sooner/later/now)

## Architecture

- [architecture/0001-theia-desktop-foundation.md](architecture/0001-theia-desktop-foundation.md)
- [architecture/0002-rock-solid-open-source-hardening.md](architecture/0002-rock-solid-open-source-hardening.md)
- [architecture/0003-local-backlog-and-po-experience.md](architecture/0003-local-backlog-and-po-experience.md)
- [architecture/0004-memory-pgvector-embedding.md](architecture/0004-memory-pgvector-embedding.md)
- [architecture/theia-upstream-and-future-proof.md](architecture/theia-upstream-and-future-proof.md)
- [architecture/HYBRID_ORCHESTRATOR_SPEC_V1.md](architecture/HYBRID_ORCHESTRATOR_SPEC_V1.md) — hybrid orchestrator v1 (fixed weights + UCGS; implementation in `apps/sovereign/src/lib/hybrid-orchestrator`)
- [SOVEREIGN_DELIVERY_ROADMAP.md](SOVEREIGN_DELIVERY_ROADMAP.md)

## Operator And Setup Docs

- [SETUP.md](SETUP.md)
- [BUILD_AND_RUN.md](BUILD_AND_RUN.md)
- [setup/WIKI_SELF_HOSTED.md](setup/WIKI_SELF_HOSTED.md) — optional BookStack or Outline wiki (LLD-007), MCP docs, batch ingest
- [runbooks/getting-started.md](runbooks/getting-started.md) — operator runbook (also exposed as MCP resource `doc://runbooks/getting-started`)
- [GENERAL_KNOWLEDGE.md](GENERAL_KNOWLEDGE.md)
- [OBSOLETE_AND_LEFTOVER_AUDIT.md](OBSOLETE_AND_LEFTOVER_AUDIT.md) — legacy paths, rename candidates, compat identifiers (SentinelSquad leftovers)

## Standards And Shared Guidance

- [CODING_STANDARDS.md](CODING_STANDARDS.md)
- [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md)
- [RULES.md](RULES.md)
- [AGENT_PROMPTS.md](AGENT_PROMPTS.md)
- [EXECUTABLE_PROMPT_PACKAGE.md](EXECUTABLE_PROMPT_PACKAGE.md)

## Product Context

- [projects/sovereign-product.md](projects/sovereign-product.md)
- [GENERAL_KNOWLEDGE.md](GENERAL_KNOWLEDGE.md)

## Documentation Use Rule (how to use these docs)

| Need | Document(s) |
|------|-------------|
| **Law** — invariants, obligations, change process | [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) |
| **Plan** — what we do, when, deliverable issues (LLD) | [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) |
| **Project board SSOT** — canonical issues, order, mapping to mvp-factory-control | [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) |
| **Delivery rhythm** — phases, sprint steps, when to update which doc | [SOVEREIGN_DELIVERY_PLAYBOOK.md](SOVEREIGN_DELIVERY_PLAYBOOK.md) |
| **Issue template** — ready-to-paste bodies for mvp-factory-control | [SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md) |
| **Product board** — backlog pipeline, triage (IDEABANK/CRITICAL), time language (sooner/later/now) | [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md) |
| **Architecture** — ADRs, Theia, local backlog, hardening | [architecture/](architecture/) |
| **Operator truth** — what is implemented, how to run | `README.md`, `BUILD_AND_RUN.md`, `SETUP.md`, `HANDOVER.md` |
| **Hygiene / leftovers** — obsolete names, safe vs risky cleanup | [OBSOLETE_AND_LEFTOVER_AUDIT.md](OBSOLETE_AND_LEFTOVER_AUDIT.md) |
| **Delivery phases** | [SOVEREIGN_DELIVERY_ROADMAP.md](SOVEREIGN_DELIVERY_ROADMAP.md) |
| **What the product is** | Product docs; brand is `{sovereign}` |
| **Implementation discipline** | CODING_STANDARDS, UI_UX_STANDARDS, RULES, AGENT_PROMPTS, EXECUTABLE_PROMPT_PACKAGE |

# UI/UX solution-first facelift — plan

**Status:** In progress (Phases 1–3 baseline in repo)  
**Related:** [DESIGN_SYSTEM_V1.md](DESIGN_SYSTEM_V1.md), [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md), [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)

## 1. North star

- **Primary surface:** operators achieve outcomes in **Chat** (and secondarily **Backlog** / **IDE** when tied to work).
- **Default cognitive load:** avoid a global “control panel” feel on every screen; **health and blockers** stay glanceable, **knobs** stay secondary.
- **Settings and fine-tuning** are **deliberately secondary**: grouped and opened from an **app menu**, not from nine equal top-nav items.

**Product line:** *Do the job first; tune the machine when you need to.*

## 2. Target information architecture

| Tier | Purpose | Routes (conceptual) |
|------|---------|---------------------|
| **Work** | Daily execution | Chat, Backlog, IDE |
| **Observe** | Status | Dashboard |
| **Plan / registry** | Longer-lived context | Products, Issues |
| **System (menu)** | Configuration & tooling | Settings, Agents, Run, Orchestration (Nexus) |

## 3. Navigation model

**Primary bar (minimal):**

- **Chat** — default work surface  
- **Backlog**  
- **Dashboard**  
- **IDE**

**App menu (header):** secondary destinations and tuning:

- **Agents & runtime** → `/agents`  
- **Products** → `/products`  
- **Run & diagnostics** → `/run`  
- **Orchestration** → `/nexus` (benchmark / role mapping; UI label ≠ URL)  
- **Settings** → `/settings`

**Mobile:** same primary row where space allows; **Menu** remains in the header for secondary links.

**Future (optional):** command palette (`⌘K`), deeper `/settings/*` split, slide-over for quick toggles.

## 4. Settings & fine-tuning (“behind the screen”)

- **Hub** at **`/settings`** (overview) with **section nav** and sub-routes:
  - **`/settings/workspace`** — local project folder
  - **`/settings/preferences`** — taste rubric
  - **`/settings/safety`** — shell access + command policy
  - **`/settings/about`** — storage, agents/products shortcuts
- **Fine-tuning** for models/endpoints/worker stays on **`/agents`**; entry from **Menu → Agents & runtime** and **Settings → About**.
- **Chat** stays transcript-first.

**Later:** optional slide-over for quick toggles; command palette deep links to a section.

## 5. Shell variants

- **`standard`:** full page title + subtitle (`ds-page-head`) — Dashboard, Settings, Agents, etc.  
- **`work`:** minimal chrome under the header — used for **Chat** to maximize vertical space and reinforce “solution first”.

## 6. Visual / design system

- Reuse **`ds-*`** tokens and components; extend [DESIGN_SYSTEM_V1.md](DESIGN_SYSTEM_V1.md) when adding **menu** or **shell variant** patterns.
- Facelift passes (density, typography, empty states) are **Phase 4+** in this plan.

## 7. Phased delivery

| Phase | Goal | Status |
|-------|------|--------|
| **0** | Personas / journeys validation | Optional PO exercise |
| **1** | IA + navigation — App menu, slim primary nav, `Shell` `work` on Chat | **Done (baseline)** |
| **2** | Settings hub structure (sections / sub-routes) | **Done** — `/settings` overview + `/settings/workspace`, `preferences`, `safety`, `about` + `SettingsNav` |
| **3** | Agents UX grouping (tabs / clearer IA) | **Done (baseline)** — `/agents` + `?tab=roster\|runtime\|registry`, `AgentsNav`, shared `layout` |
| **4** | Facelift (Dashboard, Chat density, hierarchy) | **Done (baseline)** — Chat: tighter status strip, compact hint row, taller transcript; Dashboard: section headings (At a glance / Services & SLOs / Operator telemetry / Planning), tighter banners |
| **5** | A11y + e2e (menu → Settings) | **Partial** — App menu `aria-label`, focus moves to first item when opened; full e2e still optional |

## 8. Risks & mitigations

- **Discoverability:** keep a visible **Menu** control; optional first-run hint pointing to Settings / Agents.  
- **Power users:** restore quick paths later via keyboard shortcuts or pinned items if needed.

## 9. Success signals

- Faster path to first message in Chat.  
- Fewer accidental “settings hunting” clicks from the primary bar.  
- Qualitative feedback: “where is X?” resolves to Menu or Settings hub.

---

*Initiative brief; update this file as phases complete.*

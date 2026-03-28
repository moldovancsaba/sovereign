# Design System v1 — `{sovereign}`

**Version:** v1  
**Scope:** Web app under `apps/sovereign` (Next.js + Tailwind).

## How to tell it is active

- **`html` and `body`** carry the class **`design-system-v1`** (see `layout.tsx`) — check in DevTools → Elements.
- **Page titles** (under `Shell`) use a **thicker left accent bar** (`ds-page-head`, 3px, accent-tinted).
- **Cards** (`ds-card`) use a **soft drop shadow** + faint inner top highlight so panels lift off the gradient background.
- **Active nav item** (Chat) has a **soft accent glow** behind the pill.

Earlier refactors mainly **moved** the same colours into **tokens** and **`ds-*` classes**; the above cues are the intentional visible signature.

## Purpose

Define one **centralized UI system** for `{sovereign}` so pages share:

- one **token model** (color, typography, surfaces, semantic status)
- one **chrome model** (shell, navigation, page title block)
- one **implementation discipline** (extend shared patterns; avoid one-off full-page style systems)

This document is informed by the same design principles as [agent.meimei `design-system-v1.md`](https://github.com/moldovancsaba/agent.meimei/blob/main/design-system-v1.md): **single source per concern**, **documented tokens**, **predictable layout**, and **versioned evolution** — adapted to Sovereign’s stack (React / Next.js App Router, Tailwind CSS v4). **Implementation:** shared primitives live in **`apps/sovereign/src/app/globals.css`** as `:root` tokens and **`@layer components`** classes prefixed with **`ds-`**.

## Canonical sources of truth

| Concern | Location |
|--------|-----------|
| **Global tokens** (CSS custom properties) | [`apps/sovereign/src/app/globals.css`](../apps/sovereign/src/app/globals.css) — `:root` variables |
| **Tailwind entry** | Same file — `@import "tailwindcss"` |
| **App-wide layout chrome** | [`apps/sovereign/src/components/Shell.tsx`](../apps/sovereign/src/components/Shell.tsx) — header, primary nav, page title + subtitle, `main` width |
| **Product UX rules** (operator language, states, a11y) | [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md) |

**Rule:** New surfaces should use **`var(--*)` tokens** from `globals.css` where they express brand or semantic color — not unrelated hex/rgb literals — unless documenting an intentional exception here.

## Theme model (v1)

v1 ships a **single dark theme** on `body` (gradient + token-driven text). There is no `data-theme` switch yet.

Resolved tokens today:

| Token | Role |
|--------|------|
| `--bg0`, `--bg1` | Page / depth background (also used in shell header) |
| `--panel`, `--panel2` | Elevated surfaces (rgba whites) |
| `--stroke` | Borders / dividers |
| `--text`, `--muted` | Primary and secondary copy |
| `--good`, `--warn`, `--bad` | Success, caution, failure (use with non-color cues per [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md)) |
| `--accent` | Brand accent (titles, selection, highlights) |
| `--surface-card`, `--surface-deep`, `--surface-code`, `--surface-code-dense` | Card fills, dark panels, code / inset backgrounds |
| `--border-faint`, `--border-medium` | Header hairlines, control borders |
| `--shadow-elevated` | Prominent card shadow (e.g. sign-in) |
| `--font-sans`, `--font-mono` | Typography stacks |

**Future:** If multiple themes or operator “surfaces” are introduced, add a `data-theme` (or equivalent) contract in this file and extend `:root` / `[data-theme="…"]` in `globals.css` — same pattern as external reference repos.

## Core layout system

### Shell and page grid

- **Shell:** [`Shell.tsx`](../apps/sovereign/src/components/Shell.tsx) uses **`ds-shell-header`**, **`ds-main`**, **`ds-page-head`**, **`ds-page-title`**, **`ds-page-subtitle`**, and nav classes below. Inner rows still use Tailwind **`max-w-7xl`** where needed.
- **`variant="work"`:** skips the page title block and uses **`ds-main-work`** (tighter top padding) — for Chat / work-first surfaces. See [UI_UX_SOLUTION_FIRST_FACELIFT_PLAN.md](UI_UX_SOLUTION_FIRST_FACELIFT_PLAN.md).
- **App menu:** [`AppMenu.tsx`](../apps/sovereign/src/components/AppMenu.tsx) — secondary routes (Agents, Products, Run, Orchestration, Settings); primary nav stays Chat · Backlog · Dashboard · IDE.
- **Agents hub:** [`agents/layout.tsx`](../apps/sovereign/src/app/agents/layout.tsx) + [`AgentsNav.tsx`](../apps/sovereign/src/app/agents/AgentsNav.tsx) — tabs via **`?tab=`** (`roster` default, `runtime`, `registry`).
- **Page title block:** Implemented by **`ds-page-head`** + title/subtitle classes (accent border via `color-mix` on `--accent`).
- **Navigation:** **`ds-nav-item-active`** (Chat) and **`ds-nav-item`**; mobile row **`ds-shell-nav-mobile`** (hidden from **`1024px`** up via CSS).

### Inner page layout

- Prefer **responsive Tailwind grids** (`grid`, `gap-*`, `md:grid-cols-*`) for forms and dashboards **inside** `main`.
- Avoid inventing a second global grid system parallel to `Shell` (no duplicate full-viewport wrappers that ignore `max-w-7xl` without a documented reason).
- **Chat and transcript-heavy views** may use full-width internal layouts; still keep header chrome consistent via `Shell` (or a documented sibling layout component if one is introduced).

## Component vocabulary (v1) — `ds-*` classes

Defined in **`globals.css`** `@layer components`. Prefer these over re-stating the same Tailwind arbitrary values on new pages.

| Class | Use |
|--------|-----|
| **`ds-card`** | Default elevated card (`--stroke` + `--surface-card`). Add padding via utilities (`p-4`, `p-5`, …). |
| **`ds-panel-deep`** | Dark inset panel (`--surface-deep`) — IDE sections, Nexus panels. |
| **`ds-card-prominent`** | Combine with **`ds-card`** for **`--shadow-elevated`** (e.g. sign-in). |
| **`ds-inset`**, **`ds-inset-dense`** | Form fields, scrollable code / pre blocks (`--surface-code` / `--surface-code-dense`). |
| **`ds-well`** | Compact bordered well (e.g. backlog column). |
| **`ds-hint`** | Small muted hint strip; pair with **`mt-*`** as needed. |
| **`ds-tile`** | Clickable dark tile with hover (e.g. settings shortcuts); add **`block`** on links. |
| **`ds-pill-deep`** | Small rounded-full status pill on dark fill. |
| **`ds-nav-item`**, **`ds-nav-item-active`** | Shell navigation. |
| **`ds-shell-header`**, **`ds-shell-nav-mobile`**, **`ds-main`**, **`ds-page-head`**, **`ds-page-title`**, **`ds-page-subtitle`** | Shell layout. |
| **`ds-btn-secondary`**, **`ds-btn-secondary.ds-btn-compact`**, **`ds-btn-ghost`** | Primary sign-in actions, compact copy buttons, sign-out. |
| **`ds-status-local`** | Local session / environment chip in header. |
| **`ds-text-muted`** | Muted copy using **`--muted`**. |

**Tailwind on top:** Grids, spacing, responsive display, and semantic colors (e.g. amber warning callouts) remain valid alongside **`ds-*`**.

When the same **React structure** repeats on **three or more** pages, extract a **shared component** under `apps/sovereign/src/components/` and add a row to this table.

## Dynamic content and safety

- Prefer **React nodes** and **`textContent`-style data** over `dangerouslySetInnerHTML` for operator-supplied strings.
- If rich HTML is ever required, gate it behind an explicit security review and document the contract here.
- Use **class toggles** and conditional Tailwind for visibility (e.g. `hidden`, `lg:flex`) rather than imperatively mutating inline styles except for unavoidable cases (e.g. third-party widgets).

## New page checklist

1. Use **`Shell`** (or an existing documented layout) for title + nav consistency.
2. Use **`globals.css` tokens** for colors that express brand or semantics.
3. Reuse **`ds-*` classes** and tokens above, or extract a component if duplicated.
4. Meet **empty / loading / error** rules in [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md).
5. Verify **keyboard** and **contrast** for new interactive controls.
6. Update **this file** if you introduce a new token, layout region, or reusable component contract.

## Documentation and versioning

When you change tokens, shell chrome, or shared UI contracts:

1. Update **`docs/DESIGN_SYSTEM_V1.md`** (this file).
2. Update **[UI_UX_STANDARDS.md](UI_UX_STANDARDS.md)** if operator-facing behaviour or principles change.
3. If the repo adds **`CHANGELOG.md`**, record user-visible UI changes under **Unreleased**.
4. For notable releases, align **`apps/sovereign/package.json`** version and [HANDOVER.md](../HANDOVER.md) as per team practice.

## Release policy (semver for design)

- **Patch:** visual tweaks, contrast/spacing fixes, no new component contracts.
- **Minor:** new shared components, new tokens, new optional theme hooks — backward compatible for existing pages.
- **Major:** removal or rename of tokens/contracts that force wide refactors.

---

*External reference (principles, not copy-paste CSS): [agent.meimei design-system-v1.md](https://github.com/moldovancsaba/agent.meimei/blob/main/design-system-v1.md).*

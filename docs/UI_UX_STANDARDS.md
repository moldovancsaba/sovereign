# UI/UX Standards

These are the UI and UX standards for `{sentinelsquad}`.

## Product Context

`{sentinelsquad}` is an operator-facing desktop product for multi-agent work. The UI should feel like a serious local control surface for a team of AI workers, not like a toy chatbot and not like a generic admin dashboard.

## Core Principles

- Make the system state legible.
- Make the operator's next action obvious.
- Make agent identity and responsibility explicit.
- Make failures actionable.
- Remove filler, vanity UI, and vague control-plane language.

## Information Model

The UI should surface these concepts clearly:

- agents
- roles
- readiness
- runtime provider
- current model
- thread state
- task state
- tool execution state
- project session
- memory relevance

## Layout Rules

- The primary path should privilege unified chat and active work.
- Secondary controls should not obscure the current thread or agent state.
- Important system health indicators should be visible without opening a settings page.
- Desktop layouts should use space intentionally, not merely stretch web cards wider.

## Interaction Rules

- Empty states must tell the operator exactly what to do next.
- Loading states must distinguish between starting, waiting, degraded, and failed.
- Actions that trigger agent work must show what agent was selected and why.
- Tool execution and task transitions should appear in the transcript, not disappear into logs.

## Copy Rules

- Use direct product language.
- Avoid internal experimental names.
- Avoid unclear orchestration jargon unless the term is defined in-product.
- Prefer `Controller`, `Writer`, `Drafter`, `agent`, `runtime`, `memory`, and `project session` over vague platform language.

## Visual Rules

- Use a coherent design system with tokens and reusable primitives.
- Avoid placeholder polish that hides missing system clarity.
- Keep contrast, hierarchy, and spacing consistent.
- Distinguish informational, warning, and failure states clearly.

## Accessibility Rules

- keyboard navigation is required
- contrast must remain readable
- important state changes must not rely on color alone
- focus behavior must be predictable

## Quality Gate

UI work is not done unless:

- the operator can understand the current system state
- the next recommended action is visible
- degraded and failed states are understandable
- the interaction still works in the installed macOS app

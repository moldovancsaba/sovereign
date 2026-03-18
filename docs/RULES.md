# Rules

These are the operating rules for `{sentinelsquad}`.

## Product Rules

- `{sentinelsquad}` is a standalone product repository.
- Core product behavior must remain local-first.
- GitHub is optional for code hosting and collaboration, not a runtime dependency.
- User-facing language must describe the actual product clearly and directly.

## Architecture Rules

- One source of truth per concern.
- One durable persistence layer by default.
- One clear availability model for agents.
- One explicit project-session model for tool execution and memory scope.
- One transcript model for operator, agent, task, and tool events.

## Runtime Rules

- Local runtimes must degrade predictably when a model is unavailable.
- Agent startup must be explicit, observable, and recoverable.
- Tool execution must fail closed when policy or role rules are violated.
- Background services must not silently mask broken state.

## Documentation Rules

- Documentation must match the current product, not past experiments.
- Remove stale names, obsolete workflows, and dead links.
- Prefer fewer accurate docs over many overlapping docs.
- Installation and recovery docs are mandatory for major runtime changes.

## Engineering Rules

- No hidden coupling between UI, worker, and persistence.
- No ambiguous product naming.
- No legacy fallback path kept alive without a reason.
- No operator-facing feature should depend on undocumented setup.

## Completion Rules

- implementation is merged only when the behavior is verifiable
- docs are updated when operator behavior or architecture changes
- failures are observable and understandable
- the local macOS launch path still works

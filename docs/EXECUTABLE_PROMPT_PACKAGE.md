# Executable Prompt Package

Every `{sentinelsquad}` execution task should be detailed enough that a developer or agent can implement it without guessing the product intent.

## Required Sections

- Objective
- Product surface
- Current behavior
- Target behavior
- Dependencies
- Constraints
- Non-goals
- Implementation notes
- Acceptance criteria
- Validation
- Recovery or rollback notes

## Section Guidance

### Objective

State the concrete outcome, not a vague initiative label.

### Product surface

Name the exact area affected:

- desktop shell
- unified chat
- orchestration
- runtime/provider layer
- tool bridge
- project-session lifecycle
- memory/indexing
- packaging/install
- docs

### Current behavior

Describe the current broken or incomplete behavior with specifics.

### Target behavior

Describe what the operator should see or what the system should do when the task is complete.

### Dependencies

List upstream contracts or blocking work explicitly.

### Constraints

Call out local-first, macOS, open-source, persistence, security, or performance constraints.

### Non-goals

State what this task will not solve.

### Implementation notes

List expected code surfaces, data model changes, API contracts, and runtime boundaries.

### Acceptance criteria

Use verifiable statements, not vague aspirations.

### Validation

List the exact commands, scenarios, and manual checks required.

### Recovery or rollback notes

State how to undo or isolate the change if it fails.

## LLD Rule

`{sentinelsquad}` issues should be low-level design tasks, not abstract planning cards. A developer should be able to start implementation from the issue alone and know what done means.

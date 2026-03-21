# `{sovereign}` Theia Desktop Bootstrap

This workspace bootstraps the Eclipse Theia Desktop shell inside the `{sovereign}` repository.

It is intentionally isolated from the current Next.js app so we can build the desktop foundation without destabilizing the launchable app and worker path already in production.

## Scope

This package provides:

- an Electron-targeted Theia application shell
- core IDE surfaces needed for desktop delivery
- a stable in-repo location for future `{sovereign}`-native Theia extensions

This package does not yet replace the current `{sovereign}` web app. The existing app remains the source of truth for:

- agents
- threads and transcripts
- tasks and orchestration
- approvals and policy
- project sessions
- runtime routing

## Bootstrap

From the **repository root** (where `package.json` defines `desktop:*` scripts):

```bash
cd /path/to/sovereign
npm run desktop:bootstrap
```

## Build

```bash
cd /path/to/sovereign
npm run desktop:build
```

## Start

```bash
cd /path/to/sovereign
npm run desktop:start
```

## Next integration step

The next implementation step is to add a `{sovereign}` Theia extension that binds the shell to:

- the project-session registry
- unified multi-agent transcript views
- runtime/worker health
- command-center task actions

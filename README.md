# SentinelSquad

SentinelSquad is the product repository for the AI agentic unified chat, where multiple agents can chat, coordinate, and execute work together.

## Repository

- GitHub: [moldovancsaba/sentinelsquad](https://github.com/moldovancsaba/sentinelsquad)
- Local root: `/Users/moldovancsaba/Projects/sentinelsquad`
- Product app: [`apps/sentinelsquad`](/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad)
- Product version: `1.0.0` (from [`VERSION`](/Users/moldovancsaba/Projects/sentinelsquad/VERSION))

## Structure

```text
.
├── apps/
│   └── sentinelsquad/   # Next.js app, Prisma schema, worker, launcher scripts
├── docs/                # product and operating documentation
├── scripts/             # repo-level utility scripts
├── docker-compose.yml   # local Postgres and optional app container
├── package.json         # root developer entrypoint
└── README.md
```

## Quick start

1. Create local env:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
cp .env.example .env
```

2. Start the database from the repo root:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run db:up
```

3. Install app dependencies and generate Prisma client:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run install:app
npm run prisma:generate
```

4. Run migrations:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
npx prisma migrate dev
```

5. Start local development:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run dev
```

6. Open:

- App: `http://localhost:3007`
- Sign-in: `http://localhost:3007/signin`

## Launch modes

- Direct local development uses port `3007`.
- `docker-compose.yml` exposes the containerized app on `3577`.
- The app-level launcher scripts are available at `apps/sentinelsquad/scripts/launcher/Launch SentinelSquad.command` and `apps/sentinelsquad/scripts/launcher/Open SentinelSquad Workspace.command`.
- The macOS menubar app installer is available at `npm run menubar:install`.
- The launchd installer/status scripts are available via `npm run service:install`, `npm run service:status`, and `npm run service:uninstall`.
- The default local model preset is `Granite-4.0-H-1B`.
- First authenticated launch bootstraps `@Controller`, `@Drafter`, `@Writer`, and `@Gwen` as local agents.
- The launcher defaults to starting the `@Controller` worker so the squad has active execution coverage immediately.

## Environment

- App env template: [`apps/sentinelsquad/.env.example`](/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad/.env.example)
- For local bootstrap without GitHub OAuth, set:
  - `SENTINELSQUAD_DEV_LOGIN_EMAIL`
  - `SENTINELSQUAD_DEV_LOGIN_PASSWORD`

## Verification

From the repo root:

```bash
npm run verify
```

## Contributing

See [`CONTRIBUTING.md`](/Users/moldovancsaba/Projects/sentinelsquad/CONTRIBUTING.md).

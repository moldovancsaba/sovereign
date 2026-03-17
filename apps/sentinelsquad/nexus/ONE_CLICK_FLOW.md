# One-Click Flow (VSCodium + Roo + SentinelSquad + ChatDev)

## First time (one click)
Run:
- `npm run service:install`

This installs persistent background services (launchd):
- Ollama (`com.sentinelsquad.ollama`)
- SentinelSquad (`com.sentinelsquad.app`)
- MCP bridge remains on-demand from Roo settings

## Daily use (one click)
Run:
- `apps/sentinelsquad/scripts/launcher/Open SentinelSquad Workspace.command`

This opens:
- VSCodium on repo
- SentinelSquad chat (`/chat`)
- SentinelSquad operations panel (`/nexus`)

## In Roo chat
Use plain text:
- `@Controller run cell: build a secure python cli tool with tests`

No JSON required.

## Dashboard purpose
Use SentinelSquad dashboard only for:
- settings
- health checks
- logs/audit

Primary interaction stays in Roo chat.

## Uninstall
Run:
- `npm run service:uninstall`

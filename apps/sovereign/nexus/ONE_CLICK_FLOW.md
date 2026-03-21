# One-Click Flow (VSCodium + Roo + Sovereign + ChatDev)

## First time (one click)
Run:
- `npm run service:install`

This installs persistent background services (launchd):
- Ollama (`com.sovereign.ollama`; legacy installs may still show `com.sentinelsquad.ollama`)
- Sovereign app (`com.sovereign.app`)
- MCP bridge remains on-demand from Roo settings

## Daily use (one click)
Run:
- `apps/sovereign/scripts/launcher/Open Sovereign Workspace.command`

This opens:
- VSCodium on repo
- Sovereign chat (`/chat`)
- Sovereign operations panel (`/nexus`)

## In Roo chat
Use plain text:
- `@Controller run cell: build a secure python cli tool with tests`

No JSON required.

## Dashboard purpose
Use the Sovereign dashboard only for:
- settings
- health checks
- logs/audit

Primary interaction stays in Roo chat.

## Uninstall
Run:
- `npm run service:uninstall`

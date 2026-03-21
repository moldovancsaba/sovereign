# VSCodium + Roo + ChatDev (Chat-Only) Playbook

## Goal
Type one message in chat, get:
1. fast @Drafter spec,
2. @Writer dev-team output,
3. @Controller ACCEPT/DECLINE gate.

## Prerequisites
- Sovereign running on `http://localhost:3007`
- Ollama running on `http://127.0.0.1:11434`
- ChatDev cloned in `external/ChatDev` and `.venv` prepared
- MCP settings installed via `apps/sovereign/scripts/nexus/setup_mcp.sh`

## Start MCP bridge
```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
python3 scripts/nexus/mcp_server_py.py
```

## Single command from terminal
```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
bash scripts/nexus/run_cell.sh "Create a secure Python CLI benchmark tool"
```

## MCP action (for Roo chat tool call)
Use action:
```json
{"action":"cell.run","task":"Create a secure Python CLI benchmark tool"}
```

## Natural-language trigger (no JSON)
You can now send plain text lines to the MCP bridge:

```text
@Controller run cell: Create a secure Python CLI benchmark tool
```

Also supported:
- `run cell: <task>`
- `cell: <task>`
- `/cell <task>`

## Artifact
Result is saved to:
- `.sovereign/nexus/cell-last-run.json` (legacy: `.sentinelsquad/nexus/cell-last-run.json`)

Contains:
- Drafter spec markdown
- ChatDev run command/output
- Controller confidence + decision extraction

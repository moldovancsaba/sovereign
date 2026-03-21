# Nexus-OS Foundation (Sovereign)

This folder contains a zero-code baseline for a local autonomous development cell:

- `ChatChainConfig.json`: role chain and phase flow (`@Drafter -> @Writer -> @Controller`)
- `PhaseConfig.json`: strict role behavior contract
- `benchmarks.json`: model benchmark suite and role thresholds
- `agent_manager.py`: benchmark + hire/retire recommendation engine

## Quick start

```bash
cd apps/sovereign
./scripts/nexus/bootstrap.sh
python3 scripts/nexus/orchestrate.py --task "Build a Python model benchmarking tool"
```

## MCP bridge runner

Use the JSON-line bridge process:

```bash
cd apps/sovereign
python3 scripts/nexus/mcp_server_py.py
```

Then send line-delimited JSON requests:

```json
{"action":"seminar.run","task":"Create a secure Python CLI benchmark utility"}
{"action":"models.list"}
{"action":"benchmark.run","role":"@Writer","current_model":"deepseek-coder-v2","candidates":"deepseek-coder-v2,llama3:8b"}
```

## Strict role gate

The chain runner blocks invalid behavior:

- Drafter emits code-like output -> `STRICT_ROLE_VIOLATION`
- Writer runs without Drafter spec -> `STRICT_ROLE_VIOLATION`
- Controller omits confidence/decision semantics -> `STRICT_ROLE_VIOLATION`

## Notes

- This is local-first and Ollama-first by default (`OLLAMA_HOST` controls endpoint).
- `ChatChainConfig.json` supports `modelRouting` overrides per role.

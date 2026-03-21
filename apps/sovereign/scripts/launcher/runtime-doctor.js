#!/usr/bin/env node
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const {
  DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES,
  listInstalledLocalModels,
  selectInstalledModel
} = require("../lib/local-runtime");

async function main() {
  const endpoint = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim();
  const requestedModel = String(
    process.env.SENTINELSQUAD_WORKER_MODEL || process.env.OLLAMA_MODEL || "Granite-4.0-H-1B"
  ).trim();

  const installedModels = await listInstalledLocalModels({
    endpoint,
    timeoutMs: 5000,
    cacheTtlMs: 1000
  });

  const available = installedModels.length > 0;
  const resolvedModel = selectInstalledModel(
    requestedModel,
    installedModels,
    DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES
  );

  const summary = {
    provider: "ollama",
    endpoint,
    requestedModel,
    resolvedModel,
    available,
    installedModels
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!available) {
    process.stderr.write(
      `[runtime-doctor] No installed local models detected at ${endpoint}. Start Ollama and pull at least one supported model.\n`
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`[runtime-doctor] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

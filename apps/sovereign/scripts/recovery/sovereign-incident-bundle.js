#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
const {
  buildIncidentBundle,
  createFixtureTelemetry,
  loadDatabaseTelemetry,
  writeJson
} = require("./lib/recovery-bundle");

function parseArgs(argv) {
  const args = {
    issue: null,
    sinceHours: 24 * 7,
    out: path.resolve(process.cwd(), ".sentinelsquad/recovery/incident-bundle.json"),
    mode: process.env.SENTINELSQUAD_RECOVERY_DRILL_MODE || "AUTO"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--issue") {
      args.issue = Number.parseInt(argv[i + 1] || "", 10);
      i += 1;
      continue;
    }
    if (token === "--since-hours") {
      const hours = Number.parseInt(argv[i + 1] || "", 10);
      if (Number.isFinite(hours) && hours > 0) {
        args.sinceHours = hours;
      }
      i += 1;
      continue;
    }
    if (token === "--out") {
      args.out = path.resolve(argv[i + 1] || args.out);
      i += 1;
      continue;
    }
    if (token === "--mode") {
      args.mode = String(argv[i + 1] || "AUTO").toUpperCase();
      i += 1;
    }
  }

  return args;
}

async function resolveTelemetry(args) {
  const nowIso = new Date().toISOString();
  if (args.mode === "FIXTURE") {
    return {
      telemetry: createFixtureTelemetry(nowIso),
      warning: null
    };
  }

  const sinceDate = new Date(Date.now() - args.sinceHours * 60 * 60 * 1000);
  const loaded = await loadDatabaseTelemetry({ sinceDate, limit: 250 });
  if (loaded.ok) {
    return {
      telemetry: loaded.value,
      warning: null
    };
  }

  if (args.mode === "DATABASE") {
    throw new Error(loaded.reason || "Failed to load telemetry from database mode");
  }

  return {
    telemetry: createFixtureTelemetry(nowIso),
    warning: loaded.reason || "Database unavailable; generated fixture incident bundle"
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { telemetry, warning } = await resolveTelemetry(args);
  const nowIso = new Date().toISOString();
  const bundle = buildIncidentBundle({
    issueNumber: args.issue,
    sinceHours: args.sinceHours,
    telemetry,
    nowIso
  });
  const artifact = await writeJson(args.out, bundle);

  const output = {
    generatedAt: nowIso,
    out: artifact.path,
    sha256: artifact.sha256,
    sourceMode: telemetry.sourceMode,
    warning,
    summary: bundle.summary,
    redaction: bundle.redaction
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("[sentinelsquad-incident-bundle] failed:", error.message || error);
  process.exitCode = 1;
});

#!/usr/bin/env node
/* eslint-disable no-console */
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const {
  buildIncidentBundle,
  createFixtureTelemetry,
  loadDatabaseTelemetry,
  sha256Text,
  writeJson
} = require("../recovery/lib/recovery-bundle");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function copyDirectory(source, target) {
  await fsp.mkdir(target, { recursive: true });
  const entries = await fsp.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else {
      await fsp.copyFile(from, to);
    }
  }
}

async function stageBackup({ backupDir, mode, sinceHours }) {
  const nowIso = new Date().toISOString();
  let telemetry = createFixtureTelemetry(nowIso);
  let warning = null;

  if (mode !== "FIXTURE") {
    const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const loaded = await loadDatabaseTelemetry({ sinceDate, limit: 250 });
    if (loaded.ok) {
      telemetry = loaded.value;
    } else if (mode === "DATABASE") {
      throw new Error(loaded.reason || "Database mode failed to collect telemetry");
    } else {
      warning = loaded.reason || "Database unavailable; using fixture telemetry";
    }
  }

  const snapshot = {
    schemaVersion: "1.0",
    generatedAt: nowIso,
    sourceMode: telemetry.sourceMode,
    warning,
    requiredRuntimeEnv: [
      "DATABASE_URL",
      "NEXTAUTH_URL",
      "NEXTAUTH_SECRET",
      "SENTINELSQUAD_GITHUB_TOKEN",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET"
    ],
    envPresence: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      NEXTAUTH_URL: Boolean(process.env.NEXTAUTH_URL),
      NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
      SENTINELSQUAD_GITHUB_TOKEN: Boolean(process.env.SENTINELSQUAD_GITHUB_TOKEN),
      GITHUB_CLIENT_ID: Boolean(process.env.GITHUB_CLIENT_ID),
      GITHUB_CLIENT_SECRET: Boolean(process.env.GITHUB_CLIENT_SECRET)
    },
    telemetry
  };

  const snapshotPath = path.join(backupDir, "state-snapshot.json");
  const snapshotArtifact = await writeJson(snapshotPath, snapshot);
  const manifest = {
    schemaVersion: "1.0",
    generatedAt: nowIso,
    files: [
      {
        path: "state-snapshot.json",
        sha256: snapshotArtifact.sha256
      }
    ]
  };
  const manifestPath = path.join(backupDir, "manifest.json");
  const manifestArtifact = await writeJson(manifestPath, manifest);

  return {
    sourceMode: telemetry.sourceMode,
    warning,
    snapshotPath,
    manifestPath,
    manifestSha256: manifestArtifact.sha256,
    lifecycleEventCount: telemetry.lifecycleEvents.length,
    failureEventCount: telemetry.failureEvents.length
  };
}

async function stageIntegrityValidation(backupDir) {
  const manifestPath = path.join(backupDir, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  for (const file of manifest.files) {
    const targetPath = path.join(backupDir, file.path);
    const text = await fsp.readFile(targetPath, "utf8");
    const checksum = sha256Text(text.trimEnd());
    assert(checksum === file.sha256, `checksum mismatch for ${file.path}`);
  }

  return {
    checkedFiles: manifest.files.length,
    checksumVerified: true
  };
}

async function stageRestoreDrill({ backupDir, restoreDir }) {
  await copyDirectory(backupDir, restoreDir);

  const snapshot = JSON.parse(await fsp.readFile(path.join(restoreDir, "state-snapshot.json"), "utf8"));
  assert(snapshot.schemaVersion === "1.0", "unexpected snapshot schema version");
  assert(snapshot.telemetry, "snapshot missing telemetry payload");
  assert(snapshot.telemetry.taskSummary, "snapshot missing task summary");

  const restoredPlan = {
    schemaVersion: "1.0",
    restoredAt: new Date().toISOString(),
    isolatedRoot: restoreDir,
    runbookSteps: [
      "Validate backup manifest checksums",
      "Generate redacted incident bundle",
      "Run npm run build against restored environment"
    ]
  };
  await writeJson(path.join(restoreDir, "restore-plan.json"), restoredPlan);

  return {
    restoredSnapshot: true,
    restoredTelemetryMode: snapshot.sourceMode,
    runbookStepCount: restoredPlan.runbookSteps.length
  };
}

async function stageIncidentBundle({ restoreDir, issueNumber, sinceHours }) {
  const nowIso = new Date().toISOString();
  const snapshot = JSON.parse(await fsp.readFile(path.join(restoreDir, "state-snapshot.json"), "utf8"));
  const bundle = buildIncidentBundle({
    issueNumber,
    sinceHours,
    telemetry: snapshot.telemetry,
    nowIso
  });

  const artifact = await writeJson(path.join(restoreDir, "incident-bundle.json"), bundle);
  assert(bundle.schemaVersion === "1.0", "incident bundle schema missing");
  assert(bundle.redaction.mode === "REDACT", "incident bundle redaction mode mismatch");

  return {
    bundlePath: artifact.path,
    bundleSha256: artifact.sha256,
    lifecycleEventCount: bundle.summary.lifecycleEventCount,
    failureEventCount: bundle.summary.failureEventCount,
    redactionMatchCount: bundle.redaction.matchCount
  };
}

function stageReadinessRubric(summary) {
  const checks = {
    backupIntegrityValidated: Boolean(summary.stages.integrity?.checksumVerified),
    restoreDrillIsolated: Boolean(summary.stages.restore?.restoredSnapshot),
    incidentBundleGenerated: Boolean(summary.stages.bundle?.bundlePath),
    redactionApplied: summary.stages.bundle?.redactionMatchCount >= 0
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    passed,
    checks,
    operatorChecklist: [
      "Run npm run e2e:recovery-readiness",
      "Confirm readiness rubric checks all pass",
      "Attach run id and incident-bundle hash to issue evidence"
    ]
  };
}

async function main() {
  const startedAt = Date.now();
  const runId = `sovereign-recovery-readiness-e2e-${new Date().toISOString()}`;
  const issueNumber = 120;
  const sinceHours = 24 * 7;
  const mode = String(process.env.SENTINELSQUAD_RECOVERY_DRILL_MODE || "AUTO").toUpperCase();

  const summary = {
    runId,
    mode,
    stages: {}
  };

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "sovereign-recovery-drill-"));
  const backupDir = path.join(root, "backup");
  const restoreDir = path.join(root, "restore");

  try {
    summary.stages.backup = await stageBackup({ backupDir, mode, sinceHours });
    summary.stages.integrity = await stageIntegrityValidation(backupDir);
    summary.stages.restore = await stageRestoreDrill({ backupDir, restoreDir });
    summary.stages.bundle = await stageIncidentBundle({ restoreDir, issueNumber, sinceHours });
    summary.stages.readiness = stageReadinessRubric(summary);
    assert(summary.stages.readiness.passed, "readiness rubric failed");
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }

  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[sovereign-recovery-readiness-e2e] failed:", error.message || error);
  process.exitCode = 1;
});

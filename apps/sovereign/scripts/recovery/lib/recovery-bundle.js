const path = require("node:path");
const fsp = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { applyOutputDlp } = require("../../lib/output-dlp");

function sortByCreatedAtAsc(items) {
  return [...items].sort((a, b) => {
    const aa = String(a.createdAt || "");
    const bb = String(b.createdAt || "");
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function createFixtureTelemetry(nowIso) {
  return {
    sourceMode: "FIXTURE",
    capturedAt: nowIso,
    lifecycleEvents: [
      {
        id: "fixture-lifecycle-1",
        entityType: "TASK",
        entityId: "fixture-task-1",
        actorRole: "ALPHA",
        action: "RECOVERY_DRILL_FIXTURE",
        allowed: true,
        reason: "Fixture lifecycle event for deterministic recovery harness",
        metadata: { stage: "backup" },
        createdAt: nowIso
      }
    ],
    failureEvents: [
      {
        id: "fixture-failure-1",
        failureClass: "RECOVERY_DRILL",
        severity: "LOW",
        fallbackAction: "NONE",
        projectKey: "sovereign",
        projectName: "Sovereign",
        remediation: "No action required for fixture mode.",
        metadata: { fixture: true },
        createdAt: nowIso
      }
    ],
    taskSummary: {
      total: 1,
      done: 1,
      failed: 0,
      deadLetter: 0,
      manualRequired: 0
    }
  };
}

async function loadDatabaseTelemetry({ sinceDate, limit }) {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      reason: "DATABASE_URL is not configured"
    };
  }

  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch (error) {
    return {
      ok: false,
      reason: `Prisma client unavailable: ${error.message || String(error)}`
    };
  }

  const prisma = new PrismaClient();
  try {
    const [lifecycleEvents, failureEvents, taskRows] = await Promise.all([
      prisma.lifecycleAuditEvent.findMany({
        where: { createdAt: { gte: sinceDate } },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          actorRole: true,
          action: true,
          allowed: true,
          reason: true,
          metadata: true,
          createdAt: true
        }
      }),
      prisma.alphaFailureEvent.findMany({
        where: { createdAt: { gte: sinceDate } },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          failureClass: true,
          severity: true,
          fallbackAction: true,
          projectKey: true,
          projectName: true,
          issueNumber: true,
          taskId: true,
          threadId: true,
          remediation: true,
          metadata: true,
          createdAt: true
        }
      }),
      prisma.agentTask.findMany({
        where: { createdAt: { gte: sinceDate } },
        select: { status: true }
      })
    ]);

    const taskSummary = taskRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "DONE") acc.done += 1;
        if (row.status === "FAILED") acc.failed += 1;
        if (row.status === "DEAD_LETTER") acc.deadLetter += 1;
        if (row.status === "MANUAL_REQUIRED") acc.manualRequired += 1;
        return acc;
      },
      { total: 0, done: 0, failed: 0, deadLetter: 0, manualRequired: 0 }
    );

    return {
      ok: true,
      value: {
        sourceMode: "DATABASE",
        capturedAt: new Date().toISOString(),
        lifecycleEvents: sortByCreatedAtAsc(
          lifecycleEvents.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
        ),
        failureEvents: sortByCreatedAtAsc(
          failureEvents.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
        ),
        taskSummary
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Database telemetry query failed: ${error.message || String(error)}`
    };
  } finally {
    await prisma.$disconnect();
  }
}

function redactValue(value, audit) {
  if (typeof value === "string") {
    const result = applyOutputDlp(value, {
      mode: "REDACT",
      channel: "recovery_incident_bundle"
    });
    audit.matchCount += result.matchCount;
    for (const ruleId of result.ruleIds) {
      audit.ruleIds.add(ruleId);
    }
    return result.text;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, audit));
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = redactValue(nested, audit);
    }
    return out;
  }

  return value;
}

function buildIncidentBundle({ issueNumber, sinceHours, telemetry, nowIso }) {
  const bundle = {
    schemaVersion: "1.0",
    generatedAt: nowIso,
    scope: {
      project: "Sovereign",
      issueNumber: Number.isFinite(issueNumber) ? issueNumber : null,
      sinceHours
    },
    source: {
      mode: telemetry.sourceMode,
      capturedAt: telemetry.capturedAt
    },
    timeline: {
      lifecycleEvents: telemetry.lifecycleEvents,
      failureEvents: telemetry.failureEvents
    },
    summary: {
      lifecycleEventCount: telemetry.lifecycleEvents.length,
      failureEventCount: telemetry.failureEvents.length,
      taskStatus: telemetry.taskSummary
    },
    boardEvidencePointers: Number.isFinite(issueNumber)
      ? {
          issueUrl: `https://github.com/moldovancsaba/sovereign/issues/${issueNumber}`
        }
      : {}
  };

  const redactAudit = {
    matchCount: 0,
    ruleIds: new Set()
  };
  const sanitized = redactValue(bundle, redactAudit);
  sanitized.redaction = {
    mode: "REDACT",
    matchCount: redactAudit.matchCount,
    ruleIds: [...redactAudit.ruleIds].sort()
  };
  return sanitized;
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function writeJson(absPath, payload) {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const text = JSON.stringify(payload, null, 2);
  await fsp.writeFile(absPath, `${text}\n`, "utf8");
  return {
    path: absPath,
    sha256: sha256Text(text)
  };
}

module.exports = {
  buildIncidentBundle,
  createFixtureTelemetry,
  loadDatabaseTelemetry,
  sha256Text,
  writeJson
};

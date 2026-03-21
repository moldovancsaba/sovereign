#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const prisma = new PrismaClient();

const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "").trim();
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const LEASE_ID = String(
  process.env.SOVEREIGN_ORCHESTRATOR_LEASE_ID ||
    process.env.SENTINELSQUAD_ORCHESTRATOR_LEASE_ID ||
    "sovereign-primary-orchestrator"
).trim();
const HEARTBEAT_MAX_AGE_MS = Number(
  process.env.SOVEREIGN_HEARTBEAT_MAX_AGE_MS || process.env.SENTINELSQUAD_HEARTBEAT_MAX_AGE_MS || "120000"
);

function argInt(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 1));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function hasRuntimeConfig(agent) {
  if (agent.runtime === "LOCAL") {
    return Boolean(OLLAMA_BASE_URL && (agent.model || OLLAMA_MODEL));
  }
  if (agent.runtime === "CLOUD") {
    return Boolean(OPENAI_BASE_URL && (agent.model || OPENAI_MODEL) && OPENAI_API_KEY);
  }
  return false;
}

function isRecentHeartbeat(agent, nowMs) {
  if (!agent.lastHeartbeatAt) return false;
  return nowMs - new Date(agent.lastHeartbeatAt).getTime() <= HEARTBEAT_MAX_AGE_MS;
}

function leaseHealthy(lease, nowMs) {
  if (!lease || !lease.ownerAgentKey || !lease.expiresAt) return false;
  return new Date(lease.expiresAt).getTime() > nowMs;
}

async function checkOnce() {
  const agents = await prisma.agent.findMany({
    where: { enabled: true, runtime: { not: "MANUAL" } },
    select: {
      key: true,
      runtime: true,
      controlRole: true,
      readiness: true,
      enabled: true,
      model: true,
      smokeTestPassedAt: true,
      lastHeartbeatAt: true
    },
    orderBy: { key: "asc" }
  });

  const lease = await prisma.orchestratorLease.findUnique({
    where: { id: LEASE_ID },
    select: { ownerAgentKey: true, expiresAt: true, lastHeartbeatAt: true }
  });

  const nowMs = Date.now();
  const healthyLease = leaseHealthy(lease, nowMs);
  const hasAlphaLeaseOwner = healthyLease && Boolean(lease.ownerAgentKey);

  const rows = agents.map((a) => {
    const reasons = [];
    if (a.readiness !== "READY") reasons.push(`readiness=${a.readiness}`);
    if (!a.smokeTestPassedAt) reasons.push("smoke=missing");
    if (!hasRuntimeConfig(a)) reasons.push("runtime_config=missing");

    let online = false;
    if (a.controlRole === "ALPHA") {
      online = healthyLease && lease.ownerAgentKey === a.key;
      if (!online) reasons.push("alpha_lease=missing");
    } else {
      online = hasAlphaLeaseOwner || isRecentHeartbeat(a, nowMs);
      if (!online) reasons.push("coverage_or_heartbeat=missing");
    }

    const pass = reasons.length === 0 && online;
    return {
      key: a.key,
      runtime: a.runtime,
      controlRole: a.controlRole,
      pass,
      online,
      reasons
    };
  });

  return {
    ok: rows.every((r) => r.pass),
    leaseOwner: lease?.ownerAgentKey || null,
    rows
  };
}

async function main() {
  const timeoutMs = argInt("--timeout-ms", 45000);
  const intervalMs = argInt("--interval-ms", 2000);
  const started = Date.now();
  let last = null;

  while (Date.now() - started <= timeoutMs) {
    last = await checkOnce();
    if (last.ok) {
      console.log(JSON.stringify(last, null, 2));
      await prisma.$disconnect();
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  console.error(JSON.stringify(last || { ok: false, error: "no_results" }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}

main().catch(async (err) => {
  console.error(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
});

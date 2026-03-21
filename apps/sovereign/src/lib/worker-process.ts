import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";

export type RunningWorker = {
  pid: number;
  agentKey: string | null;
  command: string;
};

function appRoot() {
  return process.cwd();
}

export function isRuntimeRunnable(runtime: string | null | undefined) {
  return runtime === "LOCAL" || runtime === "CLOUD";
}

export function listRunningWorkers(): RunningWorker[] {
  let out = "";
  try {
    // Portable across macOS + Linux/Alpine (BusyBox): avoid BSD-only "command" column.
    out = execSync("ps -eo pid=,args=", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return [];
  }
  const rows = out.split("\n");
  const workers: RunningWorker[] = [];
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const m = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!m) continue;
    const pid = Number(m[1]);
    const command = m[2];
    if (!/node .*scripts\/worker\.js/.test(command)) continue;
    const am = /--agent=([A-Za-z0-9_-]+)/.exec(command);
    workers.push({ pid, agentKey: am?.[1] ?? null, command });
  }
  return workers;
}

export async function startWorker(agentKey: string) {
  const agent = await prisma.agent.findUnique({
    where: { key: agentKey },
    select: { key: true, enabled: true, runtime: true, controlRole: true }
  });
  if (!agent) {
    throw new Error(`Agent ${agentKey} is not registered.`);
  }
  if (!agent.enabled) {
    throw new Error(`Agent ${agentKey} is disabled.`);
  }
  if (!isRuntimeRunnable(agent.runtime)) {
    throw new Error(
      `Agent ${agentKey} runtime is ${agent.runtime}; only LOCAL/CLOUD runtimes can run workers.`
    );
  }
  if (agent.controlRole !== "ALPHA") {
    throw new Error(
      `Agent ${agentKey} role is ${agent.controlRole}. Only ALPHA agents can run control-plane workers.`
    );
  }

  const existing = listRunningWorkers().find((w) => w.agentKey === agentKey);
  if (existing) return { started: false, pid: existing.pid };

  const logsDir = path.join(appRoot(), ".sovereign", "worker-logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${agentKey}.log`);
  const out = fs.openSync(logPath, "a");

  const child = spawn(
    process.execPath,
    ["scripts/worker.js", `--agent=${agentKey}`],
    {
      cwd: appRoot(),
      detached: true,
      stdio: ["ignore", out, out],
      env: {
        ...process.env,
        SOVEREIGN_WORKER_AGENT_KEY: agentKey,
        SENTINELSQUAD_WORKER_AGENT_KEY: agentKey
      }
    }
  );
  child.unref();
  return { started: true, pid: child.pid };
}

export async function stopWorker(agentKey: string) {
  const matching = listRunningWorkers().filter((w) => w.agentKey === agentKey);
  if (!matching.length) return { stopped: false, count: 0 };

  for (const p of matching) {
    try {
      process.kill(p.pid, "SIGTERM");
    } catch {
      // Process may already have exited.
    }
  }

  // Give workers a short grace period.
  await new Promise((r) => setTimeout(r, 500));

  const remaining = listRunningWorkers().filter((w) => w.agentKey === agentKey);
  for (const p of remaining) {
    try {
      process.kill(p.pid, "SIGKILL");
    } catch {
      // Process may already have exited.
    }
  }

  return { stopped: true, count: matching.length };
}

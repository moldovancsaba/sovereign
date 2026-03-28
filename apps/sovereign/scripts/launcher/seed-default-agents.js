const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const {
  DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES,
  listInstalledLocalModels,
  selectInstalledModel
} = require("../lib/local-runtime");

const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_LOCAL_MODEL =
  process.env.SOVEREIGN_WORKER_MODEL || process.env.OLLAMA_MODEL || "Granite-4.0-H-1B";

function getRoleMapping() {
  return {
    drafterKey: String(process.env.SOVEREIGN_ORCH_DRAFTER_KEY || "Drafter").trim(),
    writerKey: String(process.env.SOVEREIGN_ORCH_WRITER_KEY || "Writer").trim(),
    controllerKey: String(process.env.SOVEREIGN_ORCH_CONTROLLER_KEY || "Controller").trim()
  };
}

function settingsPath() {
  return path.join(process.cwd(), ".sovereign", "settings.json");
}

function defaultAgents(model) {
  const mapping = getRoleMapping();
  const unique = new Map();
  const candidates = [
    { key: mapping.controllerKey, displayName: mapping.controllerKey, runtime: "LOCAL", controlRole: "ALPHA", readiness: "READY", enabled: true, model },
    { key: mapping.drafterKey, displayName: mapping.drafterKey, runtime: "LOCAL", controlRole: "BETA", readiness: "READY", enabled: true, model },
    { key: mapping.writerKey, displayName: mapping.writerKey, runtime: "LOCAL", controlRole: "BETA", readiness: "READY", enabled: true, model },
    { key: "Gwen", displayName: "Gwen", runtime: "LOCAL", controlRole: "BETA", readiness: "READY", enabled: true, model }
  ];

  for (const agent of candidates) {
    const key = String(agent.key || "").trim();
    if (!key) continue;
    unique.set(key.toLowerCase(), { ...agent, key, displayName: String(agent.displayName || key).trim() || key });
  }

  return Array.from(unique.values());
}

async function readSettings() {
  const file = settingsPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeSettings(settings) {
  const file = settingsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    `${JSON.stringify({ ...settings, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

async function ensureSettingsAgents(agents, resolvedModel) {
  const settings = (await readSettings()) || {
    localProjectFolder: process.env.SOVEREIGN_LOCAL_PROJECT_ROOT || path.join(os.homedir(), "Projects"),
    agents: [],
    projects: [],
    commandAccess: [],
    shellAccess: {
      inheritFullProcessEnv: true,
      defaultCwd: process.cwd()
    },
    tasteRubric: null,
    updatedAt: new Date(0).toISOString()
  };

  const nextAgents = Array.isArray(settings.agents) ? [...settings.agents] : [];
  let changed = false;

  for (const agent of agents) {
    const existing = nextAgents.find(
      (row) => typeof row?.agentName === "string" && row.agentName.toLowerCase() === agent.key.toLowerCase()
    );
    if (!existing) {
      nextAgents.push({
        agentId: `bootstrap-${agent.key.toLowerCase()}`,
        agentName: agent.key,
        agentUrl: DEFAULT_LOCAL_ENDPOINT,
        agentModel: resolvedModel,
        agentApiKeyEnv: ""
      });
      changed = true;
      continue;
    }

    if (!existing.agentUrl) {
      existing.agentUrl = DEFAULT_LOCAL_ENDPOINT;
      changed = true;
    }
    if (existing.agentModel !== resolvedModel) {
      existing.agentModel = resolvedModel;
      changed = true;
    }
  }

  if (changed) {
    settings.agents = nextAgents.sort((a, b) => String(a.agentName).localeCompare(String(b.agentName)));
    await writeSettings(settings);
  }
}

async function ensurePrismaAgents(agents, resolvedModel) {
  for (const agent of agents) {
    const existing = await prisma.agent.findFirst({
      where: { key: { equals: agent.key, mode: "insensitive" } },
      select: {
        key: true,
        runtime: true,
        controlRole: true,
        readiness: true,
        enabled: true,
        model: true,
        displayName: true
      }
    });

    if (!existing) {
      await prisma.agent.create({
        data: {
          key: agent.key,
          displayName: agent.displayName,
          runtime: agent.runtime,
          controlRole: agent.controlRole,
          readiness: agent.readiness,
          enabled: agent.enabled,
          model: resolvedModel
        }
      });
      continue;
    }

    const updates = {};
    if (!existing.displayName) updates.displayName = agent.displayName;
    if (existing.runtime !== "LOCAL") updates.runtime = "LOCAL";
    if (existing.controlRole !== agent.controlRole) updates.controlRole = agent.controlRole;
    if (existing.readiness !== "READY") updates.readiness = "READY";
    if (!existing.enabled) updates.enabled = true;
    if (existing.model !== resolvedModel) updates.model = resolvedModel;

    if (Object.keys(updates).length > 0) {
      await prisma.agent.update({
        where: { key: existing.key },
        data: updates
      });
    }
  }
}

async function main() {
  const installedModels = await listInstalledLocalModels({ endpoint: DEFAULT_LOCAL_ENDPOINT });
  const resolvedModel = selectInstalledModel(
    DEFAULT_LOCAL_MODEL,
    installedModels,
    DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES
  );
  const agents = defaultAgents(resolvedModel);
  await ensureSettingsAgents(agents, resolvedModel);
  await ensurePrismaAgents(agents, resolvedModel);
  if (resolvedModel !== DEFAULT_LOCAL_MODEL) {
    console.log(
      `[seed-default-agents] using local Ollama model "${resolvedModel}" instead of requested "${DEFAULT_LOCAL_MODEL}".`
    );
  }
}

main()
  .catch((error) => {
    console.error("[seed-default-agents] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

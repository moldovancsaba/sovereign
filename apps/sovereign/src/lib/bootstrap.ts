import { prisma } from "@/lib/prisma";
import { readSentinelSquadSettings, writeSentinelSquadSettings } from "@/lib/settings-store";
import { getNexusRoleMapping } from "@/lib/nexus-control";

const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_LOCAL_MODEL = "Granite-4.0-H-1B";

type BootstrapAgent = {
  key: string;
  displayName: string;
  runtime: "LOCAL";
  controlRole: "ALPHA" | "BETA";
  readiness: "READY";
  enabled: true;
  model: string;
};

function defaultBootstrapAgents(): BootstrapAgent[] {
  const mapping = getNexusRoleMapping();
  const unique = new Map<string, BootstrapAgent>();
  const candidates: BootstrapAgent[] = [
    {
      key: mapping.controllerKey,
      displayName: mapping.controllerKey,
      runtime: "LOCAL",
      controlRole: "ALPHA",
      readiness: "READY",
      enabled: true,
      model: DEFAULT_LOCAL_MODEL
    },
    {
      key: mapping.drafterKey,
      displayName: mapping.drafterKey,
      runtime: "LOCAL",
      controlRole: "BETA",
      readiness: "READY",
      enabled: true,
      model: DEFAULT_LOCAL_MODEL
    },
    {
      key: mapping.writerKey,
      displayName: mapping.writerKey,
      runtime: "LOCAL",
      controlRole: "BETA",
      readiness: "READY",
      enabled: true,
      model: DEFAULT_LOCAL_MODEL
    },
    {
      key: "Gwen",
      displayName: "Gwen",
      runtime: "LOCAL",
      controlRole: "BETA",
      readiness: "READY",
      enabled: true,
      model: DEFAULT_LOCAL_MODEL
    }
  ];

  for (const agent of candidates) {
    const normalized = agent.key.trim();
    if (!normalized) continue;
    unique.set(normalized.toLowerCase(), { ...agent, key: normalized, displayName: agent.displayName.trim() || normalized });
  }
  return Array.from(unique.values());
}

export async function ensureSentinelSquadBootstrap() {
  const bootstrapAgents = defaultBootstrapAgents();

  const settings = await readSentinelSquadSettings();
  let settingsChanged = false;
  const nextSettingsAgents = settings.agents.slice();

  for (const agent of bootstrapAgents) {
    const existing = nextSettingsAgents.find(
      (row) => row.agentName.toLowerCase() === agent.key.toLowerCase()
    );
    if (!existing) {
      nextSettingsAgents.push({
        agentId: `bootstrap-${agent.key.toLowerCase()}`,
        agentName: agent.key,
        agentUrl: DEFAULT_LOCAL_ENDPOINT,
        agentModel: agent.model,
        agentApiKeyEnv: ""
      });
      settingsChanged = true;
      continue;
    }

    if (!existing.agentUrl || !existing.agentModel) {
      existing.agentUrl = existing.agentUrl || DEFAULT_LOCAL_ENDPOINT;
      existing.agentModel = existing.agentModel || agent.model;
      settingsChanged = true;
    }
  }

  if (settingsChanged) {
    await writeSentinelSquadSettings({
      ...settings,
      agents: nextSettingsAgents.sort((a, b) => a.agentName.localeCompare(b.agentName))
    });
  }

  for (const agent of bootstrapAgents) {
    const existing = await prisma.agent.findFirst({
      where: { key: { equals: agent.key, mode: "insensitive" } },
      select: { key: true, runtime: true, controlRole: true, readiness: true, enabled: true, model: true }
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
          model: agent.model
        }
      });
      continue;
    }

    const updates: Record<string, unknown> = {};
    if (existing.runtime !== "LOCAL") updates.runtime = "LOCAL";
    if (existing.controlRole !== agent.controlRole) updates.controlRole = agent.controlRole;
    if (existing.readiness !== "READY") updates.readiness = "READY";
    if (!existing.enabled) updates.enabled = true;
    if (!existing.model) updates.model = agent.model;

    if (Object.keys(updates).length) {
      await prisma.agent.update({
        where: { key: existing.key },
        data: updates
      });
    }
  }
}

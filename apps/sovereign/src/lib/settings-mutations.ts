import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  type AgentSetting,
  type ProjectSetting,
  type ProjectVar,
  type TasteRubricVersion,
  readSentinelSquadSettings,
  writeSentinelSquadSettings
} from "@/lib/settings-store";
import {
  diffAgentRuntimeSettingMutations,
  diffProjectRuntimeVarMutations
} from "@/lib/runtime-settings-mutability";

function newId() {
  return randomUUID().replace(/-/g, "");
}

export type SettingsMutationAuditContext = {
  actorRole?: string;
  actorUserId?: string | null;
  actorUserEmail?: string | null;
};

function resolveActorRole(context?: SettingsMutationAuditContext) {
  return String(context?.actorRole || "HUMAN_OPERATOR").trim() || "HUMAN_OPERATOR";
}

async function recordRuntimeMutabilityAudit(params: {
  action: string;
  entityId: string;
  allowed: boolean;
  reason: string;
  mutableChangedKeys?: string[];
  immutableChangedKeys?: string[];
  scope: "agent" | "project";
  auditContext?: SettingsMutationAuditContext;
}) {
  await prisma.lifecycleAuditEvent.create({
    data: {
      entityType: "SETTINGS_MUTABILITY",
      entityId: params.entityId,
      actorRole: resolveActorRole(params.auditContext),
      action: params.action,
      fromState: null,
      toState: null,
      allowed: params.allowed,
      reason: params.reason,
      metadata: {
        scope: params.scope,
        mutableChangedKeys: params.mutableChangedKeys || [],
        immutableChangedKeys: params.immutableChangedKeys || [],
        actorUserId: params.auditContext?.actorUserId || null,
        actorUserEmail: params.auditContext?.actorUserEmail || null
      }
    }
  });
}

export function parseProjectVars(text: string): ProjectVar[] {
  const out: ProjectVar[] = [];
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key) continue;
    out.push({ key, value });
  }

  return out;
}

export function parseTasteRubricPrinciples(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    out.push(line);
  }
  return out;
}

export async function upsertAgentSetting(input: {
  agentId?: string;
  agentName: string;
  agentUrl?: string;
  agentModel?: string;
  agentApiKeyEnv?: string;
}, options?: { auditContext?: SettingsMutationAuditContext }) {
  const agentName = input.agentName.trim();
  if (!agentName) throw new Error("Agent name is required.");

  const settings = await readSentinelSquadSettings();
  const next = settings.agents.slice();

  const wantedId = input.agentId?.trim() || null;
  const idx = next.findIndex((a) =>
    wantedId
      ? a.agentId === wantedId
      : a.agentName.toLowerCase() === agentName.toLowerCase()
  );

  const row: AgentSetting = {
    agentId: wantedId || (idx >= 0 ? next[idx].agentId : newId()),
    agentName,
    agentUrl: input.agentUrl?.trim() || "",
    agentModel: input.agentModel?.trim() || "",
    agentApiKeyEnv: input.agentApiKeyEnv?.trim() || ""
  };

  const previous = idx >= 0 ? next[idx] : null;
  const agentDiff = diffAgentRuntimeSettingMutations(previous, row);
  if (agentDiff.immutableChangedKeys.length > 0) {
    const reason =
      `Runtime settings mutation denied for agent ${agentName}: ` +
      `immutable keys changed (${agentDiff.immutableChangedKeys.join(", ")}).`;
    await recordRuntimeMutabilityAudit({
      action: "RUNTIME_SETTINGS_MUTATION",
      entityId: `agent:${row.agentId}`,
      allowed: false,
      reason,
      immutableChangedKeys: agentDiff.immutableChangedKeys,
      mutableChangedKeys: agentDiff.mutableChangedKeys,
      scope: "agent",
      auditContext: options?.auditContext
    });
    throw new Error(reason);
  }

  if (idx >= 0) next[idx] = row;
  else next.push(row);

  await writeSentinelSquadSettings({
    ...settings,
    agents: next.sort((a, b) => a.agentName.localeCompare(b.agentName))
  });

  if (agentDiff.mutableChangedKeys.length > 0) {
    await recordRuntimeMutabilityAudit({
      action: "RUNTIME_SETTINGS_MUTATION",
      entityId: `agent:${row.agentId}`,
      allowed: true,
      reason: `Runtime mutable keys updated for agent ${agentName}.`,
      mutableChangedKeys: agentDiff.mutableChangedKeys,
      scope: "agent",
      auditContext: options?.auditContext
    });
  }

  return row;
}

export async function removeAgentSetting(input: {
  agentId?: string;
  agentName?: string;
}) {
  const agentId = input.agentId?.trim() || null;
  const agentName = input.agentName?.trim().toLowerCase() || null;
  if (!agentId && !agentName) throw new Error("Missing agent selector.");

  const settings = await readSentinelSquadSettings();
  await writeSentinelSquadSettings({
    ...settings,
    agents: settings.agents.filter((a) => {
      if (agentId) return a.agentId !== agentId;
      return a.agentName.toLowerCase() !== agentName;
    })
  });
}

export async function mergeAgentSettings(input: {
  canonicalName: string;
  aliases: string[];
}) {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new Error("Canonical agent name is required.");

  const aliasSet = new Set(
    [canonicalName, ...input.aliases]
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!aliasSet.size) throw new Error("No aliases provided for merge.");

  const settings = await readSentinelSquadSettings();
  const matching = settings.agents.filter((row) =>
    aliasSet.has(row.agentName.toLowerCase())
  );
  if (matching.length === 0) {
    return { before: settings.agents.length, after: settings.agents.length, merged: 0 };
  }

  const preferred =
    matching.find((row) => row.agentName.toLowerCase() === canonicalName.toLowerCase()) ||
    matching[0];
  const ordered = [preferred, ...matching.filter((row) => row !== preferred)];

  const merged: AgentSetting = {
    agentId: preferred.agentId.trim() || newId(),
    agentName: canonicalName,
    agentUrl: "",
    agentModel: "",
    agentApiKeyEnv: ""
  };

  for (const row of ordered) {
    const agentUrl = row.agentUrl.trim();
    const agentModel = row.agentModel.trim();
    const agentApiKeyEnv = row.agentApiKeyEnv.trim();
    if (!merged.agentUrl && agentUrl) merged.agentUrl = agentUrl;
    if (!merged.agentModel && agentModel) merged.agentModel = agentModel;
    if (!merged.agentApiKeyEnv && agentApiKeyEnv) merged.agentApiKeyEnv = agentApiKeyEnv;
  }

  const nextAgents = settings.agents
    .filter((row) => !aliasSet.has(row.agentName.toLowerCase()))
    .concat(merged)
    .sort((a, b) => a.agentName.localeCompare(b.agentName));

  await writeSentinelSquadSettings({
    ...settings,
    agents: nextAgents
  });

  return {
    before: settings.agents.length,
    after: nextAgents.length,
    merged: Math.max(matching.length - 1, 0)
  };
}

export async function upsertProjectSetting(input: {
  projectId?: string;
  projectName: string;
  projectUrl?: string;
  projectGithub?: string;
  vars?: ProjectVar[];
}, options?: { auditContext?: SettingsMutationAuditContext }) {
  const projectName = input.projectName.trim();
  if (!projectName) throw new Error("Project name is required.");

  const settings = await readSentinelSquadSettings();
  const next = settings.projects.slice();

  const wantedId = input.projectId?.trim() || null;
  const idx = next.findIndex((p) =>
    wantedId
      ? p.projectId === wantedId
      : p.projectName.toLowerCase() === projectName.toLowerCase()
  );

  const row: ProjectSetting = {
    projectId: wantedId || (idx >= 0 ? next[idx].projectId : newId()),
    projectName,
    projectUrl: input.projectUrl?.trim() || "",
    projectGithub: input.projectGithub?.trim() || "",
    vars: input.vars || []
  };

  const previous = idx >= 0 ? next[idx] : null;
  const projectDiff = diffProjectRuntimeVarMutations(previous?.vars || [], row.vars);
  if (projectDiff.immutableChangedKeys.length > 0) {
    const reason =
      `Runtime settings mutation denied for project ${projectName}: ` +
      `immutable keys changed (${projectDiff.immutableChangedKeys.join(", ")}).`;
    await recordRuntimeMutabilityAudit({
      action: "RUNTIME_SETTINGS_MUTATION",
      entityId: `project:${row.projectId}`,
      allowed: false,
      reason,
      immutableChangedKeys: projectDiff.immutableChangedKeys,
      mutableChangedKeys: projectDiff.mutableChangedKeys,
      scope: "project",
      auditContext: options?.auditContext
    });
    throw new Error(reason);
  }

  if (idx >= 0) next[idx] = row;
  else next.push(row);

  await writeSentinelSquadSettings({
    ...settings,
    projects: next.sort((a, b) => a.projectName.localeCompare(b.projectName))
  });

  if (projectDiff.mutableChangedKeys.length > 0) {
    await recordRuntimeMutabilityAudit({
      action: "RUNTIME_SETTINGS_MUTATION",
      entityId: `project:${row.projectId}`,
      allowed: true,
      reason: `Runtime mutable keys updated for project ${projectName}.`,
      mutableChangedKeys: projectDiff.mutableChangedKeys,
      scope: "project",
      auditContext: options?.auditContext
    });
  }

  return row;
}

export async function removeProjectSetting(input: {
  projectId?: string;
  projectName?: string;
}) {
  const projectId = input.projectId?.trim() || null;
  const projectName = input.projectName?.trim().toLowerCase() || null;
  if (!projectId && !projectName) throw new Error("Missing project selector.");

  const settings = await readSentinelSquadSettings();
  await writeSentinelSquadSettings({
    ...settings,
    projects: settings.projects.filter((p) => {
      if (projectId) return p.projectId !== projectId;
      return p.projectName.toLowerCase() !== projectName;
    })
  });
}

export async function cleanProjectSettings(input?: { boardProjectNames?: string[] }) {
  const settings = await readSentinelSquadSettings();
  const boardByLower = new Map<string, string>();
  for (const name of input?.boardProjectNames || []) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    boardByLower.set(trimmed.toLowerCase(), trimmed);
  }

  const merged = new Map<string, ProjectSetting>();
  let removed = 0;
  let renamed = 0;

  for (const project of settings.projects) {
    const rawName = project.projectName.trim();
    if (!rawName) {
      removed += 1;
      continue;
    }
    const canonicalName = boardByLower.get(rawName.toLowerCase()) || rawName;
    if (canonicalName !== project.projectName) renamed += 1;
    const key = canonicalName.toLowerCase();
    const normalized: ProjectSetting = {
      projectId: project.projectId.trim() || newId(),
      projectName: canonicalName,
      projectUrl: project.projectUrl.trim(),
      projectGithub: project.projectGithub.trim(),
      vars: project.vars
    };

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      continue;
    }

    removed += 1;
    merged.set(key, {
      ...existing,
      projectUrl: existing.projectUrl || normalized.projectUrl,
      projectGithub: existing.projectGithub || normalized.projectGithub,
      vars: existing.vars.length ? existing.vars : normalized.vars
    });
  }

  const nextProjects = Array.from(merged.values()).sort((a, b) =>
    a.projectName.localeCompare(b.projectName)
  );

  await writeSentinelSquadSettings({
    ...settings,
    projects: nextProjects
  });

  return {
    before: settings.projects.length,
    after: nextProjects.length,
    removed,
    renamed
  };
}

export async function upsertTasteRubricVersion(input: {
  version: string;
  ownerEmail: string;
  summary?: string;
  principles?: string[];
  changeReason?: string;
  updatedBy?: string;
}) {
  const version = input.version.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!version) throw new Error("Taste rubric version is required.");
  if (!ownerEmail) throw new Error("Taste rubric owner email is required.");

  const summary = input.summary?.trim() || "";
  const principles = (input.principles || []).map((line) => line.trim()).filter(Boolean);
  const changeReason = input.changeReason?.trim() || "";
  const updatedBy = input.updatedBy?.trim() || ownerEmail;

  const settings = await readSentinelSquadSettings();
  const existingVersions = settings.tasteRubric?.versions || [];
  const idx = existingVersions.findIndex(
    (row) => row.version.toLowerCase() === version.toLowerCase()
  );

  const nextRow: TasteRubricVersion = {
    version,
    ownerEmail,
    summary,
    principles,
    changeReason,
    source: "HUMAN",
    updatedBy,
    updatedAt: new Date().toISOString()
  };

  const nextVersions =
    idx >= 0
      ? existingVersions.map((row, rowIndex) => (rowIndex === idx ? nextRow : row))
      : existingVersions.concat(nextRow);

  await writeSentinelSquadSettings({
    ...settings,
    tasteRubric: {
      activeVersion: version,
      versions: nextVersions
    }
  });

  return nextRow;
}

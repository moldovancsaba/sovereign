"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRbacAccess } from "@/lib/rbac";
import {
  getActiveTasteRubricVersion,
  readSentinelSquadSettings,
  writeSentinelSquadSettings
} from "@/lib/settings-store";
import {
  parseTasteRubricPrinciples,
  upsertTasteRubricVersion
} from "@/lib/settings-mutations";

export async function saveLocalProjectFolderAction(formData: FormData) {
  await requireRbacAccess({
    action: "SETTINGS_SAVE_LOCAL_PROJECT_FOLDER",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "SETTINGS",
    entityId: "localProjectFolder"
  });

  const localProjectFolder = String(formData.get("localProjectFolder") || "").trim();
  if (!localProjectFolder) {
    throw new Error("Local project folder is required.");
  }

  const settings = await readSentinelSquadSettings();
  await writeSentinelSquadSettings({
    ...settings,
    localProjectFolder
  });

  revalidatePath("/settings");
}

export async function saveTasteRubricAction(formData: FormData) {
  const auth = await requireRbacAccess({
    action: "SETTINGS_SAVE_TASTE_RUBRIC",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "SETTINGS",
    entityId: "taste-rubric"
  });

  const version = String(formData.get("version") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "")
    .trim()
    .toLowerCase();
  const summary = String(formData.get("summary") || "").trim();
  const changeReason = String(formData.get("changeReason") || "").trim();
  const principles = parseTasteRubricPrinciples(String(formData.get("principles") || ""));

  if (!version) throw new Error("Taste rubric version is required.");
  if (!ownerEmail) throw new Error("Taste rubric owner email is required.");
  if (!principles.length) throw new Error("Taste rubric principles are required.");

  const settings = await readSentinelSquadSettings();
  const currentOwner =
    getActiveTasteRubricVersion(settings)?.ownerEmail?.toLowerCase() || null;
  const actorEmail = auth.userEmail?.toLowerCase() || null;
  const actorId = auth.userId || "unknown-user";

  if (currentOwner && auth.role !== "ADMIN" && actorEmail !== currentOwner) {
    throw new Error(
      `Access denied: only rubric owner (${currentOwner}) or ADMIN can update taste rubric.`
    );
  }

  const next = await upsertTasteRubricVersion({
    version,
    ownerEmail,
    summary,
    changeReason,
    principles,
    updatedBy: actorEmail || actorId
  });

  await prisma.lifecycleAuditEvent.create({
    data: {
      entityType: "SETTINGS",
      entityId: "taste-rubric",
      actorRole: `RBAC_${auth.role}`,
      action: "TASTE_RUBRIC_UPDATE",
      allowed: true,
      reason: `Taste rubric version ${next.version} updated by human operator.`,
      metadata: {
        version: next.version,
        ownerEmail: next.ownerEmail,
        updatedBy: next.updatedBy,
        principleCount: next.principles.length,
        changeReason: next.changeReason || null
      }
    }
  });

  revalidatePath("/settings");
}

export async function saveShellAccessSettingsAction(formData: FormData) {
  await requireRbacAccess({
    action: "SETTINGS_SAVE_SHELL_ACCESS",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "SETTINGS",
    entityId: "shell-access"
  });

  const inheritFullProcessEnv = formData
    .getAll("inheritFullProcessEnv")
    .map((value) => String(value).trim())
    .includes("1");
  const defaultCwd = String(formData.get("defaultCwd") || "").trim();
  if (!defaultCwd) {
    throw new Error("Default shell cwd is required.");
  }

  const settings = await readSentinelSquadSettings();
  await writeSentinelSquadSettings({
    ...settings,
    shellAccess: {
      inheritFullProcessEnv,
      defaultCwd
    }
  });

  revalidatePath("/settings");
}

export async function saveCommandAccessPolicyAction(formData: FormData) {
  await requireRbacAccess({
    action: "SETTINGS_SAVE_COMMAND_ACCESS",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "SETTINGS",
    entityId: "command-access"
  });

  const settings = await readSentinelSquadSettings();
  const entries = new Map(
    settings.commandAccess.map((entry) => [entry.command.toLowerCase(), entry])
  );
  const now = new Date().toISOString();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("command:")) continue;
    const command = key.slice("command:".length).trim().toLowerCase();
    if (!command) continue;
    const status = String(value || "").trim().toUpperCase();
    entries.set(command, {
      command,
      status: status === "APPROVED" ? "APPROVED" : "DECLINED",
      updatedAt: now
    });
  }

  const newCommand = String(formData.get("newCommand") || "")
    .trim()
    .toLowerCase();
  if (newCommand) {
    entries.set(newCommand, {
      command: newCommand,
      status: "DECLINED",
      updatedAt: now
    });
  }

  await writeSentinelSquadSettings({
    ...settings,
    commandAccess: Array.from(entries.values()).sort((a, b) =>
      a.command.localeCompare(b.command)
    )
  });

  revalidatePath("/settings");
}

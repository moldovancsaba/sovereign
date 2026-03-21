"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { ensureSingleSelectOption, getProjectMeta } from "@/lib/github";
import { requireRbacAccess } from "@/lib/rbac";
import {
  cleanProjectSettings,
  parseProjectVars,
  removeProjectSetting,
  upsertProjectSetting
} from "@/lib/settings-mutations";

export async function saveProjectConfigAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "").trim();
  const projectName = String(formData.get("projectName") || "").trim();
  const projectUrl = String(formData.get("projectUrl") || "").trim();
  const projectGithub = String(formData.get("projectGithub") || "").trim();
  const vars = parseProjectVars(String(formData.get("vars") || ""));

  const auth = await requireRbacAccess({
    action: "PRODUCTS_SAVE_PROJECT_CONFIG",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "PROJECT_SETTINGS",
    entityId: projectName || projectId || null,
    metadata: {
      projectName,
      hasProjectGithub: Boolean(projectGithub)
    }
  });

  await upsertProjectSetting({
    projectId: projectId || undefined,
    projectName,
    projectUrl,
    projectGithub,
    vars
  }, {
    auditContext: {
      actorRole: `RBAC_${auth.role}`,
      actorUserId: auth.userId,
      actorUserEmail: auth.userEmail
    }
  });

  revalidatePath("/products");
  revalidatePath(`/products/${encodeURIComponent(projectName)}`);
  revalidatePath("/settings");
}

export async function deleteProjectConfigAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "").trim();
  const projectName = String(formData.get("projectName") || "").trim();

  await requireRbacAccess({
    action: "PRODUCTS_DELETE_PROJECT_CONFIG",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "PROJECT_SETTINGS",
    entityId: projectName || projectId || null,
    metadata: {
      projectName
    }
  });

  await removeProjectSetting({
    projectId: projectId || undefined,
    projectName: projectName || undefined
  });

  if (projectName) revalidatePath(`/products/${encodeURIComponent(projectName)}`);
  revalidatePath("/products");
  revalidatePath("/settings");
}

export async function bootstrapSentinelSquadProjectAction() {
  const auth = await requireRbacAccess({
    action: "PRODUCTS_BOOTSTRAP_SENTINELSQUAD_PROJECT",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "PROJECT_SETTINGS",
    entityId: "SentinelSquad"
  });

  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const repoOwner =
    process.env.SOVEREIGN_TASK_REPO_OWNER ||
    process.env.SENTINELSQUAD_TASK_REPO_OWNER ||
    "moldovancsaba";
  const repoName =
    process.env.SOVEREIGN_TASK_REPO_NAME ||
    process.env.SENTINELSQUAD_TASK_REPO_NAME ||
    "sovereign";

  // IMPORTANT: GitHub's updateProjectV2Field option update can reset existing option IDs.
  // Keep this sync opt-in only until a non-destructive API path is available.
  if (
    process.env.SOVEREIGN_ENABLE_PRODUCT_OPTION_SYNC === "1" ||
    process.env.SENTINELSQUAD_ENABLE_PRODUCT_OPTION_SYNC === "1"
  ) {
    await ensureSingleSelectOption({
      fieldName: "Product",
      optionName: "SentinelSquad",
      color: "BLUE",
      description: "SentinelSquad unified chat and agent control plane"
    });
  }

  await upsertProjectSetting({
    projectName: "SentinelSquad",
    projectUrl: "http://localhost:3007",
    projectGithub: `https://github.com/${repoOwner}/${repoName}.git`,
    vars: [
      { key: "APP_PATH", value: path.join(repoRoot, "apps", "sovereign") },
      {
        key: "ROADMAP_DOC",
        value: path.join(repoRoot, "docs", "SOVEREIGN_DELIVERY_ROADMAP.md")
      },
      { key: "HANDOVER_DOC", value: path.join(repoRoot, "HANDOVER.md") },
      { key: "SETUP_DOC", value: path.join(repoRoot, "docs", "SETUP.md") }
    ]
  }, {
    auditContext: {
      actorRole: `RBAC_${auth.role}`,
      actorUserId: auth.userId,
      actorUserEmail: auth.userEmail
    }
  });

  revalidatePath("/products");
  revalidatePath("/products/SentinelSquad");
  revalidatePath("/settings");
}

export async function cleanProjectSettingsAction() {
  await requireRbacAccess({
    action: "PRODUCTS_CLEAN_PROJECT_SETTINGS",
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "PROJECT_SETTINGS",
    entityId: "all"
  });

  let boardProjectNames: string[] = [];
  try {
    const meta = await getProjectMeta();
    const productField = meta.fields.find((f) => f.name === "Product");
    boardProjectNames = productField?.options?.map((o) => o.name) ?? [];
  } catch {
    // If GitHub metadata is unavailable, still clean locally without board canonicalization.
  }

  await cleanProjectSettings({ boardProjectNames });

  revalidatePath("/products");
  revalidatePath("/settings");
}

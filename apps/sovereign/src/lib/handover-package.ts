import fs from "node:fs/promises";
import path from "node:path";

export const ALPHA_HANDOVER_SPEC_VERSION = "v1";

const REQUIRED_SECTION_HEADERS = [
  "# Alpha Handover Artifact v1",
  "## 1) Active Context Metadata",
  "## 2) Objective and Scope",
  "## 3) Completed Since Last Window",
  "## 4) Open Risks / Blockers",
  "## 5) Next Actions (Ordered)",
  "## 6) Continuation Prompt",
  "## 7) Evidence and Links"
] as const;

const REQUIRED_METADATA_FIELDS = [
  "- Project:",
  "- Active Window ID:",
  "- Alpha Owner:",
  "- Context Usage:",
  "- Continuation Prompt Ref:"
] as const;

type ValidationResult = {
  valid: boolean;
  reason: string;
  missingSections: string[];
  missingMetadataFields: string[];
  resolvedPackagePath: string | null;
  resolvedContinuationPath: string | null;
};

function normalizeText(input: string | null | undefined) {
  return String(input || "").trim();
}

function repoRootFromCwd() {
  return path.resolve(process.cwd(), "..", "..");
}

async function fileExists(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function resolveLocalDocRef(rawRef: string) {
  const ref = normalizeText(rawRef);
  if (!ref) {
    return {
      ok: false as const,
      reason: "Reference is empty.",
      path: null as string | null
    };
  }

  const [rawPath] = ref.split("#", 1);
  const pathPart = normalizeText(rawPath);
  if (!pathPart) {
    return {
      ok: false as const,
      reason: `Reference \"${ref}\" is missing a file path.`,
      path: null as string | null
    };
  }

  const repoRoot = repoRootFromCwd();
  const resolved = path.isAbsolute(pathPart)
    ? path.normalize(pathPart)
    : path.resolve(repoRoot, pathPart);
  const relativeToRoot = path.relative(repoRoot, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return {
      ok: false as const,
      reason: `Reference \"${ref}\" points outside repository root.`,
      path: null as string | null
    };
  }

  return {
    ok: true as const,
    reason: "",
    path: resolved
  };
}

export async function validateAlphaHandoverPackage(params: {
  handoverPackageRef: string;
  continuationPromptRef: string;
  projectName: string;
  activeWindowId: string;
  ownerAgentKey: string;
}): Promise<ValidationResult> {
  const packageRef = resolveLocalDocRef(params.handoverPackageRef);
  if (!packageRef.ok || !packageRef.path) {
    return {
      valid: false,
      reason: `Handover package validation failed: ${packageRef.reason}`,
      missingSections: [],
      missingMetadataFields: [],
      resolvedPackagePath: null,
      resolvedContinuationPath: null
    };
  }

  if (!(await fileExists(packageRef.path))) {
    return {
      valid: false,
      reason: `Handover package validation failed: file not found (${params.handoverPackageRef}).`,
      missingSections: [],
      missingMetadataFields: [],
      resolvedPackagePath: packageRef.path,
      resolvedContinuationPath: null
    };
  }

  const continuationRef = resolveLocalDocRef(params.continuationPromptRef);
  if (!continuationRef.ok || !continuationRef.path) {
    return {
      valid: false,
      reason: `Continuation prompt validation failed: ${continuationRef.reason}`,
      missingSections: [],
      missingMetadataFields: [],
      resolvedPackagePath: packageRef.path,
      resolvedContinuationPath: null
    };
  }

  if (!(await fileExists(continuationRef.path))) {
    return {
      valid: false,
      reason: `Continuation prompt validation failed: file not found (${params.continuationPromptRef}).`,
      missingSections: [],
      missingMetadataFields: [],
      resolvedPackagePath: packageRef.path,
      resolvedContinuationPath: continuationRef.path
    };
  }

  const [packageBody, continuationBody] = await Promise.all([
    fs.readFile(packageRef.path, "utf8"),
    fs.readFile(continuationRef.path, "utf8")
  ]);

  const missingSections = REQUIRED_SECTION_HEADERS.filter((header) => !packageBody.includes(header));
  const missingMetadataFields = REQUIRED_METADATA_FIELDS.filter((field) => !packageBody.includes(field));

  const contextMismatch: string[] = [];
  if (!packageBody.toLowerCase().includes(params.projectName.toLowerCase())) {
    contextMismatch.push(`project name \"${params.projectName}\"`);
  }
  if (!packageBody.includes(params.activeWindowId)) {
    contextMismatch.push(`active window id \"${params.activeWindowId}\"`);
  }
  if (!packageBody.includes(`@${params.ownerAgentKey}`) && !packageBody.includes(params.ownerAgentKey)) {
    contextMismatch.push(`owner agent \"${params.ownerAgentKey}\"`);
  }
  if (!packageBody.includes(params.continuationPromptRef)) {
    contextMismatch.push("continuation prompt reference link");
  }

  const continuationLooksValid = /continue work in/i.test(continuationBody);

  const valid =
    missingSections.length === 0 &&
    missingMetadataFields.length === 0 &&
    contextMismatch.length === 0 &&
    continuationLooksValid;

  if (valid) {
    return {
      valid: true,
      reason: "Alpha handover package validation passed.",
      missingSections: [],
      missingMetadataFields: [],
      resolvedPackagePath: packageRef.path,
      resolvedContinuationPath: continuationRef.path
    };
  }

  const reasons: string[] = [];
  if (missingSections.length > 0) {
    reasons.push(`missing sections: ${missingSections.join(", ")}`);
  }
  if (missingMetadataFields.length > 0) {
    reasons.push(`missing metadata fields: ${missingMetadataFields.join(", ")}`);
  }
  if (contextMismatch.length > 0) {
    reasons.push(`missing context links: ${contextMismatch.join(", ")}`);
  }
  if (!continuationLooksValid) {
    reasons.push(
      `continuation prompt ref must point to content containing \"Continue work in ...\"`
    );
  }

  return {
    valid: false,
    reason: `Handover package validation failed: ${reasons.join("; ")}`,
    missingSections,
    missingMetadataFields,
    resolvedPackagePath: packageRef.path,
    resolvedContinuationPath: continuationRef.path
  };
}

export type ExecutablePromptSectionKey =
  | "objective"
  | "executionPrompt"
  | "scopeNonGoals"
  | "scope"
  | "nonGoals"
  | "constraints"
  | "acceptanceChecks"
  | "deliveryArtifact";

export type ExecutablePromptValidation = {
  valid: boolean;
  missingSections: string[];
  weakSections: string[];
  sections: Record<ExecutablePromptSectionKey, string>;
};

const REQUIRED_SECTION_LABELS = [
  { key: "objective", label: "Objective" },
  { key: "executionPrompt", label: "Execution Prompt" },
  { key: "scopeNonGoals", label: "Scope / Non-goals (or both Scope + Non-goals)" },
  { key: "constraints", label: "Constraints" },
  { key: "acceptanceChecks", label: "Acceptance Checks" },
  { key: "deliveryArtifact", label: "Delivery Artifact" }
] as const;

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;

function normalizeHeading(input: string) {
  return input
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyHeading(rawHeading: string): ExecutablePromptSectionKey | null {
  const heading = normalizeHeading(rawHeading);
  if (!heading) return null;
  if (heading.includes("execution prompt") || heading.includes("prompt to execute")) {
    return "executionPrompt";
  }
  if (
    heading.includes("scope / non-goals") ||
    heading.includes("scope/non-goals") ||
    (heading.includes("scope") && heading.includes("non-goal"))
  ) {
    return "scopeNonGoals";
  }
  if (heading === "scope") return "scope";
  if (heading.includes("non-goal")) return "nonGoals";
  if (heading.includes("objective")) return "objective";
  if (heading.includes("constraint")) return "constraints";
  if (heading.includes("acceptance checks") || heading.includes("acceptance criteria")) {
    return "acceptanceChecks";
  }
  if (
    heading.includes("delivery artifact") ||
    heading.includes("delivery artefact") ||
    heading.includes("deliverable")
  ) {
    return "deliveryArtifact";
  }
  return null;
}

function stripMarkdownNoise(content: string) {
  return content
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksPlaceholder(content: string) {
  const lowered = content.toLowerCase();
  return (
    lowered.includes("tbd") ||
    lowered.includes("todo") ||
    lowered.includes("placeholder") ||
    lowered.includes("<fill") ||
    lowered.includes("<todo") ||
    lowered.includes("...") ||
    lowered === "n/a"
  );
}

function hasSubstance(content: string, minLen: number) {
  const clean = stripMarkdownNoise(content);
  return clean.length >= minLen && !looksPlaceholder(clean);
}

function hasAcceptanceChecklist(content: string) {
  return /(^|\n)\s*[-*]\s+(\[[ xX]\]\s+)?\S+/.test(content);
}

export function validateExecutablePromptPackage(body: string | null | undefined) {
  const markdown = String(body || "");
  const matches = Array.from(markdown.matchAll(HEADING_RE)).map((m) => ({
    heading: m[2] || "",
    index: m.index ?? 0,
    full: m[0] || ""
  }));

  const sections: Record<ExecutablePromptSectionKey, string> = {
    objective: "",
    executionPrompt: "",
    scopeNonGoals: "",
    scope: "",
    nonGoals: "",
    constraints: "",
    acceptanceChecks: "",
    deliveryArtifact: ""
  };

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = current.index + current.full.length;
    const end = next ? next.index : markdown.length;
    const key = classifyHeading(current.heading);
    if (!key) continue;
    const content = markdown.slice(start, end).trim();
    if (!content) continue;
    sections[key] = sections[key] ? `${sections[key]}\n\n${content}` : content;
  }

  const missingSections: string[] = [];
  const weakSections: string[] = [];

  if (!hasSubstance(sections.objective, 15)) {
    missingSections.push("Objective");
  }
  if (!hasSubstance(sections.executionPrompt, 30)) {
    missingSections.push("Execution Prompt");
  }

  const hasCombinedScope = hasSubstance(sections.scopeNonGoals, 20);
  const hasSplitScope = hasSubstance(sections.scope, 10) && hasSubstance(sections.nonGoals, 10);
  if (!hasCombinedScope && !hasSplitScope) {
    missingSections.push("Scope / Non-goals");
  }

  if (!hasSubstance(sections.constraints, 15)) {
    missingSections.push("Constraints");
  }

  if (!hasSubstance(sections.acceptanceChecks, 15)) {
    missingSections.push("Acceptance Checks");
  } else if (!hasAcceptanceChecklist(sections.acceptanceChecks)) {
    weakSections.push("Acceptance Checks (must contain checklist/bullets)");
  }

  if (!hasSubstance(sections.deliveryArtifact, 10)) {
    missingSections.push("Delivery Artifact");
  }

  return {
    valid: missingSections.length === 0 && weakSections.length === 0,
    missingSections,
    weakSections,
    sections
  } satisfies ExecutablePromptValidation;
}

export function promptPackageMissingSummary(result: ExecutablePromptValidation) {
  if (result.valid) return "";
  const requiredLabels = REQUIRED_SECTION_LABELS.map((entry) => entry.label).join(", ");
  const missing = result.missingSections.length
    ? `Missing: ${result.missingSections.join(", ")}.`
    : "";
  const weak = result.weakSections.length ? ` Weak: ${result.weakSections.join(", ")}.` : "";
  return `Executable Prompt Package is incomplete. ${missing}${weak} Required sections: ${requiredLabels}.`;
}

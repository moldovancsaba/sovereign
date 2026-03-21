#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;

function normalizeHeading(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyHeading(rawHeading) {
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

function stripMarkdownNoise(content) {
  return String(content || "")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksPlaceholder(content) {
  const lowered = String(content || "").toLowerCase();
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

function hasSubstance(content, minLen) {
  const clean = stripMarkdownNoise(content);
  return clean.length >= minLen && !looksPlaceholder(clean);
}

function hasAcceptanceChecklist(content) {
  return /(^|\n)\s*[-*]\s+(\[[ xX]\]\s+)?\S+/.test(String(content || ""));
}

function validatePromptPackage(markdown) {
  const source = String(markdown || "");
  const matches = Array.from(source.matchAll(HEADING_RE)).map((m) => ({
    heading: m[2] || "",
    index: m.index || 0,
    full: m[0] || ""
  }));
  const sections = {
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
    const end = next ? next.index : source.length;
    const key = classifyHeading(current.heading);
    if (!key) continue;
    const content = source.slice(start, end).trim();
    if (!content) continue;
    sections[key] = sections[key] ? `${sections[key]}\n\n${content}` : content;
  }

  const missingSections = [];
  const weakSections = [];

  if (!hasSubstance(sections.objective, 15)) missingSections.push("Objective");
  if (!hasSubstance(sections.executionPrompt, 30)) missingSections.push("Execution Prompt");

  const hasCombinedScope = hasSubstance(sections.scopeNonGoals, 20);
  const hasSplitScope = hasSubstance(sections.scope, 10) && hasSubstance(sections.nonGoals, 10);
  if (!hasCombinedScope && !hasSplitScope) {
    missingSections.push("Scope / Non-goals");
  }

  if (!hasSubstance(sections.constraints, 15)) missingSections.push("Constraints");

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
  };
}

function parseArgs(argv) {
  const out = {
    issue: null,
    repo: process.env.MVP_REPO_FULL || "moldovancsaba/sovereign",
    bodyFile: null,
    json: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--issue") out.issue = argv[++i] || null;
    else if (arg === "--repo") out.repo = argv[++i] || out.repo;
    else if (arg === "--body-file") out.bodyFile = argv[++i] || null;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }
  return out;
}

function loadIssueData(opts) {
  if (opts.bodyFile) {
    const body = fs.readFileSync(opts.bodyFile, "utf8");
    return {
      number: null,
      title: `body:${opts.bodyFile}`,
      url: null,
      body
    };
  }
  if (!opts.issue) {
    throw new Error("Missing --issue <number> or --body-file <path>.");
  }
  const raw = execFileSync(
    "gh",
    ["issue", "view", String(opts.issue), "--repo", opts.repo, "--json", "number,title,body,url"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  return JSON.parse(raw);
}

function buildSummary(result) {
  if (result.valid) return "Executable Prompt Package: valid.";
  const missing = result.missingSections.length
    ? `Missing: ${result.missingSections.join(", ")}.`
    : "";
  const weak = result.weakSections.length ? ` Weak: ${result.weakSections.join(", ")}.` : "";
  return `Executable Prompt Package invalid. ${missing}${weak}`.trim();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Usage: sentinelsquad-validate-prompt-package.js (--issue <n> [--repo owner/repo] | --body-file <path>) [--json]"
    );
    return;
  }

  const issue = loadIssueData(opts);
  const result = validatePromptPackage(issue.body || "");
  const payload = {
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueUrl: issue.url,
    ...result,
    summary: buildSummary(result)
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`#${payload.issueNumber ?? "-"} ${payload.issueTitle}`);
    console.log(payload.summary);
  }

  if (!result.valid) process.exit(2);
}

main();

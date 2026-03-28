import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { sovereignEnvDefault } from "@/lib/env-sovereign";

type TreeNode = {
  type: "file" | "dir";
  name: string;
  relPath: string;
};

const DEFAULT_IDE_ROOT = path.join(os.homedir(), "Projects");
const DEFAULT_COMMAND_PROFILES_PATH = path.resolve(process.cwd(), ".sovereign", "ide-command-profiles.json");
const DEFAULT_UNSAFE_CONFIRM_PHRASE = "I UNDERSTAND THIS ENABLES FULL LOCAL ACCESS";

function workspaceRoot() {
  const root = sovereignEnvDefault("SOVEREIGN_IDE_ROOT", DEFAULT_IDE_ROOT).trim();
  return path.resolve(root);
}

function ensureInsideRoot(relPath: string) {
  const root = workspaceRoot();
  const safeRel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(root, safeRel);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes IDE root.");
  }
  return { root, full, safeRel };
}

export function getIdeWorkspaceRoot() {
  return workspaceRoot();
}

export function getIdeUnsafeModeInfo() {
  const enabled = String(process.env.SOVEREIGN_IDE_UNSAFE_FULL_ACCESS || "").trim() === "1";
  const requiredPhrase = String(
    sovereignEnvDefault("SOVEREIGN_IDE_UNSAFE_CONFIRM_PHRASE", DEFAULT_UNSAFE_CONFIRM_PHRASE)
  ).trim();
  return { enabled, requiredPhrase };
}

function isUnsafeBypassAuthorized(unsafePhrase?: string) {
  const info = getIdeUnsafeModeInfo();
  if (!info.enabled) return false;
  return String(unsafePhrase || "").trim() === info.requiredPhrase;
}

type CommandProfileConfig = {
  defaultAllowedPrefixes?: string[];
  folderProfiles?: Array<{
    pathPrefix: string;
    allowedPrefixes: string[];
  }>;
};

function resolveIdeCommandProfilesPath() {
  const fromEnv = sovereignEnvDefault("SOVEREIGN_IDE_COMMAND_PROFILES", "").trim();
  if (fromEnv) return fromEnv;
  if (fsSync.existsSync(DEFAULT_COMMAND_PROFILES_PATH)) return DEFAULT_COMMAND_PROFILES_PATH;
  return DEFAULT_COMMAND_PROFILES_PATH;
}

async function readCommandProfileConfig(): Promise<CommandProfileConfig> {
  const file = resolveIdeCommandProfilesPath();
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as CommandProfileConfig;
    return parsed;
  } catch {
    return {
      defaultAllowedPrefixes: [
        "npm run",
        "npm test",
        "node ",
        "python3 ",
        "git status",
        "git diff"
      ],
      folderProfiles: []
    };
  }
}

function startsWithAllowedPrefix(command: string, prefixes: string[]) {
  const normalized = command.trim().toLowerCase();
  return prefixes.some((prefix) => normalized.startsWith(prefix.trim().toLowerCase()));
}

export async function getIdeCommandPolicy(cwdRelPath = "") {
  const { safeRel } = ensureInsideRoot(cwdRelPath || "");
  const config = await readCommandProfileConfig();
  const folderProfiles = Array.isArray(config.folderProfiles) ? config.folderProfiles : [];
  const defaultAllowed = Array.isArray(config.defaultAllowedPrefixes)
    ? config.defaultAllowedPrefixes
    : [];

  const sorted = folderProfiles
    .filter((p) => p && typeof p.pathPrefix === "string" && Array.isArray(p.allowedPrefixes))
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

  const matched = sorted.find((p) => safeRel === p.pathPrefix || safeRel.startsWith(`${p.pathPrefix}/`));
  const allowedPrefixes = matched?.allowedPrefixes?.length ? matched.allowedPrefixes : defaultAllowed;
  return {
    cwdRelPath: safeRel || ".",
    matchedPathPrefix: matched?.pathPrefix || null,
    allowedPrefixes
  };
}

export async function listIdeTree(
  relPath: string,
  limit = 250
): Promise<{
  base: string;
  nodes: TreeNode[];
  commandPolicy: { cwdRelPath: string; matchedPathPrefix: string | null; allowedPrefixes: string[] };
}> {
  const { root, full, safeRel } = ensureInsideRoot(relPath || "");
  const entries = await fs.readdir(full, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;

    const childRel = safeRel ? `${safeRel}/${entry.name}` : entry.name;
    nodes.push({
      type: entry.isDirectory() ? "dir" : "file",
      name: entry.name,
      relPath: childRel
    });

    if (nodes.length >= limit) break;
  }

  const commandPolicy = await getIdeCommandPolicy(safeRel || "");
  return { base: path.relative(root, full) || ".", nodes, commandPolicy };
}

export async function readIdeFile(relPath: string) {
  const { full, safeRel } = ensureInsideRoot(relPath);
  const stat = await fs.stat(full);
  if (!stat.isFile()) {
    throw new Error("Target is not a file.");
  }
  if (stat.size > 256 * 1024) {
    throw new Error("File too large (>256KB) for in-app editor.");
  }
  const content = await fs.readFile(full, "utf-8");
  return { relPath: safeRel, content };
}

export async function saveIdeFile(relPath: string, content: string) {
  const { full } = ensureInsideRoot(relPath);
  await fs.writeFile(full, content, "utf-8");
}

export async function runIdeCommand(command: string, cwdRelPath = "", unsafePhrase = "") {
  const trimmed = String(command || "").trim();
  if (!trimmed) {
    throw new Error("Command is required.");
  }
  if (trimmed.length > 400) {
    throw new Error("Command too long.");
  }
  const unsafeAuthorized = isUnsafeBypassAuthorized(unsafePhrase);

  const banned = ["rm -rf /", "shutdown", "reboot", "mkfs", "dd if="];
  const lower = trimmed.toLowerCase();
  if (!unsafeAuthorized && banned.some((token) => lower.includes(token))) {
    throw new Error("Command blocked by safety policy.");
  }
  const policy = await getIdeCommandPolicy(cwdRelPath || "");
  if (!unsafeAuthorized && !startsWithAllowedPrefix(trimmed, policy.allowedPrefixes)) {
    throw new Error(
      `Command not allowed for folder profile. Allowed prefixes: ${policy.allowedPrefixes.join(", ")}`
    );
  }

  const { full: cwd } = ensureInsideRoot(cwdRelPath || "");

  return await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
    const child = exec(trimmed, { cwd, timeout: 20_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const exitCode = error && typeof (error as { code?: number }).code === "number"
        ? (error as { code: number }).code
        : 0;
      resolve({
        exitCode,
        stdout: String(stdout || "").slice(0, 8000),
        stderr: String(stderr || "").slice(0, 8000)
      });
    });

    child.stdin?.end();
  });
}

export async function getIdeGitDiff(relPath: string, cwdRelPath = "") {
  const { full } = ensureInsideRoot(relPath);
  const { full: cwd } = ensureInsideRoot(cwdRelPath || "");
  const fileArg = `"${full.replace(/"/g, '\\"')}"`;

  const patch = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
    const cmd =
      `git -C "${cwd.replace(/"/g, '\\"')}" rev-parse --is-inside-work-tree >/dev/null 2>&1 && ` +
      `git -C "${cwd.replace(/"/g, '\\"')}" diff -- ${fileArg}`;
    exec(cmd, { timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const exitCode =
        error && typeof (error as { code?: number }).code === "number"
          ? (error as { code: number }).code
          : 0;
      resolve({
        exitCode,
        stdout: String(stdout || "").slice(0, 20_000),
        stderr: String(stderr || "").slice(0, 8000)
      });
    });
  });

  const repoRoot = await new Promise<string | null>((resolve) => {
    const cmd = `git -C "${cwd.replace(/"/g, '\\"')}" rev-parse --show-toplevel`;
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(String(stdout || "").trim() || null);
    });
  });

  const baselineFromHead =
    repoRoot && (full === repoRoot || full.startsWith(`${repoRoot}${path.sep}`))
      ? await new Promise<{ baseline: string; headRef: string | null }>((resolve) => {
          const relFromRepo = path.relative(repoRoot, full).replace(/\\/g, "/");
          const cmd = `git -C "${cwd.replace(/"/g, '\\"')}" show "HEAD:${relFromRepo}"`;
          exec(cmd, { timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
            if (error) {
              resolve({ baseline: "", headRef: null });
              return;
            }
            resolve({ baseline: String(stdout || ""), headRef: "HEAD" });
          });
        })
      : { baseline: "", headRef: null };

  return {
    ...patch,
    baseline: baselineFromHead.baseline || "",
    headRef: baselineFromHead.headRef
  };
}

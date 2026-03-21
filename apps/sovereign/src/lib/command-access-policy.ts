import type { ToolCallDefinition, ToolCallProtocolEnvelope } from "@/lib/tool-call-protocol";

export type CommandAccessStatus = "APPROVED" | "DECLINED";

export type CommandAccessEntry = {
  command: string;
  status: CommandAccessStatus;
  updatedAt: string;
};

function normalizeToken(input: string) {
  return input
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^[({[]+|[)\]}]+$/g, "");
}

export function normalizeCommandName(input: string) {
  return normalizeToken(input)
    .replace(/^.*\//, "")
    .toLowerCase();
}

function firstExecutableToken(segment: string) {
  const tokens = segment
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
  if (!tokens.length) return "";

  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    index += 1;
  }
  while (
    index < tokens.length &&
    ["command", "builtin", "env", "nohup", "time"].includes(tokens[index].toLowerCase())
  ) {
    index += 1;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
      index += 1;
    }
  }
  return index < tokens.length ? normalizeCommandName(tokens[index]) : "";
}

export function extractShellCoreCommands(command: string) {
  const parts = String(command || "")
    .split(/[\n;&|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const part of parts) {
    const token = firstExecutableToken(part);
    if (token) out.add(token);
  }
  return Array.from(out);
}

export function deriveCoreCommandsForCall(call: ToolCallDefinition) {
  if (call.tool === "shell.exec") {
    const args = call.args || {};
    const command =
      typeof args.command === "string"
        ? args.command
        : typeof args.cmd === "string"
        ? args.cmd
        : "";
    return extractShellCoreCommands(command);
  }

  const filesystemMap: Record<string, string[]> = {
    "filesystem.read": ["cat"],
    "filesystem.list": ["ls"],
    "filesystem.search": ["find"],
    "filesystem.stat": ["stat"],
    "filesystem.write": ["write"],
    "filesystem.patch": ["patch"],
    "filesystem.edit": ["edit"],
    "filesystem.delete": ["rm"],
    "filesystem.move": ["mv"],
    "filesystem.mkdir": ["mkdir"],
    "filesystem.copy": ["cp"]
  };
  if (filesystemMap[call.tool]) return filesystemMap[call.tool];

  if (call.tool === "git.pr.create") return ["gh"];
  if (call.tool.startsWith("git.")) return ["git"];

  return [];
}

export function deriveCoreCommandsForEnvelope(envelope: ToolCallProtocolEnvelope) {
  const out = new Set<string>();
  for (const call of envelope.calls) {
    for (const command of deriveCoreCommandsForCall(call)) {
      const normalized = normalizeCommandName(command);
      if (normalized) out.add(normalized);
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

export function mergeObservedCommandAccessEntries(
  existing: CommandAccessEntry[],
  commands: string[]
) {
  const now = new Date().toISOString();
  const byCommand = new Map<string, CommandAccessEntry>();
  for (const entry of existing) {
    const normalized = normalizeCommandName(entry.command);
    if (!normalized) continue;
    byCommand.set(normalized, {
      command: normalized,
      status: entry.status === "APPROVED" ? "APPROVED" : "DECLINED",
      updatedAt: entry.updatedAt || now
    });
  }
  let changed = false;
  for (const command of commands) {
    const normalized = normalizeCommandName(command);
    if (!normalized || byCommand.has(normalized)) continue;
    byCommand.set(normalized, {
      command: normalized,
      status: "DECLINED",
      updatedAt: now
    });
    changed = true;
  }
  return {
    changed,
    entries: Array.from(byCommand.values()).sort((a, b) => a.command.localeCompare(b.command))
  };
}

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_MAX_TEXT_BYTES = 256 * 1024;
const DEFAULT_MAX_WRITE_BYTES = 256 * 1024;
const DEFAULT_MAX_SEARCH_RESULTS = 200;
const DEFAULT_MAX_SEARCH_BYTES = 256 * 1024;
const DEFAULT_MAX_LIST_ENTRIES = 500;
const DEFAULT_MAX_SEARCH_FILES = 1000;

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".jar",
  ".wasm",
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
  ".wav",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".class"
]);

const SECRET_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.env$/i,
  /(^|\/).*\.pem$/i,
  /(^|\/).*\.p12$/i,
  /(^|\/).*\.key$/i,
  /(^|\/)id_rsa(\.pub)?$/i,
  /(^|\/)id_ed25519(\.pub)?$/i
];

class ToolFilesystemError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = "ToolFilesystemError";
    this.code = code;
    this.metadata = metadata;
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "1" || lowered === "true" || lowered === "yes") return true;
    if (lowered === "0" || lowered === "false" || lowered === "no") return false;
  }
  return fallback;
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function hashContent(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function unique(items) {
  return Array.from(new Set(items));
}

function isWithinPath(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isLikelyBinaryBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) nonPrintable += 1;
  }
  return nonPrintable / sample.length > 0.3;
}

function classifyFileByName(absPath) {
  const ext = path.extname(absPath || "").toLowerCase();
  return BINARY_EXTENSIONS.has(ext) ? "BINARY" : "TEXT";
}

function parseWorkspaceEnvList(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return [];
  return rawValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readSettingsWorkspaceRoot(settingsFile) {
  if (!settingsFile) return "";
  try {
    const raw = await fsp.readFile(settingsFile, "utf8");
    const parsed = JSON.parse(raw);
    return asTrimmed(parsed?.localProjectFolder);
  } catch {
    return "";
  }
}

async function resolveWorkspaceRoots(options) {
  const cwd = path.resolve(asTrimmed(options?.cwd) || process.cwd());
  const env = options?.env || process.env;
  const envRoots = parseWorkspaceEnvList(
    asTrimmed(env?.SOVEREIGN_WORKSPACE_ROOT) ||
      asTrimmed(env?.SOVEREIGN_LOCAL_PROJECT_ROOT) ||
      asTrimmed(env?.SENTINELSQUAD_WORKSPACE_ROOT) ||
      asTrimmed(env?.SENTINELSQUAD_LOCAL_PROJECT_ROOT)
  );
  const settingsRoot = await readSettingsWorkspaceRoot(asTrimmed(options?.settingsFile));
  const rawRoots = unique([...envRoots, settingsRoot, cwd].filter(Boolean));

  const normalized = [];
  for (const root of rawRoots) {
    try {
      const abs = path.resolve(root);
      const stat = await fsp.stat(abs);
      if (!stat.isDirectory()) continue;
      const real = await fsp.realpath(abs);
      normalized.push(real);
    } catch {
      // Ignore invalid roots.
    }
  }

  const deduped = unique(normalized);
  if (!deduped.length) {
    throw new ToolFilesystemError(
      "WORKSPACE_UNAVAILABLE",
      "No accessible workspace root is configured for filesystem tools."
    );
  }
  return deduped;
}

async function resolveExistingAncestor(absPath) {
  let probe = absPath;
  while (true) {
    try {
      const real = await fsp.realpath(probe);
      return { probe, real };
    } catch {
      // Continue climbing.
    }
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return null;
}

function hasSecretPathPattern(relativePath) {
  return SECRET_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

async function resolveTargetPath(args) {
  const {
    workspaceRoots,
    requestedPath,
    allowCreate = false,
    requireExisting = false,
    operation
  } = args;
  if (!asTrimmed(requestedPath)) {
    throw new ToolFilesystemError(
      "PATH_REQUIRED",
      `${operation} requires args.path to be a non-empty string.`
    );
  }

  const primaryRoot = workspaceRoots[0];
  const candidateAbsolute = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(primaryRoot, requestedPath);

  const lexicalMatches = workspaceRoots.filter((root) => isWithinPath(candidateAbsolute, root));
  if (!lexicalMatches.length) {
    throw new ToolFilesystemError(
      "OUTSIDE_WORKSPACE",
      `${operation} denied: path resolves outside configured workspace roots.`,
      { requestedPath, candidateAbsolute }
    );
  }

  for (const workspaceRoot of lexicalMatches) {
    try {
      const lstat = await fsp.lstat(candidateAbsolute).catch(() => null);
      if (lstat) {
        if (lstat.isSymbolicLink()) {
          throw new ToolFilesystemError(
            "SYMLINK_DENIED",
            `${operation} denied: direct symlink targets are blocked.`,
            { requestedPath, candidateAbsolute }
          );
        }
        const real = await fsp.realpath(candidateAbsolute);
        if (!isWithinPath(real, workspaceRoot)) {
          throw new ToolFilesystemError(
            "SYMLINK_ESCAPE",
            `${operation} denied: resolved path escapes workspace boundary.`,
            { requestedPath, candidateAbsolute, resolvedPath: real }
          );
        }
        const relativePath = path.relative(workspaceRoot, real);
        return {
          workspaceRoot,
          absolutePath: real,
          relativePath,
          exists: true,
          lstat
        };
      }

      if (requireExisting) {
        throw new ToolFilesystemError(
          "PATH_NOT_FOUND",
          `${operation} denied: target path does not exist.`,
          { requestedPath, candidateAbsolute }
        );
      }
      if (!allowCreate) {
        throw new ToolFilesystemError(
          "PATH_NOT_FOUND",
          `${operation} denied: target path does not exist.`,
          { requestedPath, candidateAbsolute }
        );
      }

      const ancestor = await resolveExistingAncestor(candidateAbsolute);
      if (!ancestor) {
        throw new ToolFilesystemError(
          "PATH_INVALID",
          `${operation} denied: could not resolve an existing ancestor within workspace.`,
          { requestedPath, candidateAbsolute }
        );
      }
      if (!isWithinPath(ancestor.real, workspaceRoot)) {
        throw new ToolFilesystemError(
          "SYMLINK_ESCAPE",
          `${operation} denied: ancestor path escapes workspace boundary.`,
          { requestedPath, candidateAbsolute, ancestorPath: ancestor.real }
        );
      }
      const relativePath = path.relative(workspaceRoot, candidateAbsolute);
      return {
        workspaceRoot,
        absolutePath: candidateAbsolute,
        relativePath,
        exists: false,
        lstat: null
      };
    } catch (error) {
      if (error instanceof ToolFilesystemError) throw error;
    }
  }

  throw new ToolFilesystemError(
    "OUTSIDE_WORKSPACE",
    `${operation} denied: target path could not be validated against workspace roots.`,
    { requestedPath, candidateAbsolute }
  );
}

function enforceNonSecretPath(relativePath, operation) {
  if (hasSecretPathPattern(relativePath)) {
    throw new ToolFilesystemError(
      "SENSITIVE_PATH_DENIED",
      `${operation} denied: sensitive file path class is blocked.`,
      { relativePath }
    );
  }
}

async function ensureTextReadableFile(target, args, operation) {
  if (!target.exists) {
    throw new ToolFilesystemError(
      "PATH_NOT_FOUND",
      `${operation} denied: target file does not exist.`,
      { relativePath: target.relativePath }
    );
  }
  if (!target.lstat || !target.lstat.isFile()) {
    throw new ToolFilesystemError(
      "NOT_A_FILE",
      `${operation} denied: target path must be a regular file.`,
      { relativePath: target.relativePath }
    );
  }
  enforceNonSecretPath(target.relativePath, operation);
  const maxBytes = clampInt(args?.maxBytes, DEFAULT_MAX_TEXT_BYTES, 1024, 4 * 1024 * 1024);
  if (target.lstat.size > maxBytes) {
    throw new ToolFilesystemError(
      "FILE_TOO_LARGE",
      `${operation} denied: file exceeds size limit (${maxBytes} bytes).`,
      { relativePath: target.relativePath, sizeBytes: target.lstat.size, maxBytes }
    );
  }

  const buffer = await fsp.readFile(target.absolutePath);
  const classByName = classifyFileByName(target.absolutePath);
  const classByContent = isLikelyBinaryBuffer(buffer) ? "BINARY" : "TEXT";
  if (classByName === "BINARY" || classByContent === "BINARY") {
    throw new ToolFilesystemError(
      "BINARY_DENIED",
      `${operation} denied: binary file class is not permitted for this operation.`,
      { relativePath: target.relativePath, classByName, classByContent }
    );
  }

  return {
    text: buffer.toString("utf8"),
    sizeBytes: buffer.length
  };
}

async function runFilesystemList(call, context) {
  const args = asRecord(call.args) || {};
  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path) || ".",
    allowCreate: false,
    requireExisting: true,
    operation: call.tool
  });
  if (!target.lstat || !target.lstat.isDirectory()) {
    throw new ToolFilesystemError("NOT_A_DIRECTORY", `${call.tool} requires a directory path.`, {
      relativePath: target.relativePath
    });
  }

  const recursive = asBoolean(args.recursive, false);
  const includeHidden = asBoolean(args.includeHidden, false);
  const maxDepth = recursive ? clampInt(args.maxDepth, 4, 1, 10) : 1;
  const maxEntries = clampInt(args.maxEntries, DEFAULT_MAX_LIST_ENTRIES, 1, 5000);

  const queue = [{ abs: target.absolutePath, rel: target.relativePath || ".", depth: 0 }];
  const entries = [];
  let truncated = false;
  while (queue.length) {
    const current = queue.shift();
    const children = await fsp.readdir(current.abs, { withFileTypes: true });
    for (const child of children) {
      if (!includeHidden && child.name.startsWith(".")) continue;
      const absChild = path.join(current.abs, child.name);
      const relChild = path.relative(target.workspaceRoot, absChild);
      const isSymlink = child.isSymbolicLink();
      const kind = child.isDirectory()
        ? "dir"
        : child.isFile()
        ? "file"
        : isSymlink
        ? "symlink"
        : "other";
      entries.push({ path: relChild, kind });
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      if (recursive && child.isDirectory() && !isSymlink && current.depth + 1 < maxDepth) {
        queue.push({ abs: absChild, rel: relChild, depth: current.depth + 1 });
      }
    }
    if (truncated) break;
  }

  const summaryLines = entries.slice(0, 80).map((entry) => `${entry.kind.padEnd(7)} ${entry.path}`);
  const suffix = truncated ? `\n... truncated at ${maxEntries} entries.` : "";
  return {
    answer:
      `filesystem.list ${target.relativePath || "."} (${entries.length} entries)` +
      `\n${summaryLines.join("\n")}${suffix}`,
    audit: {
      operation: call.tool,
      relativePath: target.relativePath || ".",
      recursive,
      maxDepth,
      entryCount: entries.length,
      truncated
    }
  };
}

async function runFilesystemRead(call, context) {
  const args = asRecord(call.args) || {};
  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path),
    allowCreate: false,
    requireExisting: true,
    operation: call.tool
  });
  const loaded = await ensureTextReadableFile(target, args, call.tool);
  const maxOutputChars = clampInt(args.maxOutputChars, 12000, 256, 200000);
  const truncated = loaded.text.length > maxOutputChars;
  const content = truncated ? `${loaded.text.slice(0, maxOutputChars)}\n...[truncated]` : loaded.text;
  return {
    answer:
      `filesystem.read ${target.relativePath} (${loaded.sizeBytes} bytes, sha256=${hashContent(loaded.text)})\n` +
      "----- file content -----\n" +
      content,
    audit: {
      operation: call.tool,
      relativePath: target.relativePath,
      sizeBytes: loaded.sizeBytes,
      truncated
    }
  };
}

async function runFilesystemSearch(call, context) {
  const args = asRecord(call.args) || {};
  const query = asTrimmed(args.query);
  if (!query) {
    throw new ToolFilesystemError(
      "QUERY_REQUIRED",
      `${call.tool} requires args.query to be a non-empty string.`
    );
  }
  const caseSensitive = asBoolean(args.caseSensitive, false);
  const needle = caseSensitive ? query : query.toLowerCase();
  const maxResults = clampInt(args.maxResults, DEFAULT_MAX_SEARCH_RESULTS, 1, 2000);
  const maxBytesPerFile = clampInt(args.maxBytesPerFile, DEFAULT_MAX_SEARCH_BYTES, 512, 4 * 1024 * 1024);
  const maxFiles = clampInt(args.maxFiles, DEFAULT_MAX_SEARCH_FILES, 1, 10000);

  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path) || ".",
    allowCreate: false,
    requireExisting: true,
    operation: call.tool
  });

  const files = [];
  if (target.lstat && target.lstat.isFile()) {
    files.push(target.absolutePath);
  } else if (target.lstat && target.lstat.isDirectory()) {
    const stack = [target.absolutePath];
    while (stack.length && files.length < maxFiles) {
      const dir = stack.pop();
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          stack.push(abs);
          continue;
        }
        if (entry.isFile()) {
          files.push(abs);
          if (files.length >= maxFiles) break;
        }
      }
    }
  } else {
    throw new ToolFilesystemError("NOT_SEARCHABLE", `${call.tool} target must be a file or directory.`);
  }

  const matches = [];
  let scannedFiles = 0;
  let skippedBinary = 0;
  let skippedLarge = 0;
  let skippedSensitive = 0;

  for (const file of files) {
    if (matches.length >= maxResults) break;
    const rel = path.relative(target.workspaceRoot, file);
    if (hasSecretPathPattern(rel)) {
      skippedSensitive += 1;
      continue;
    }
    const stat = await fsp.stat(file);
    if (stat.size > maxBytesPerFile) {
      skippedLarge += 1;
      continue;
    }
    const buffer = await fsp.readFile(file);
    const classByName = classifyFileByName(file);
    const classByContent = isLikelyBinaryBuffer(buffer) ? "BINARY" : "TEXT";
    if (classByName === "BINARY" || classByContent === "BINARY") {
      skippedBinary += 1;
      continue;
    }
    scannedFiles += 1;
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const haystack = caseSensitive ? line : line.toLowerCase();
      const index = haystack.indexOf(needle);
      if (index === -1) continue;
      matches.push({
        path: rel,
        line: i + 1,
        column: index + 1,
        snippet: line.slice(0, 240)
      });
      if (matches.length >= maxResults) break;
    }
  }

  const preview = matches
    .slice(0, 120)
    .map((match) => `${match.path}:${match.line}:${match.column}: ${match.snippet}`)
    .join("\n");
  return {
    answer:
      `filesystem.search query=${JSON.stringify(query)} matches=${matches.length}\n` +
      (preview || "(no matches)") +
      `\n-- scannedFiles=${scannedFiles} skippedBinary=${skippedBinary} skippedLarge=${skippedLarge} skippedSensitive=${skippedSensitive}`,
    audit: {
      operation: call.tool,
      basePath: target.relativePath || ".",
      queryLength: query.length,
      scannedFiles,
      matches: matches.length,
      skippedBinary,
      skippedLarge,
      skippedSensitive
    }
  };
}

async function runFilesystemWrite(call, context) {
  const args = asRecord(call.args) || {};
  const content = typeof args.content === "string" ? args.content : null;
  if (content === null) {
    throw new ToolFilesystemError(
      "CONTENT_REQUIRED",
      `${call.tool} requires args.content as a string.`
    );
  }
  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path),
    allowCreate: true,
    requireExisting: false,
    operation: call.tool
  });
  enforceNonSecretPath(target.relativePath, call.tool);

  const maxWriteBytes = clampInt(args.maxBytes, DEFAULT_MAX_WRITE_BYTES, 256, 4 * 1024 * 1024);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxWriteBytes) {
    throw new ToolFilesystemError(
      "CONTENT_TOO_LARGE",
      `${call.tool} denied: content exceeds maxBytes (${maxWriteBytes}).`,
      { relativePath: target.relativePath, bytes, maxWriteBytes }
    );
  }

  const overwrite = asBoolean(args.overwrite, false);
  if (target.exists) {
    if (!target.lstat || !target.lstat.isFile()) {
      throw new ToolFilesystemError(
        "NOT_A_FILE",
        `${call.tool} denied: existing target is not a regular file.`,
        { relativePath: target.relativePath }
      );
    }
    if (!overwrite) {
      throw new ToolFilesystemError(
        "FILE_EXISTS",
        `${call.tool} denied: file already exists and overwrite=false.`,
        { relativePath: target.relativePath }
      );
    }
    const classByName = classifyFileByName(target.absolutePath);
    if (classByName === "BINARY") {
      throw new ToolFilesystemError(
        "BINARY_DENIED",
        `${call.tool} denied: binary file class is not writable via text write.`,
        { relativePath: target.relativePath }
      );
    }
  } else {
    const classByName = classifyFileByName(target.absolutePath);
    if (classByName === "BINARY") {
      throw new ToolFilesystemError(
        "BINARY_DENIED",
        `${call.tool} denied: binary extension is blocked for text write.`,
        { relativePath: target.relativePath }
      );
    }
  }

  await fsp.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await fsp.writeFile(target.absolutePath, content, "utf8");
  return {
    answer:
      `filesystem.write ${target.relativePath} (${bytes} bytes, sha256=${hashContent(content)})`,
    audit: {
      operation: call.tool,
      relativePath: target.relativePath,
      bytes,
      overwrite,
      created: !target.exists
    }
  };
}

async function runFilesystemEdit(call, context) {
  const args = asRecord(call.args) || {};
  const search = asTrimmed(args.search);
  if (!search) {
    throw new ToolFilesystemError("SEARCH_REQUIRED", `${call.tool} requires args.search.`);
  }
  const replace = typeof args.replace === "string" ? args.replace : null;
  if (replace === null) {
    throw new ToolFilesystemError("REPLACE_REQUIRED", `${call.tool} requires args.replace.`);
  }

  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path),
    allowCreate: false,
    requireExisting: true,
    operation: call.tool
  });
  const loaded = await ensureTextReadableFile(target, args, call.tool);
  const replaceAll = asBoolean(args.all, false);
  const occurrences = loaded.text.split(search).length - 1;
  if (occurrences < 1) {
    throw new ToolFilesystemError(
      "PATTERN_NOT_FOUND",
      `${call.tool} denied: search pattern not found in file.`,
      { relativePath: target.relativePath }
    );
  }
  const next = replaceAll
    ? loaded.text.split(search).join(replace)
    : loaded.text.replace(search, replace);
  await fsp.writeFile(target.absolutePath, next, "utf8");

  return {
    answer:
      `filesystem.edit ${target.relativePath} replacements=${replaceAll ? occurrences : 1} ` +
      `(sha256=${hashContent(next)})`,
    audit: {
      operation: call.tool,
      relativePath: target.relativePath,
      replaceAll,
      replacements: replaceAll ? occurrences : 1
    }
  };
}

async function runFilesystemMkdir(call, context) {
  const args = asRecord(call.args) || {};
  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path),
    allowCreate: true,
    requireExisting: false,
    operation: call.tool
  });
  enforceNonSecretPath(target.relativePath, call.tool);
  const recursive = asBoolean(args.recursive, true);
  await fsp.mkdir(target.absolutePath, { recursive });
  return {
    answer: `filesystem.mkdir ${target.relativePath} recursive=${recursive}`,
    audit: {
      operation: call.tool,
      relativePath: target.relativePath,
      recursive,
      existed: target.exists
    }
  };
}

async function runFilesystemStat(call, context) {
  const args = asRecord(call.args) || {};
  const target = await resolveTargetPath({
    workspaceRoots: context.workspaceRoots,
    requestedPath: asTrimmed(args.path),
    allowCreate: false,
    requireExisting: true,
    operation: call.tool
  });
  const stat = await fsp.stat(target.absolutePath);
  const kind = stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
  return {
    answer:
      `filesystem.stat ${target.relativePath} kind=${kind} bytes=${stat.size} ` +
      `mtime=${stat.mtime.toISOString()}`,
    audit: {
      operation: call.tool,
      relativePath: target.relativePath,
      kind,
      sizeBytes: stat.size
    }
  };
}

async function executeFilesystemToolCall(call, context) {
  if (!call || !call.tool) {
    throw new ToolFilesystemError("CALL_REQUIRED", "Filesystem tool call payload is missing.");
  }
  if (!context || !Array.isArray(context.workspaceRoots) || !context.workspaceRoots.length) {
    throw new ToolFilesystemError(
      "WORKSPACE_UNAVAILABLE",
      "Filesystem tool context is missing workspace roots."
    );
  }

  if (call.tool === "filesystem.list") return runFilesystemList(call, context);
  if (call.tool === "filesystem.read") return runFilesystemRead(call, context);
  if (call.tool === "filesystem.search") return runFilesystemSearch(call, context);
  if (call.tool === "filesystem.write") return runFilesystemWrite(call, context);
  if (call.tool === "filesystem.edit" || call.tool === "filesystem.patch") {
    return runFilesystemEdit(call, context);
  }
  if (call.tool === "filesystem.mkdir") return runFilesystemMkdir(call, context);
  if (call.tool === "filesystem.stat") return runFilesystemStat(call, context);

  throw new ToolFilesystemError(
    "UNSUPPORTED_TOOL",
    `Filesystem runtime does not support ${call.tool} in this phase.`
  );
}

async function resolveFilesystemToolContext(options = {}) {
  const workspaceRoots = await resolveWorkspaceRoots(options);
  return {
    workspaceRoots,
    primaryWorkspaceRoot: workspaceRoots[0]
  };
}

module.exports = {
  ToolFilesystemError,
  resolveFilesystemToolContext,
  executeFilesystemToolCall
};

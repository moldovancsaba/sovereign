#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runMcpSession(lines) {
  const appDir = path.resolve(__dirname, "..", "..");
  const input = lines.join("\n") + "\n";
  const out = spawnSync(process.execPath, ["scripts/mcp-docs-server.js"], {
    cwd: appDir,
    input,
    encoding: "utf8",
    env: { ...process.env, SOVEREIGN_DOCS_REPO_ROOT: path.resolve(appDir, "..", "..") }
  });
  assert(out.status === 0, `mcp-docs-server exit ${out.status}: ${out.stderr || out.stdout}`);
  return out.stdout.trim().split("\n").filter(Boolean);
}

function parseResponses(stdoutLines) {
  return stdoutLines.map((l) => JSON.parse(l));
}

const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } };
const notified = { jsonrpc: "2.0", method: "notifications/initialized" };
const listRes = { jsonrpc: "2.0", id: 2, method: "resources/list" };
const readRes = {
  jsonrpc: "2.0",
  id: 3,
  method: "resources/read",
  params: { uri: "doc://runbooks/getting-started" }
};
const readBad = { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "doc://missing/uri" } };

const lines = runMcpSession([
  JSON.stringify(init),
  JSON.stringify(notified),
  JSON.stringify(listRes),
  JSON.stringify(readRes),
  JSON.stringify(readBad)
]);

const msgs = parseResponses(lines);
const byId = Object.fromEntries(msgs.filter((m) => m.id != null).map((m) => [m.id, m]));

assert(byId[1].result?.serverInfo?.name === "sovereign-docs", "initialize server name");
const resources = byId[2].result?.resources;
assert(Array.isArray(resources) && resources.length >= 1, "resources/list");
const uris = resources.map((r) => r.uri);
assert(
  uris.includes("doc://runbooks/getting-started"),
  "expected doc://runbooks/getting-started in list"
);

const read = byId[3].result?.contents?.[0];
assert(read?.mimeType === "text/markdown", "read mimeType");
assert(String(read?.text || "").includes("sovereign"), "runbook body should mention product");

assert(byId[4].error?.code === -32602, "unknown URI should return -32602");

console.log(JSON.stringify({ ok: true, resourceCount: resources.length }, null, 2));

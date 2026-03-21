#!/usr/bin/env node
/**
 * MCP server for repo / runbook docs (LLD-007 slice). Read-only resources over stdio.
 * URIs use scheme doc:// (e.g. doc://runbooks/getting-started).
 * Content is read from the repository; optional remote wiki HTTP bridge can be added later.
 */
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const readline = require("node:readline");

function getRepoRoot() {
  const env = process.env.SOVEREIGN_DOCS_REPO_ROOT;
  if (env && String(env).trim()) {
    return path.resolve(String(env).trim());
  }
  return path.resolve(__dirname, "..", "..", "..");
}

/** @type {{ uri: string; relpath: string; name: string; title: string; mimeType: string }[]} */
const RESOURCE_MAP = [
  {
    uri: "doc://runbooks/getting-started",
    relpath: "docs/runbooks/getting-started.md",
    name: "runbooks-getting-started",
    title: "Runbook: Getting started",
    mimeType: "text/markdown"
  },
  {
    uri: "doc://project/ssot-board",
    relpath: "docs/SOVEREIGN_PROJECT_BOARD_SSOT.md",
    name: "ssot-project-board",
    title: "Project board SSOT",
    mimeType: "text/markdown"
  }
];

function send(msg) {
  console.log(JSON.stringify(msg));
}

function handleResourcesList() {
  const resources = RESOURCE_MAP.map((r) => ({
    uri: r.uri,
    name: r.name,
    title: r.title,
    mimeType: r.mimeType,
    description: `Repo file: ${r.relpath}`
  }));
  return { resources };
}

function handleResourcesRead(uri) {
  const u = String(uri || "").trim();
  const entry = RESOURCE_MAP.find((r) => r.uri === u);
  if (!entry) {
    return { _badUri: true, uri: u };
  }
  const abs = path.join(getRepoRoot(), entry.relpath);
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (e) {
    return { _ioError: true, uri: u, message: String(e?.message || e) };
  }
  return {
    contents: [{ uri: u, mimeType: entry.mimeType, text }]
  };
}

async function handleRequest(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return;

  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            resources: { subscribe: false, listChanged: false }
          },
          serverInfo: { name: "sovereign-docs", version: "1.0.0" }
        }
      });
      return;
    }
    if (method === "notifications/initialized") return;
    if (method === "resources/list") {
      send({ jsonrpc: "2.0", id, result: handleResourcesList() });
      return;
    }
    if (method === "resources/read") {
      const uri = params?.uri;
      const readResult = handleResourcesRead(uri);
      if (readResult._badUri) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Invalid or unknown resource URI: ${readResult.uri || uri}` }
        });
        return;
      }
      if (readResult._ioError) {
        send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32002,
            message: `Resource unavailable (file missing or unreadable): ${readResult.uri}`,
            data: readResult.message
          }
        });
        return;
      }
      send({ jsonrpc: "2.0", id, result: readResult });
      return;
    }
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: String(err?.message || err) }
    });
  }
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      handleRequest(parsed);
    } catch (_) {
      // ignore non-JSON
    }
  });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

main();

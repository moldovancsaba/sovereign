#!/usr/bin/env node
/**
 * MCP server for repo runbooks + optional wiki (BookStack or Outline). Read-only resources over stdio.
 * Static: doc://runbooks/…, doc://project/…
 * Wiki: doc://wiki/bookstack/page/{id} | doc://wiki/outline/doc/{uuid}
 */
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const readline = require("node:readline");
const wikiAdapter = require("./lib/wiki-adapter");

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

function staticResourceMeta() {
  return RESOURCE_MAP.map((r) => ({
    uri: r.uri,
    name: r.name,
    title: r.title,
    mimeType: r.mimeType,
    description: `Repo file: ${r.relpath}`
  }));
}

async function buildResourcesList() {
  const resources = staticResourceMeta();
  if (!wikiAdapter.isWikiConfigured()) {
    return { resources };
  }
  try {
    const wikiRows = await wikiAdapter.listWikiResourcesForMcp();
    resources.push(...wikiRows);
  } catch (err) {
    console.error("[mcp-docs] wiki resources list failed:", err?.message || err);
  }
  return { resources };
}

function readStaticFile(uri) {
  const entry = RESOURCE_MAP.find((r) => r.uri === uri);
  if (!entry) {
    return { _badUri: true, uri };
  }
  const abs = path.join(getRepoRoot(), entry.relpath);
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (e) {
    return { _ioError: true, uri, message: String(e?.message || e) };
  }
  return {
    contents: [{ uri, mimeType: entry.mimeType, text }]
  };
}

async function handleResourcesRead(uri) {
  const u = String(uri || "").trim();
  if (/^doc:\/\/wiki\//i.test(u)) {
    return wikiAdapter.readWikiResourceForMcp(u);
  }
  return readStaticFile(u);
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
          serverInfo: { name: "sovereign-docs", version: "1.2.0" }
        }
      });
      return;
    }
    if (method === "notifications/initialized") return;
    if (method === "resources/list") {
      const result = await buildResourcesList();
      send({ jsonrpc: "2.0", id, result });
      return;
    }
    if (method === "resources/read") {
      const uri = params?.uri;
      const readResult = await handleResourcesRead(uri);
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
      if (readResult._wikiError) {
        send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32002,
            message: `Wiki unavailable: ${readResult.uri}`,
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
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    void handleRequest(parsed);
  });
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

main();

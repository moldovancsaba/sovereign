#!/usr/bin/env node
/**
 * MCP server for project memory (LLD-006). Lexical + optional semantic search, list, get — stdio JSON-RPC.
 * Tool names use underscores (MCP convention); maps to memory.search, memory.list_recent, memory.get.
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");
const { executeMemoryToolCall } = require("./lib/tool-memory");
const readline = require("node:readline");

const prisma = new PrismaClient();

const MCP_TO_INTERNAL = {
  memory_search: "memory.search",
  memory_list_recent: "memory.list_recent",
  memory_get: "memory.get"
};

const KIND_ENUM = [
  "THREAD",
  "PROJECT",
  "AGENT",
  "EVIDENCE",
  "PO_PRODUCT",
  "DECISION",
  "OTHER"
];

const TOOLS = [
  {
    name: "memory_search",
    description:
      "Search project memory by text. Lexical match on title/summary/content; optional semantic search via Ollama + pgvector when semantic is true (default). Requires projectSessionId.",
    inputSchema: {
      type: "object",
      properties: {
        projectSessionId: { type: "string", description: "Project session ID (cuid)" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max hits per channel (default 8, max 20)" },
        kinds: {
          type: "array",
          items: { type: "string", enum: KIND_ENUM },
          description: "Optional filter by ProjectMemory kind"
        },
        semantic: {
          type: "boolean",
          description: "If false, skip Ollama embedding / vector search (lexical only)"
        }
      },
      required: ["projectSessionId", "query"]
    }
  },
  {
    name: "memory_list_recent",
    description: "List recent project memory rows for a session (newest first).",
    inputSchema: {
      type: "object",
      properties: {
        projectSessionId: { type: "string" },
        limit: { type: "number", description: "Default 12, max 40" },
        kinds: {
          type: "array",
          items: { type: "string", enum: KIND_ENUM }
        }
      },
      required: ["projectSessionId"]
    }
  },
  {
    name: "memory_get",
    description: "Get one project memory record by id (full text fields, no embedding vector).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    }
  }
];

function send(msg) {
  console.log(JSON.stringify(msg));
}

const OPERATOR_GUIDE_MD = `# Project memory (MCP)

Tools: **memory_search**, **memory_list_recent**, **memory_get** (underscore names). Prefer \`projectSessionId\` from context; the worker injects it when omitted.

Kinds: THREAD, PROJECT, AGENT, EVIDENCE, PO_PRODUCT, DECISION, OTHER. Status CAPTURED/REVIEWED are searchable.

Resources: read **sovereign-memory://docs/operator-guide** (this file) or **sovereign-memory://memory/{id}** for one row (JSON, no embedding vector).

Worker prompt injection: default **THREAD** scope (chat messages). Payload \`memory.scope\` = **PROJECT_SESSION** uses durable \`ProjectMemory\` for the active project session (lexical match on title/summary/content).
`;

const MCP_RESOURCES = [
  {
    uri: "sovereign-memory://docs/operator-guide",
    name: "operator-guide",
    title: "Project memory operator guide",
    description: "LLD-006 MCP memory tools, kinds, and worker THREAD vs PROJECT_SESSION scopes.",
    mimeType: "text/markdown"
  }
];

function handleResourcesList() {
  return { resources: MCP_RESOURCES };
}

async function handleResourcesRead(uri) {
  const u = String(uri || "").trim();
  if (u === "sovereign-memory://docs/operator-guide") {
    return {
      contents: [{ uri: u, mimeType: "text/markdown", text: OPERATOR_GUIDE_MD }]
    };
  }
  const m = /^sovereign-memory:\/\/memory\/([^/?#]+)$/.exec(u);
  if (m) {
    const memoryId = m[1];
    const row = await prisma.projectMemory.findUnique({
      where: { id: memoryId },
      select: {
        id: true,
        projectSessionId: true,
        threadId: true,
        taskId: true,
        title: true,
        summary: true,
        content: true,
        status: true,
        kind: true,
        sourceKind: true,
        sourceUrl: true,
        sourceAgentKey: true,
        embeddingModel: true,
        embeddingDimensions: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!row) {
      return { _notFound: true, uri: u };
    }
    return {
      contents: [
        {
          uri: u,
          mimeType: "application/json",
          text: JSON.stringify(row, null, 2)
        }
      ]
    };
  }
  return { _badUri: true, uri: u };
}

function handleToolsList() {
  return { tools: TOOLS };
}

async function handleToolsCall(name, args) {
  const internalTool = MCP_TO_INTERNAL[name];
  if (!internalTool) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true
    };
  }
  const call = { id: "mcp-1", tool: internalTool, args: args || {} };
  try {
    const { answer } = await executeMemoryToolCall(call, prisma);
    return {
      content: [{ type: "text", text: answer }]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(err?.message || err) }) }],
      isError: true
    };
  }
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
            tools: {},
            resources: { subscribe: false, listChanged: false }
          },
          serverInfo: { name: "sovereign-memory", version: "1.0.0" }
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
      const readResult = await handleResourcesRead(uri);
      if (readResult._notFound) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32002, message: `Resource not found: ${readResult.uri}` }
        });
        return;
      }
      if (readResult._badUri) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Invalid or unknown resource URI: ${readResult.uri || uri}` }
        });
        return;
      }
      send({ jsonrpc: "2.0", id, result: readResult });
      return;
    }
    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: handleToolsList() });
      return;
    }
    if (method === "tools/call") {
      const { name, arguments: toolArgs } = params || {};
      const result = await handleToolsCall(name, toolArgs);
      send({ jsonrpc: "2.0", id, result });
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

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      void handleRequest(msg);
    } catch (_) {
      // ignore parse errors for non-JSON lines
    }
  });

  const close = () => {
    prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

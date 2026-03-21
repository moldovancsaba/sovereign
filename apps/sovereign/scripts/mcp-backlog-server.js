#!/usr/bin/env node
/**
 * MCP server for backlog (LLD-005). Exposes backlog operations as MCP tools over stdio.
 * Uses same Prisma + tool-backlog logic as the worker. Tool names use underscore (MCP convention).
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");
const { executeBacklogToolCall } = require("./lib/tool-backlog");
const readline = require("node:readline");

const prisma = new PrismaClient();

// MCP tool name (underscore) -> internal tool name (dot)
const MCP_TO_INTERNAL = {
  backlog_list_boards: "backlog.list_boards",
  backlog_list_items: "backlog.list_items",
  backlog_get_item: "backlog.get_item",
  backlog_create_item: "backlog.create_item",
  backlog_update_item: "backlog.update_item",
  backlog_add_feedback: "backlog.add_feedback"
};

const TOOLS = [
  {
    name: "backlog_list_boards",
    description: "List all backlog boards.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "backlog_list_items",
    description: "List backlog items. Optional: boardId, status, goalId.",
    inputSchema: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "Board ID (default: default board)" },
        status: { type: "string", enum: ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] },
        goalId: { type: "string", description: "Filter by goal ID" }
      }
    }
  },
  {
    name: "backlog_get_item",
    description: "Get a single backlog item by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Backlog item ID" } },
      required: ["id"]
    }
  },
  {
    name: "backlog_create_item",
    description: "Create a backlog item.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        goalId: { type: "string" },
        status: { type: "string" },
        priority: { type: "number" },
        boardId: { type: "string" },
        acceptanceCriteria: { type: "array", items: { type: "string" } }
      },
      required: ["title"]
    }
  },
  {
    name: "backlog_update_item",
    description: "Update a backlog item.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        goalId: { type: "string" },
        status: { type: "string" },
        priority: { type: "number" },
        sortOrder: { type: "number" },
        threadId: { type: "string" },
        acceptanceCriteria: { type: "array", items: { type: "string" } }
      },
      required: ["id"]
    }
  },
  {
    name: "backlog_add_feedback",
    description: "Add PO feedback to a backlog item. kind: ACCEPTED | REJECTED | CHANGE_REQUEST",
    inputSchema: {
      type: "object",
      properties: {
        backlogItemId: { type: "string" },
        kind: { type: "string", enum: ["ACCEPTED", "REJECTED", "CHANGE_REQUEST"] },
        reason: { type: "string" }
      },
      required: ["backlogItemId", "kind"]
    }
  }
];

function send(msg) {
  console.log(JSON.stringify(msg));
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
    const { answer } = await executeBacklogToolCall(call, prisma);
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
          capabilities: { tools: {} },
          serverInfo: { name: "sovereign-backlog", version: "1.0.0" }
        }
      });
      return;
    }
    if (method === "notifications/initialized") return;
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
      handleRequest(msg);
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

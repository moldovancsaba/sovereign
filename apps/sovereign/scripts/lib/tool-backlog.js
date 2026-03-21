/**
 * Backlog tools for the worker. Agent can list/create/update backlog items and add feedback.
 * Uses Prisma (same DB as the app). All mutations go through this module (no direct ad-hoc DB).
 */
const DEFAULT_BOARD_SCOPE = "default";
const VALID_STATUSES = new Set([
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED"
]);
const VALID_FEEDBACK_KINDS = new Set(["ACCEPTED", "REJECTED", "CHANGE_REQUEST"]);

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getOrCreateDefaultBoard(prisma) {
  let board = await prisma.backlogBoard.findUnique({
    where: { productScope: DEFAULT_BOARD_SCOPE }
  });
  if (!board) {
    board = await prisma.backlogBoard.create({
      data: { name: "Backlog", productScope: DEFAULT_BOARD_SCOPE }
    });
  }
  return board;
}

async function runListBoards(prisma) {
  const boards = await prisma.backlogBoard.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, productScope: true }
  });
  return { answer: JSON.stringify(boards, null, 2), audit: {} };
}

async function runListItems(prisma, args) {
  let boardId = asTrimmed(args.boardId);
  if (!boardId) {
    const defaultBoard = await getOrCreateDefaultBoard(prisma);
    boardId = defaultBoard.id;
  }
  const status = asTrimmed(args.status);
  const goalId = asTrimmed(args.goalId) || null;
  const where = { boardId };
  if (status && VALID_STATUSES.has(status)) where.status = status;
  if (goalId) where.goalId = goalId;
  const items = await prisma.backlogItem.findMany({
    where,
    orderBy: [{ priority: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      goal: { select: { id: true, title: true } }
    }
  });
  return { answer: JSON.stringify(items, null, 2), audit: { count: items.length } };
}

async function runGetItem(prisma, args) {
  const id = asTrimmed(args.id);
  if (!id) return { answer: JSON.stringify({ error: "args.id is required" }), audit: {} };
  const item = await prisma.backlogItem.findUnique({
    where: { id },
    include: {
      goal: true,
      feedback: { orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
  if (!item) return { answer: JSON.stringify({ error: "Not found" }), audit: {} };
  return { answer: JSON.stringify(item, null, 2), audit: {} };
}

async function runCreateItem(prisma, args) {
  const title = asTrimmed(args.title);
  if (!title) return { answer: JSON.stringify({ error: "args.title is required" }), audit: {} };
  let boardId = asTrimmed(args.boardId);
  if (!boardId) {
    const defaultBoard = await getOrCreateDefaultBoard(prisma);
    boardId = defaultBoard.id;
  }
  const description = asTrimmed(args.description) || null;
  const goalId = asTrimmed(args.goalId) || null;
  let status = asTrimmed(args.status);
  if (!status || !VALID_STATUSES.has(status)) status = "BACKLOG";
  const priority = typeof args.priority === "number" ? args.priority : 0;
  const acceptanceCriteria = Array.isArray(args.acceptanceCriteria)
    ? args.acceptanceCriteria
    : typeof args.acceptanceCriteria === "string"
    ? args.acceptanceCriteria.split("\n").filter(Boolean)
    : null;
  const item = await prisma.backlogItem.create({
    data: {
      boardId,
      goalId,
      title,
      description,
      acceptanceCriteria: acceptanceCriteria && acceptanceCriteria.length ? acceptanceCriteria : undefined,
      status,
      priority,
      createdById: null
    },
    include: { goal: { select: { id: true, title: true } } }
  });
  return {
    answer: `Created backlog item: ${item.id} — ${item.title}`,
    audit: { id: item.id, title: item.title }
  };
}

async function runUpdateItem(prisma, args) {
  const id = asTrimmed(args.id);
  if (!id) return { answer: JSON.stringify({ error: "args.id is required" }), audit: {} };
  const data = {};
  if (typeof args.title === "string") data.title = args.title.trim();
  if (args.description !== undefined) data.description = args.description === null || args.description === "" ? null : String(args.description);
  if (args.goalId !== undefined) data.goalId = args.goalId === null || args.goalId === "" ? null : args.goalId;
  if (Array.isArray(args.acceptanceCriteria)) data.acceptanceCriteria = args.acceptanceCriteria;
  if (typeof args.priority === "number") data.priority = args.priority;
  if (typeof args.sortOrder === "number") data.sortOrder = args.sortOrder;
  if (args.threadId !== undefined) data.threadId = typeof args.threadId === "string" && args.threadId ? args.threadId : null;
  if (VALID_STATUSES.has(args.status)) data.status = args.status;
  if (Object.keys(data).length === 0) return { answer: JSON.stringify({ error: "No fields to update" }), audit: {} };
  const item = await prisma.backlogItem.update({
    where: { id },
    data,
    include: { goal: { select: { id: true, title: true } } }
  });
  return {
    answer: `Updated backlog item: ${item.id} — ${item.title} (status: ${item.status})`,
    audit: { id: item.id, status: item.status }
  };
}

async function runAddFeedback(prisma, args) {
  const backlogItemId = asTrimmed(args.backlogItemId);
  if (!backlogItemId) return { answer: JSON.stringify({ error: "args.backlogItemId is required" }), audit: {} };
  const kind = asTrimmed(args.kind).toUpperCase();
  if (!VALID_FEEDBACK_KINDS.has(kind)) {
    return {
      answer: JSON.stringify({ error: `args.kind must be one of: ${[...VALID_FEEDBACK_KINDS].join(", ")}` }),
      audit: {}
    };
  }
  const reason = asTrimmed(args.reason) || null;
  await prisma.pOFeedback.create({
    data: { backlogItemId, kind, reason, createdById: null }
  });
  return {
    answer: `Added PO feedback (${kind}) to item ${backlogItemId}.`,
    audit: { backlogItemId, kind }
  };
}

/**
 * Execute a single backlog tool call. call.tool must be one of:
 * backlog.list_boards, backlog.list_items, backlog.get_item,
 * backlog.create_item, backlog.update_item, backlog.add_feedback
 * @param {{ id: string, tool: string, args: object }} call
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {{ answer: string, audit?: object }}
 */
async function executeBacklogToolCall(call, prisma) {
  if (!call || !call.tool) {
    return { answer: JSON.stringify({ error: "Invalid call: tool required" }), audit: {} };
  }
  const args = asRecord(call.args) || {};
  if (call.tool === "backlog.list_boards") return runListBoards(prisma);
  if (call.tool === "backlog.list_items") return runListItems(prisma, args);
  if (call.tool === "backlog.get_item") return runGetItem(prisma, args);
  if (call.tool === "backlog.create_item") return runCreateItem(prisma, args);
  if (call.tool === "backlog.update_item") return runUpdateItem(prisma, args);
  if (call.tool === "backlog.add_feedback") return runAddFeedback(prisma, args);
  return {
    answer: JSON.stringify({
      error: `Unknown backlog tool: ${call.tool}. Supported: backlog.list_boards, backlog.list_items, backlog.get_item, backlog.create_item, backlog.update_item, backlog.add_feedback`
    }),
    audit: {}
  };
}

module.exports = {
  executeBacklogToolCall
};

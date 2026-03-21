/**
 * Local backlog service. Fully offline; no GitHub dependency.
 * Used by API routes and (later) by worker/MCP for agent-driven backlog changes.
 */
import { prisma } from "@/lib/prisma";

const DEFAULT_BOARD_SCOPE = "default";

export async function getOrCreateDefaultBoard() {
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

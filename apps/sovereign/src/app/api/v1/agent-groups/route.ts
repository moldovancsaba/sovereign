import { NextRequest, NextResponse } from "next/server";
import { AgentGroupError, createAgentGroup, listAgentGroups } from "@/lib/agent-groups";
import { isSovereignApiAuthorized } from "@/lib/sovereign-api-auth";

function errorResponse(status: number, message: string, code: string, param: string | null = null) {
  return NextResponse.json(
    {
      error: {
        message,
        type: status === 401 ? "authentication_error" : "invalid_request_error",
        code,
        param
      }
    },
    { status }
  );
}

export async function GET(req: NextRequest) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }
  const groups = await listAgentGroups();
  return NextResponse.json(
    groups.map((row) => ({
      id: row.id,
      key: row.key,
      display_name: row.displayName,
      description: row.description,
      active: row.active,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString()
    })),
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.", "invalid_json");
  }
  const payload = body as { key?: string; displayName?: string; description?: string };
  try {
    const created = await createAgentGroup({
      key: payload?.key || "",
      displayName: payload?.displayName || "",
      description: payload?.description || ""
    });
    return NextResponse.json(
      {
        id: created.id,
        key: created.key,
        display_name: created.displayName,
        description: created.description,
        active: created.active,
        created_at: created.createdAt.toISOString(),
        updated_at: created.updatedAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AgentGroupError) {
      return errorResponse(error.statusCode, error.message, error.code);
    }
    return errorResponse(500, error instanceof Error ? error.message : String(error), "internal_error");
  }
}

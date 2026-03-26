import { NextRequest, NextResponse } from "next/server";
import { AgentGroupError, addAgentGroupMember, listAgentGroupMembers } from "@/lib/agent-groups";
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

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{ key: string }>;
  }
) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }
  const { key } = await context.params;
  try {
    const members = await listAgentGroupMembers(key);
    return NextResponse.json(
      members.map((m) => ({
        id: m.id,
        member_type: m.memberType,
        member_agent_key: m.memberAgentKey,
        member_group_id: m.memberGroupId,
        role: m.role,
        created_at: m.createdAt.toISOString()
      })),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AgentGroupError) {
      return errorResponse(error.statusCode, error.message, error.code);
    }
    return errorResponse(500, error instanceof Error ? error.message : String(error), "internal_error");
  }
}

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{ key: string }>;
  }
) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }
  const { key } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.", "invalid_json");
  }
  const payload = body as {
    memberType?: "AGENT" | "GROUP";
    memberAgentKey?: string;
    memberGroupKey?: string;
    role?: string;
  };
  if (payload.memberType !== "AGENT" && payload.memberType !== "GROUP") {
    return errorResponse(400, "memberType must be AGENT or GROUP.", "invalid_member_type", "memberType");
  }
  try {
    const created = await addAgentGroupMember({
      groupKey: key,
      memberType: payload.memberType,
      memberAgentKey: payload.memberAgentKey,
      memberGroupKey: payload.memberGroupKey,
      role: payload.role
    });
    return NextResponse.json(
      {
        id: created.id,
        member_type: created.memberType,
        member_agent_key: created.memberAgentKey,
        member_group_id: created.memberGroupId,
        role: created.role,
        created_at: created.createdAt.toISOString()
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

import { NextRequest, NextResponse } from "next/server";
import {
  executeSovereignChatCompletion,
  SovereignApiError,
  type SovereignChatCompletionsRequest
} from "@/lib/sovereign-api-executor";
import { isSovereignApiAuthorized } from "@/lib/sovereign-api-auth";

const MAX_BODY_BYTES = Math.max(
  1024,
  Math.min(Number(process.env.SOVEREIGN_API_MAX_BODY_BYTES || 262144), 4 * 1024 * 1024)
);

function errorResponse(params: {
  status: number;
  message: string;
  type: "invalid_request_error" | "authentication_error" | "api_error" | "server_error";
  code: string;
  param?: string | null;
}) {
  return NextResponse.json(
    {
      error: {
        message: params.message,
        type: params.type,
        code: params.code,
        param: params.param ?? null
      }
    },
    { status: params.status }
  );
}

function validatePayload(body: unknown): SovereignChatCompletionsRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SovereignApiError({
      message: "Request body must be a JSON object.",
      statusCode: 400,
      type: "invalid_request_error",
      code: "invalid_body"
    });
  }
  const payload = body as SovereignChatCompletionsRequest;
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new SovereignApiError({
      message: "messages must be a non-empty array.",
      statusCode: 400,
      type: "invalid_request_error",
      code: "invalid_messages",
      param: "messages"
    });
  }
  for (let i = 0; i < payload.messages.length; i += 1) {
    const message = payload.messages[i];
    if (!message || typeof message !== "object") {
      throw new SovereignApiError({
        message: `messages[${i}] must be an object.`,
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_message",
        param: `messages[${i}]`
      });
    }
    if (!["system", "user", "assistant"].includes(String(message.role))) {
      throw new SovereignApiError({
        message: `messages[${i}].role must be one of system|user|assistant.`,
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_message_role",
        param: `messages[${i}].role`
      });
    }
    if (!(typeof message.content === "string" || Array.isArray(message.content))) {
      throw new SovereignApiError({
        message: `messages[${i}].content must be a string or content-part array.`,
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_message_content",
        param: `messages[${i}].content`
      });
    }
  }
  if (payload.mode && !["direct", "trinity", "team", "auto"].includes(String(payload.mode))) {
    throw new SovereignApiError({
      message: "mode must be one of direct|trinity|team|auto.",
      statusCode: 400,
      type: "invalid_request_error",
      code: "invalid_mode",
      param: "mode"
    });
  }
  if (payload.provider && !["local", "cloud", "mlx", "auto", "mock"].includes(String(payload.provider))) {
    throw new SovereignApiError({
      message: "provider must be one of local|cloud|mlx|auto|mock.",
      statusCode: 400,
      type: "invalid_request_error",
      code: "invalid_provider",
      param: "provider"
    });
  }
  if (payload.temperature !== undefined) {
    if (typeof payload.temperature !== "number" || Number.isNaN(payload.temperature)) {
      throw new SovereignApiError({
        message: "temperature must be a number.",
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_temperature",
        param: "temperature"
      });
    }
  }
  if (payload.max_tokens !== undefined) {
    if (!Number.isInteger(payload.max_tokens) || payload.max_tokens <= 0) {
      throw new SovereignApiError({
        message: "max_tokens must be a positive integer.",
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_max_tokens",
        param: "max_tokens"
      });
    }
  }
  if (payload.team !== undefined) {
    if (!payload.team || typeof payload.team !== "object" || Array.isArray(payload.team)) {
      throw new SovereignApiError({
        message: "team must be an object.",
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_team",
        param: "team"
      });
    }
    if (
      payload.team.strategy !== undefined &&
      !["manual", "auto"].includes(String(payload.team.strategy))
    ) {
      throw new SovereignApiError({
        message: "team.strategy must be one of manual|auto.",
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_team_strategy",
        param: "team.strategy"
      });
    }
    if (
      payload.team.group_key !== undefined &&
      (typeof payload.team.group_key !== "string" || !payload.team.group_key.trim())
    ) {
      throw new SovereignApiError({
        message: "team.group_key must be a non-empty string when provided.",
        statusCode: 400,
        type: "invalid_request_error",
        code: "invalid_group_key",
        param: "team.group_key"
      });
    }
    if (payload.team.manual_staffing !== undefined) {
      const staffing = payload.team.manual_staffing;
      if (!staffing || typeof staffing !== "object" || Array.isArray(staffing)) {
        throw new SovereignApiError({
          message: "team.manual_staffing must be an object.",
          statusCode: 400,
          type: "invalid_request_error",
          code: "invalid_manual_staffing",
          param: "team.manual_staffing"
        });
      }
      for (const role of ["drafter", "writer", "judge"] as const) {
        const value = staffing[role];
        if (value !== undefined && (typeof value !== "string" || !value.trim())) {
          throw new SovereignApiError({
            message: `team.manual_staffing.${role} must be a non-empty string when provided.`,
            statusCode: 400,
            type: "invalid_request_error",
            code: "invalid_manual_staffing_role",
            param: `team.manual_staffing.${role}`
          });
        }
      }
    }
  }
  return payload;
}

export async function POST(req: NextRequest) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse({
      status: 401,
      message: "Unauthorized API token.",
      type: "authentication_error",
      code: "unauthorized"
    });
  }

  let body: unknown;
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse({
      status: 413,
      message: `Request body too large. Maximum is ${MAX_BODY_BYTES} bytes.`,
      type: "invalid_request_error",
      code: "payload_too_large"
    });
  }
  try {
    body = await req.json();
  } catch {
    return errorResponse({
      status: 400,
      message: "Invalid JSON body.",
      type: "invalid_request_error",
      code: "invalid_json"
    });
  }

  try {
    const payload = validatePayload(body);
    if (JSON.stringify(payload).length > MAX_BODY_BYTES) {
      return errorResponse({
        status: 413,
        message: `Request body too large. Maximum is ${MAX_BODY_BYTES} bytes.`,
        type: "invalid_request_error",
        code: "payload_too_large"
      });
    }
    const result = await executeSovereignChatCompletion(payload);
    const now = Math.floor(Date.now() / 1000);
    return NextResponse.json(
      {
        id: result.id,
        object: "chat.completion",
        created: now,
        model: result.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.outputText
            },
            finish_reason: result.finishReason
          }
        ],
        usage: result.usage || {},
        sovereign: {
          mode: result.mode,
          provider: result.provider,
          metadata: result.metadata || {}
        }
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof SovereignApiError) {
      return errorResponse({
        status: error.statusCode,
        message: error.message,
        type: error.type,
        code: error.code,
        param: error.param
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse({
      status: 500,
      message,
      type: "server_error",
      code: "internal_error"
    });
  }
}

import { NextResponse } from "next/server";
import { sovereignEnvDefault } from "@/lib/env-sovereign";

export async function GET() {
  const localEndpoint = sovereignEnvDefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/$/, "");
  let localStatus: "HEALTHY" | "UNAVAILABLE" = "UNAVAILABLE";
  let localError: string | null = null;
  try {
    const res = await fetch(`${localEndpoint}/api/tags`, { method: "GET", cache: "no-store" });
    localStatus = res.ok ? "HEALTHY" : "UNAVAILABLE";
    if (!res.ok) {
      localError = `OLLAMA_HTTP_${res.status}`;
    }
  } catch (error) {
    localStatus = "UNAVAILABLE";
    localError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(
    {
      ok: true,
      product: "sovereign",
      api: "v1",
      providers: {
        local: {
          provider: "ollama",
          endpoint: localEndpoint,
          status: localStatus,
          error: localError
        },
        cloud: {
          provider: "openai-compatible",
          endpoint: sovereignEnvDefault("OPENAI_BASE_URL", "https://api.openai.com/v1"),
          status: process.env.OPENAI_API_KEY ? "CONFIGURED" : "MISSING_API_KEY"
        }
      }
    },
    { status: 200 }
  );
}

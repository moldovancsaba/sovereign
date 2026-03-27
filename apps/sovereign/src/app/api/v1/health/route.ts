import { NextResponse } from "next/server";
import { sovereignEnvDefault } from "@/lib/env-sovereign";

export async function GET() {
  const localEndpoint = sovereignEnvDefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/$/, "");
  const mlxEndpoint = sovereignEnvDefault("SOVEREIGN_MLX_BASE_URL", "http://127.0.0.1:8080/v1").replace(/\/$/, "");
  let localStatus: "HEALTHY" | "UNAVAILABLE" = "UNAVAILABLE";
  let localError: string | null = null;
  let mlxStatus: "HEALTHY" | "UNAVAILABLE" = "UNAVAILABLE";
  let mlxError: string | null = null;
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
  try {
    const res = await fetch(`${mlxEndpoint}/models`, { method: "GET", cache: "no-store" });
    mlxStatus = res.ok ? "HEALTHY" : "UNAVAILABLE";
    if (!res.ok) {
      mlxError = `MLX_HTTP_${res.status}`;
    }
  } catch (error) {
    mlxStatus = "UNAVAILABLE";
    mlxError = error instanceof Error ? error.message : String(error);
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
        },
        mlx: {
          provider: "mlx",
          endpoint: mlxEndpoint,
          status: mlxStatus,
          error: mlxError,
          auth: process.env.SOVEREIGN_MLX_API_KEY ? "CONFIGURED_OPTIONAL" : "NONE"
        }
      }
    },
    { status: 200 }
  );
}

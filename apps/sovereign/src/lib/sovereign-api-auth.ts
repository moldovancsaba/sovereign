import { NextRequest } from "next/server";

function readBearerToken(value: string | null) {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : null;
}

export function isSovereignApiAuthorized(req: NextRequest) {
  const expected = String(process.env.SOVEREIGN_API_TOKEN || "").trim();
  if (!expected) return true;
  const supplied =
    req.headers.get("x-sovereign-api-token") || readBearerToken(req.headers.get("authorization")) || "";
  return String(supplied).trim() === expected;
}

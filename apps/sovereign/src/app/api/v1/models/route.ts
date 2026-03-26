import { NextResponse } from "next/server";
import { listSovereignApiModels } from "@/lib/sovereign-api-executor";

export async function GET() {
  const models = await listSovereignApiModels();
  return NextResponse.json(
    {
      object: "list",
      data: models.map((id) => ({
        id,
        object: "model",
        owned_by: "sovereign"
      }))
    },
    { status: 200 }
  );
}

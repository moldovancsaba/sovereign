import { getAppSession } from "@/lib/app-session";
import { ensureSentinelSquadBootstrap } from "@/lib/bootstrap";

export async function requireSession() {
  const session = await getAppSession();
  if (!session?.user) {
    return null;
  }
  await ensureSentinelSquadBootstrap();
  return session;
}

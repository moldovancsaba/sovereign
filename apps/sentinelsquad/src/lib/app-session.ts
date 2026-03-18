import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AppSessionUser = NonNullable<Session["user"]> & { id?: string };
export type AppSession = Session & { user: AppSessionUser };

function localAuthBypassEnabled() {
  return process.env.SENTINELSQUAD_LOCAL_AUTH_BYPASS !== "false";
}

async function localBypassUser(): Promise<AppSessionUser> {
  const email = String(process.env.SENTINELSQUAD_DEV_LOGIN_EMAIL || "dev@sentinelsquad.local")
    .trim()
    .toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "SentinelSquad Local Operator" },
    create: { email, name: "SentinelSquad Local Operator" }
  });
  return {
    id: user.id,
    name: user.name || "SentinelSquad Local Operator",
    email: user.email
  };
}

export function isLocalAuthBypassEnabled() {
  return localAuthBypassEnabled();
}

export async function getAppSession(): Promise<AppSession | null> {
  if (localAuthBypassEnabled()) {
    return { user: await localBypassUser(), expires: "2099-12-31T23:59:59.999Z" };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  return session as AppSession;
}

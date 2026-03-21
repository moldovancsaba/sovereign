import { redirect } from "next/navigation";
import { getAppSession, isLocalAuthBypassEnabled } from "@/lib/app-session";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getAppSession();
  if (session?.user) redirect("/dashboard");
  if (isLocalAuthBypassEnabled()) redirect("/dashboard");
  return null;
}

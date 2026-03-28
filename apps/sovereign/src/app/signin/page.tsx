import { redirect } from "next/navigation";
import { getAppSession, isLocalAuthBypassEnabled } from "@/lib/app-session";
import { SignInCard } from "@/components/SignInCard";

export const dynamic = "force-dynamic";

function envGithubEnabled() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export default async function SignInPage() {
  const session = await getAppSession();
  if (session?.user) redirect("/dashboard");
  if (isLocalAuthBypassEnabled()) redirect("/dashboard");

  const githubEnabled = envGithubEnabled();
  const devEnabled = Boolean(process.env.SOVEREIGN_DEV_LOGIN_PASSWORD);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <SignInCard githubEnabled={githubEnabled} devEnabled={devEnabled} />
    </div>
  );
}

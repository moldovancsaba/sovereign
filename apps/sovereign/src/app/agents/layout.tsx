import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { AgentsNav } from "@/app/agents/AgentsNav";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AgentsLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  if (!session) redirect("/signin");

  return (
    <Shell
      title="Agents & runtime"
      subtitle="Tune roster, workers, and registry. Prefer Chat for day-to-day control; open Settings from the Menu for global options."
    >
      <Suspense
        fallback={
          <div
            className="mb-8 h-10 max-w-md animate-pulse rounded-lg bg-white/[0.06]"
            aria-hidden
          />
        }
      >
        <AgentsNav />
      </Suspense>
      {children}
    </Shell>
  );
}

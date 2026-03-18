import Link from "next/link";
import { getAppSession, isLocalAuthBypassEnabled } from "@/lib/app-session";
import { SignOutButton } from "@/components/SignOutButton";

export async function Shell(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const session = await getAppSession();
  const localBypass = isLocalAuthBypassEnabled();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/20 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="group">
              <div className="text-sm font-semibold tracking-wide">
                SentinelSquad
                <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-medium text-white/80">
                  Control Plane
                </span>
              </div>
              <div className="text-[11px] text-white/55 group-hover:text-white/75">
                Control plane for board, agents, telemetry
              </div>
            </Link>
            <nav className="hidden items-center gap-3 text-sm text-white/75 md:flex">
              <Link className="hover:text-white" href="/dashboard">
                Dashboard
              </Link>
              <Link className="hover:text-white" href="/products">
                Products
              </Link>
              <Link className="hover:text-white" href="/agents">
                Agents
              </Link>
              <Link className="hover:text-white" href="/chat">
                Chat
              </Link>
              <Link className="hover:text-white" href="/nexus">
                Nexus
              </Link>
              <Link className="hover:text-white" href="/ide">
                IDE
              </Link>
              <Link className="hover:text-white" href="/settings">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.name ? (
              <div className="hidden text-sm text-white/70 sm:block">
                {session.user.name}
              </div>
            ) : null}
            {localBypass ? (
              <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                Local desktop mode
              </div>
            ) : (
              <SignOutButton />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <div className="text-2xl font-semibold">{props.title}</div>
          {props.subtitle ? (
            <div className="mt-1 text-sm text-white/70">{props.subtitle}</div>
          ) : null}
        </div>
        {props.children}
      </main>
    </div>
  );
}

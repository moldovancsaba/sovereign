import Link from "next/link";
import { getAppSession, isLocalAuthBypassEnabled } from "@/lib/app-session";
import { SignOutButton } from "@/components/SignOutButton";

const navClass = "rounded-lg px-2.5 py-1.5 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white";
const navPrimaryClass =
  "rounded-lg px-2.5 py-1.5 text-sm font-medium text-white bg-white/[0.10] ring-1 ring-white/15 hover:bg-white/[0.14]";

export async function Shell(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const session = await getAppSession();
  const localBypass = isLocalAuthBypassEnabled();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/[0.08] bg-[var(--bg0)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <Link href="/dashboard" className="group shrink-0">
              <div className="text-[13px] font-semibold tracking-tight text-white/95">
                {"{sovereign}"}
                <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wider text-white/40">
                  local
                </span>
              </div>
              <div className="mt-0.5 max-w-[220px] text-[11px] leading-snug text-white/45 group-hover:text-white/55 md:max-w-none">
                Multi-agent transcript, runtime, and backlog — desktop-first
              </div>
            </Link>
            <nav className="hidden min-w-0 flex-wrap items-center gap-0.5 lg:flex">
              <Link className={navPrimaryClass} href="/chat">
                Chat
              </Link>
              <Link className={navClass} href="/dashboard">
                Dashboard
              </Link>
              <Link className={navClass} href="/backlog">
                Backlog
              </Link>
              <Link className={navClass} href="/agents">
                Agents
              </Link>
              <Link className={navClass} href="/products">
                Products
              </Link>
              <Link className={navClass} href="/run">
                Run
              </Link>
              <Link className={navClass} href="/ide">
                IDE
              </Link>
              <Link className={navClass} href="/nexus">
                Nexus
              </Link>
              <Link className={navClass} href="/settings">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {session?.user?.name ? (
              <div className="hidden max-w-[140px] truncate text-sm text-white/60 sm:block">
                {session.user.name}
              </div>
            ) : null}
            {localBypass ? (
              <div className="rounded-full border border-emerald-400/20 bg-emerald-500/[0.12] px-2.5 py-1 text-[11px] font-medium text-emerald-100/90">
                Local session
              </div>
            ) : (
              <SignOutButton />
            )}
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 border-t border-white/[0.06] px-4 py-2 lg:hidden">
          <Link className={navPrimaryClass} href="/chat">
            Chat
          </Link>
          <Link className={navClass} href="/dashboard">
            Dash
          </Link>
          <Link className={navClass} href="/backlog">
            Backlog
          </Link>
          <Link className={navClass} href="/agents">
            Agents
          </Link>
          <Link className={navClass} href="/run">
            Run
          </Link>
          <Link className={navClass} href="/settings">
            Settings
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 border-l-2 border-[var(--accent)]/80 pl-5">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{props.title}</h1>
          {props.subtitle ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
              {props.subtitle}
            </p>
          ) : null}
        </div>
        {props.children}
      </main>
    </div>
  );
}

import Link from "next/link";
import { getAppSession, isLocalAuthBypassEnabled } from "@/lib/app-session";
import { AppMenu } from "@/components/AppMenu";
import { SignOutButton } from "@/components/SignOutButton";

export async function Shell(props: {
  title: string;
  subtitle?: string;
  /** `work` = minimal page chrome (Chat); `standard` = title + subtitle block */
  variant?: "standard" | "work";
  children: React.ReactNode;
}) {
  const session = await getAppSession();
  const localBypass = isLocalAuthBypassEnabled();
  const variant = props.variant ?? "standard";

  return (
    <div className="min-h-screen">
      <header className="ds-shell-header">
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
            <nav className="hidden min-w-0 flex-wrap items-center gap-0.5 lg:flex" aria-label="Primary">
              <Link className="ds-nav-item" href="/chat">
                Chat
              </Link>
              <Link className="ds-nav-item" href="/dashboard">
                Control Room
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <AppMenu />
            </div>
            {session?.user?.name ? (
              <div className="hidden max-w-[140px] truncate text-sm text-white/60 lg:block">{session.user.name}</div>
            ) : null}
            {localBypass ? <div className="ds-status-local">Local session</div> : <SignOutButton />}
          </div>
        </div>
        <nav className="ds-shell-nav-mobile" aria-label="Primary">
          <Link className="ds-nav-item" href="/chat">
            Chat
          </Link>
          <Link className="ds-nav-item" href="/dashboard">
            Control Room
          </Link>
        </nav>
        <div className="flex justify-end border-t border-white/[0.06] px-4 py-2 sm:hidden">
          <AppMenu />
        </div>
      </header>

      <main className={variant === "work" ? "ds-main ds-main-work" : "ds-main"}>
        {variant === "standard" ? (
          <div className="ds-page-head">
            <h1 className="ds-page-title">{props.title}</h1>
            {props.subtitle ? <p className="ds-page-subtitle">{props.subtitle}</p> : null}
          </div>
        ) : null}
        {props.children}
      </main>
    </div>
  );
}

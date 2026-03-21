"use client";

import { signIn } from "next-auth/react";

export function SignInCard(props: { githubEnabled: boolean; devEnabled: boolean }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/5 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
      <div className="text-sm text-white/70">Authentication</div>

      {props.githubEnabled ? (
        <>
          <div className="mt-2 text-lg font-semibold">GitHub</div>
          <div className="mt-2 text-sm text-white/70">
            Recommended. Later we can add your SSO as a second provider.
          </div>
          <button
            type="button"
            className="mt-5 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          >
            Continue with GitHub
          </button>
        </>
      ) : null}

      {props.devEnabled ? (
        <>
          <div className={props.githubEnabled ? "mt-6" : "mt-2"} />
          <div className="text-lg font-semibold">Dev Login</div>
          <div className="mt-2 text-sm text-white/70">
            Enabled because `SOVEREIGN_DEV_LOGIN_PASSWORD` or `SENTINELSQUAD_DEV_LOGIN_PASSWORD`
            is set. Use this only on your local machine.
          </div>
          <button
            type="button"
            className="mt-5 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
            onClick={() => signIn("sovereign-dev", { callbackUrl: "/dashboard" })}
          >
            Continue with Dev Login
          </button>
        </>
      ) : null}

      {!props.githubEnabled && !props.devEnabled ? (
        <div className="mt-4 text-sm text-white/70">
          No auth providers configured. Set GitHub OAuth (`GITHUB_CLIENT_ID` /
          `GITHUB_CLIENT_SECRET`) or enable dev login (`SOVEREIGN_DEV_LOGIN_PASSWORD` or
          `SENTINELSQUAD_DEV_LOGIN_PASSWORD`).
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { signIn } from "next-auth/react";

export function SignInCard(props: { githubEnabled: boolean; devEnabled: boolean }) {
  return (
    <div className="ds-card ds-card-prominent p-6">
      <div className="ds-text-muted text-sm">Authentication</div>

      {props.githubEnabled ? (
        <>
          <div className="mt-2 text-lg font-semibold">GitHub</div>
          <div className="ds-text-muted mt-2 text-sm">
            Recommended. Later we can add your SSO as a second provider.
          </div>
          <button
            type="button"
            className="ds-btn-secondary mt-5 w-full"
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
          <div className="ds-text-muted mt-2 text-sm">
            Enabled because `SOVEREIGN_DEV_LOGIN_PASSWORD` is set. Use this only on your local
            machine.
          </div>
          <button
            type="button"
            className="ds-btn-secondary mt-5 w-full"
            onClick={() => signIn("sovereign-dev", { callbackUrl: "/dashboard" })}
          >
            Continue with Dev Login
          </button>
        </>
      ) : null}

      {!props.githubEnabled && !props.devEnabled ? (
        <div className="ds-text-muted mt-4 text-sm">
          No auth providers configured. Set GitHub OAuth (`GITHUB_CLIENT_ID` /
          `GITHUB_CLIENT_SECRET`) or enable dev login (`SOVEREIGN_DEV_LOGIN_PASSWORD`).
        </div>
      ) : null}
    </div>
  );
}

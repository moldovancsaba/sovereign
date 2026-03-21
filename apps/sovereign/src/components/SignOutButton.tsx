"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  if (
    (process.env.NEXT_PUBLIC_SOVEREIGN_LOCAL_AUTH_BYPASS ??
      process.env.NEXT_PUBLIC_SENTINELSQUAD_LOCAL_AUTH_BYPASS) !== "false"
  ) {
    return null;
  }
  return (
    <button
      type="button"
      className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
      onClick={() => signOut()}
    >
      Sign out
    </button>
  );
}

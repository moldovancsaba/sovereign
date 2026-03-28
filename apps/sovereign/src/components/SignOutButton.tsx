"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  if (process.env.NEXT_PUBLIC_SOVEREIGN_LOCAL_AUTH_BYPASS !== "false") {
    return null;
  }
  return (
    <button
      type="button"
      className="ds-btn-ghost"
      onClick={() => signOut()}
    >
      Sign out
    </button>
  );
}

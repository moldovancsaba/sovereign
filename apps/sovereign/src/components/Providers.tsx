"use client";

import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";

/** Pass server session so the client skips the initial `/api/auth/session` fetch (avoids flaky CLIENT_FETCH_ERROR / local-bypass mismatch). */
export function Providers(props: {
  children: ReactNode;
  session: Session | null;
  /** When true, avoid refetch-on-focus (no NextAuth cookie; `/api/auth/session` can error in WebKit). */
  localAuthBypass: boolean;
}) {
  return (
    <SessionProvider
      session={props.session}
      refetchOnWindowFocus={!props.localAuthBypass}
    >
      {props.children}
    </SessionProvider>
  );
}

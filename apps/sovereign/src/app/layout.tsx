import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { getAppSession, isLocalAuthBypassEnabled } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "{sovereign}",
  description:
    "Local-first multi-agent delivery: unified transcript, agents, backlog, runtime health, and project memory."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getAppSession();
  const localAuthBypass = isLocalAuthBypassEnabled();
  return (
    <html lang="en" className="design-system-v1">
      <body className="design-system-v1">
        <Providers session={session} localAuthBypass={localAuthBypass}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

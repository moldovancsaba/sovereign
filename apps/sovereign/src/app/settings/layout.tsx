import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { SettingsNav } from "@/app/settings/SettingsNav";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  if (!session) redirect("/signin");

  return (
    <Shell
      title="Settings"
      subtitle="Global {sovereign} configuration. Use the sections below. Agents, Products, Run, and Orchestration are in the header Menu."
    >
      <SettingsNav />
      {children}
    </Shell>
  );
}

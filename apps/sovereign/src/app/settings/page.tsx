import Link from "next/link";
import { getActiveTasteRubricVersion, readSovereignSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";

export default async function SettingsOverviewPage() {
  const settings = await readSovereignSettings();
  const rubric = getActiveTasteRubricVersion(settings);
  const commandCount = settings.commandAccess.length;

  const hubs: {
    href: string;
    title: string;
    description: string;
    hint?: string;
  }[] = [
    {
      href: "/settings/workspace",
      title: "Workspace",
      description: "Local project folder for path lookups and IDE defaults.",
      hint: settings.localProjectFolder
    },
    {
      href: "/settings/preferences",
      title: "Preferences",
      description: "Taste rubric and human-owned alignment principles.",
      hint: rubric?.version ? `Active: ${rubric.version}` : undefined
    },
    {
      href: "/settings/safety",
      title: "Safety & tools",
      description: "Shell access for agents and approved command list.",
      hint: commandCount ? `${commandCount} command(s) in policy` : undefined
    },
    {
      href: "/settings/about",
      title: "About & related",
      description: "Storage paths, agents, and products shortcuts."
    }
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-white/65">
        Pick a section to configure. Everything here applies globally; per-agent and per-product options are linked from{" "}
        <strong className="text-white/85">About</strong> or the header <strong className="text-white/85">Menu</strong>.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {hubs.map((hub) => (
          <Link key={hub.href} href={hub.href} className="ds-card block p-5 transition hover:bg-white/[0.07]">
            <div className="text-sm font-semibold text-white/95">{hub.title}</div>
            <div className="mt-1 text-xs text-white/60">{hub.description}</div>
            {hub.hint ? (
              <div className="mt-3 truncate font-mono text-[11px] text-white/50" title={hub.hint}>
                {hub.hint}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

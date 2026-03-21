import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  saveCommandAccessPolicyAction,
  saveLocalProjectFolderAction,
  saveShellAccessSettingsAction,
  saveTasteRubricAction
} from "@/app/settings/actions";
import { getActiveTasteRubricVersion, readSentinelSquadSettings } from "@/lib/settings-store";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const settings = await readSentinelSquadSettings();
  const activeRubric = getActiveTasteRubricVersion(settings);
  const defaultPrinciples = activeRubric?.principles?.join("\n") || "";

  return (
    <Shell
      title="Settings"
      subtitle={'Global {sovereign} settings. Agent and project settings are edited on their own pages.'}
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
          <div className="text-sm font-semibold">Local project folder</div>
          <div className="mt-1 text-xs text-white/60">
            Root folder used for local path lookups and workspace defaults.
          </div>
          <form action={saveLocalProjectFolderAction} className="mt-4 flex gap-3">
            <input
              name="localProjectFolder"
              defaultValue={settings.localProjectFolder}
              placeholder="/Users/moldovancsaba/Projects"
              className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 placeholder:text-white/45 outline-none focus:border-white/25"
            />
            <button
              type="submit"
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
            >
              Save
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
          <div className="text-sm font-semibold">Taste rubric (v1, human-owned)</div>
          <div className="mt-1 text-xs text-white/60">
            Versioned decision-alignment rubric. Updates are restricted to rubric owner or ADMIN.
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
            <div>
              Active version:{" "}
              <span className="font-mono text-white/90">
                {settings.tasteRubric?.activeVersion || "(none)"}
              </span>
            </div>
            <div className="mt-1">
              Owner:{" "}
              <span className="font-mono text-white/90">
                {activeRubric?.ownerEmail || "(none)"}
              </span>
            </div>
            <div className="mt-1 text-white/55">
              Last update:{" "}
              {activeRubric?.updatedAt
                ? new Date(activeRubric.updatedAt).toLocaleString()
                : "(none)"}
            </div>
          </div>
          <form action={saveTasteRubricAction} className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-white/65">
                Version
                <input
                  name="version"
                  defaultValue={activeRubric?.version || "v1"}
                  placeholder="v1"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
                />
              </label>
              <label className="text-[11px] text-white/65">
                Owner email
                <input
                  name="ownerEmail"
                  defaultValue={activeRubric?.ownerEmail || session.user?.email || ""}
                  placeholder="owner@example.com"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
                />
              </label>
            </div>
            <label className="text-[11px] text-white/65">
              Summary
              <input
                name="summary"
                defaultValue={activeRubric?.summary || ""}
                placeholder="One-line rubric intent"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
              />
            </label>
            <label className="text-[11px] text-white/65">
              Principles (one per line)
              <textarea
                name="principles"
                defaultValue={defaultPrinciples}
                rows={5}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
              />
            </label>
            <label className="text-[11px] text-white/65">
              Change reason
              <input
                name="changeReason"
                defaultValue=""
                placeholder="Why this version/update is needed"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
              />
            </label>
            <div>
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
              >
                Save rubric version
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
          <div className="text-sm font-semibold">Agent shell access</div>
          <div className="mt-1 text-xs text-white/60">
            Controls whether tool-driven agents inherit the full local process environment and which cwd they start from.
          </div>
          <form action={saveShellAccessSettingsAction} className="mt-4 grid gap-3">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                name="inheritFullProcessEnv"
                value="1"
                defaultChecked={settings.shellAccess.inheritFullProcessEnv}
              />
              Inherit full process environment for agent shell commands
            </label>
            <label className="text-[11px] text-white/65">
              Default shell cwd
              <input
                name="defaultCwd"
                defaultValue={settings.shellAccess.defaultCwd}
                placeholder={process.cwd()}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
              />
            </label>
            <div>
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
              >
                Save shell access
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
          <div className="text-sm font-semibold">Command access policy</div>
          <div className="mt-1 text-xs text-white/60">
            New commands requested by tool-call tasks are auto-added here as declined until you switch them to approved.
          </div>
          <form action={saveCommandAccessPolicyAction} className="mt-4 grid gap-3">
            <label className="text-[11px] text-white/65">
              Add command manually
              <input
                name="newCommand"
                placeholder="gh"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90"
              />
            </label>
            <div className="space-y-2">
              {settings.commandAccess.length ? (
                settings.commandAccess.map((entry) => (
                  <div
                    key={entry.command}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div>
                      <div className="font-mono text-sm text-white/90">{entry.command}</div>
                      <div className="text-[11px] text-white/50">
                        Updated {new Date(entry.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <select
                      name={`command:${entry.command}`}
                      defaultValue={entry.status}
                      className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/90"
                    >
                      <option value="APPROVED">Approved</option>
                      <option value="DECLINED">Declined</option>
                    </select>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                  No observed commands yet.
                </div>
              )}
            </div>
            <div>
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
              >
                Save command policy
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
          <div className="text-sm font-semibold">Where to edit other settings</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Link
              href="/agents"
              className="rounded-xl border border-white/12 bg-black/20 px-4 py-3 hover:bg-black/30"
            >
              <div className="text-sm font-medium text-white/90">Agent settings</div>
              <div className="mt-1 text-xs text-white/60">
                Edit per-agent URL, model, and API key env var in each agent card.
              </div>
            </Link>
            <Link
              href="/products"
              className="rounded-xl border border-white/12 bg-black/20 px-4 py-3 hover:bg-black/30"
            >
              <div className="text-sm font-medium text-white/90">Project settings</div>
              <div className="mt-1 text-xs text-white/60">
                Open a product page and edit project URL, GitHub, and vars.
              </div>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
          <div className="text-sm font-semibold">Storage and security</div>
          <div className="mt-1 text-xs text-white/60">
            Settings are stored under `.sovereign/settings.json` (legacy: `.sentinelsquad/settings.json`). Keep
            secrets in `.env` or `.env.local`.
          </div>
        </div>
      </div>
    </Shell>
  );
}

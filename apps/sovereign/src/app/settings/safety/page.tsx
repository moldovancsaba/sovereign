import {
  saveCommandAccessPolicyAction,
  saveShellAccessSettingsAction
} from "@/app/settings/actions";
import { readSovereignSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";

export default async function SettingsSafetyPage() {
  const settings = await readSovereignSettings();

  return (
    <div className="space-y-6">
      <div className="ds-card p-5">
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

      <div className="ds-card p-5">
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
    </div>
  );
}

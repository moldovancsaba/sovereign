import { saveLocalProjectFolderAction } from "@/app/settings/actions";
import { readSovereignSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";

export default async function SettingsWorkspacePage() {
  const settings = await readSovereignSettings();

  return (
    <div className="space-y-6">
      <div className="ds-card p-5">
        <div className="text-sm font-semibold">Local project folder</div>
        <div className="mt-1 text-xs text-white/60">
          Root folder used for local path lookups and workspace defaults.
        </div>
        <form action={saveLocalProjectFolderAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            name="localProjectFolder"
            defaultValue={settings.localProjectFolder}
            placeholder="~/Projects"
            className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 placeholder:text-white/45 outline-none focus:border-white/25"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

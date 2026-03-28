import { redirect } from "next/navigation";
import { saveTasteRubricAction } from "@/app/settings/actions";
import { getActiveTasteRubricVersion, readSovereignSettings } from "@/lib/settings-store";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPreferencesPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");
  const settings = await readSovereignSettings();
  const activeRubric = getActiveTasteRubricVersion(settings);
  const defaultPrinciples = activeRubric?.principles?.join("\n") || "";

  return (
    <div className="space-y-6">
      <div className="ds-card p-5">
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
            <span className="font-mono text-white/90">{activeRubric?.ownerEmail || "(none)"}</span>
          </div>
          <div className="mt-1 text-white/55">
            Last update:{" "}
            {activeRubric?.updatedAt ? new Date(activeRubric.updatedAt).toLocaleString() : "(none)"}
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
    </div>
  );
}

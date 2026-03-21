import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  deleteProjectConfigAction,
  saveProjectConfigAction
} from "@/app/products/actions";
import { listProjectItems } from "@/lib/github";
import { readSentinelSquadSettings } from "@/lib/settings-store";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function varsToText(vars: Array<{ key: string; value: string }>) {
  return vars.map((v) => `${v.key}=${v.value}`).join("\n");
}

export default async function ProductPage(props: {
  params: Promise<{ product: string }>;
}) {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const { product } = await props.params;
  const decoded = decodeURIComponent(product);
  const [items, settings] = await Promise.all([
    listProjectItems({ product: decoded, limit: 200 }),
    readSentinelSquadSettings()
  ]);
  const config =
    settings.projects.find((p) => p.projectName.toLowerCase() === decoded.toLowerCase()) ||
    null;

  return (
    <Shell
      title={`Product: ${decoded}`}
      subtitle={`Cards from the board filtered by Product = ${decoded}`}
    >
      <div className="mb-6 rounded-2xl border border-white/12 bg-white/5 p-5">
        <div className="text-sm font-semibold">Project settings</div>
        <div className="mt-1 text-xs text-white/60">
          Manage metadata for this product. API keys should remain in env files.
        </div>
        <form action={saveProjectConfigAction} className="mt-4 grid gap-3">
          <input type="hidden" name="projectId" value={config?.projectId ?? ""} />
          <input type="hidden" name="projectName" value={decoded} />
          <div className="text-[11px] font-mono text-white/60">
            id: {config?.projectId ?? "(auto-generated on first save)"}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/65">
              Project URL
              <input
                name="projectUrl"
                defaultValue={config?.projectUrl ?? ""}
                placeholder="https://amanoba.com"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white/90"
              />
            </label>
            <label className="text-xs text-white/65">
              Project GitHub
              <input
                name="projectGithub"
                defaultValue={config?.projectGithub ?? ""}
                placeholder="moldovancsaba/sovereign"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white/90"
              />
            </label>
          </div>
          <label className="text-xs text-white/65">
            Project vars (one `KEY=VALUE` per line)
            <textarea
              name="vars"
              defaultValue={config ? varsToText(config.vars) : ""}
              rows={4}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs font-mono text-white/90"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"
            >
              Save project settings
            </button>
          </div>
        </form>
        {config ? (
          <form action={deleteProjectConfigAction} className="mt-3">
            <input type="hidden" name="projectId" value={config.projectId} />
            <input type="hidden" name="projectName" value={decoded} />
            <button
              type="submit"
              className="rounded-lg border border-rose-300/25 bg-rose-200/10 px-3 py-1.5 text-xs font-medium text-rose-50 hover:bg-rose-200/20"
            >
              Delete project settings
            </button>
          </form>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/12 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="text-sm text-white/70">
            {items.length} cards (showing up to 200)
          </div>
          <Link
            href="/products"
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85 hover:bg-white/10"
          >
            Back to products
          </Link>
        </div>
        <div className="divide-y divide-white/10">
          {items.map((it) => (
            <Link
              key={it.issueNumber}
              href={`/issues/${it.issueNumber}`}
              className="block px-5 py-4 hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white/90">
                    #{it.issueNumber} {it.issueTitle}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {it.fields["Status"] || "(no status)"} ·{" "}
                    {it.fields["Type"] || "(no type)"} ·{" "}
                    {it.fields["Priority"] || "(no priority)"}
                  </div>
                </div>
                <div className="text-right text-xs text-white/65">
                  <div>{it.fields["Agent"] || "(no agent)"}</div>
                  <div className="mt-1">{it.fields["DoD"] || "(no DoD)"}</div>
                </div>
              </div>
            </Link>
          ))}
          {items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-white/70">
              No cards found for this product.
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

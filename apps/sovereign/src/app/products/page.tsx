import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  bootstrapSovereignProjectAction,
  cleanProjectSettingsAction
} from "@/app/products/actions";
import { getProjectMeta, listProjectItems } from "@/lib/github";
import { readSovereignSettings } from "@/lib/settings-store";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const settings = await readSovereignSettings();
  const planningSyncEnabled = process.env.SOVEREIGN_ENABLE_GITHUB_BOARD === "true";
  let products: string[] = [];
  let boardItems:
    | Array<{
        issueNumber: number;
        fields: Record<string, string>;
      }>
    = [];
  let metaError: string | null = null;
  if (planningSyncEnabled) {
    try {
      const [meta, items] = await Promise.all([
        getProjectMeta(),
        listProjectItems({ limit: 500 })
      ]);
      const productField = meta.fields.find((f) => f.name === "Product");
      products = productField?.options?.map((o) => o.name) ?? [];
      boardItems = items.map((it) => ({
        issueNumber: it.issueNumber,
        fields: it.fields
      }));
    } catch (e) {
      metaError = e instanceof Error ? e.message : String(e);
    }
  }

  const configuredRows = new Map(
    settings.projects.map((p) => [p.projectName.toLowerCase(), p] as const)
  );
  const configured = new Set(configuredRows.keys());
  const boardByLower = new Map(products.map((p) => [p.toLowerCase(), p]));
  const boardSet = new Set(products.map((p) => p.toLowerCase()));
  const cardsByProductLower = new Map<
    string,
    {
      productName: string;
      total: number;
      statusCounts: Map<string, number>;
    }
  >();
  let unassignedCards = 0;
  for (const item of boardItems) {
    const rawProduct = (item.fields["Product"] || "").trim();
    if (!rawProduct) {
      unassignedCards += 1;
      continue;
    }
    const lower = rawProduct.toLowerCase();
    const canonical = boardByLower.get(lower) || rawProduct;
    const status = (item.fields["Status"] || "(unset)").trim();
    const bucket = cardsByProductLower.get(lower) || {
      productName: canonical,
      total: 0,
      statusCounts: new Map<string, number>()
    };
    bucket.productName = canonical;
    bucket.total += 1;
    bucket.statusCounts.set(status, (bucket.statusCounts.get(status) || 0) + 1);
    cardsByProductLower.set(lower, bucket);
  }

  const visibleByLower = new Map<string, string>();
  for (const name of products) {
    visibleByLower.set(name.toLowerCase(), name);
  }
  for (const lower of configuredRows.keys()) {
    const configuredName = configuredRows.get(lower)?.projectName || lower;
    if (!visibleByLower.has(lower)) {
      visibleByLower.set(lower, boardByLower.get(lower) || configuredName);
    }
  }
  for (const [lower, bucket] of cardsByProductLower.entries()) {
    if (!visibleByLower.has(lower)) {
      visibleByLower.set(lower, bucket.productName);
    }
  }

  const rows = Array.from(visibleByLower.entries()).map(([lower, name]) => {
    const bucket = cardsByProductLower.get(lower);
    const statusCounts = bucket ? Array.from(bucket.statusCounts.entries()) : [];
    statusCounts.sort((a, b) => b[1] - a[1]);
    return {
      lower,
      name,
      total: bucket?.total || 0,
      statusCounts,
      boardLinked: boardSet.has(lower),
      configured: configured.has(lower)
    };
  });

  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (a.boardLinked !== b.boardLinked) return a.boardLinked ? -1 : 1;
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const activeRows = rows.filter((r) => r.total > 0);
  const configuredNoCardsRows = rows.filter((r) => r.total === 0 && r.configured);
  const staleOptionRows = rows.filter((r) => r.total === 0 && !r.configured && r.boardLinked);
  const totalCards = activeRows.reduce((sum, row) => sum + row.total, 0);
  const topStatusCounts = new Map<string, number>();
  for (const row of activeRows) {
    for (const [status, count] of row.statusCounts) {
      topStatusCounts.set(status, (topStatusCounts.get(status) || 0) + count);
    }
  }
  const statusSummary = Array.from(topStatusCounts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Shell title="Products" subtitle="Local product registry with optional planning sync">
      {planningSyncEnabled && metaError ? (
        <div className="mb-4 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
          Optional planning sync unavailable: {metaError}
        </div>
      ) : null}
      <div className="mb-4 ds-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-white/75 max-w-4xl">
            This view merges local product settings with optional planning metadata. Runtime truth remains local;
            planning-card counts are advisory only.
          </div>
          <div className="flex items-center gap-2">
            <form action={cleanProjectSettingsAction}>
              <button
                type="submit"
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"
              >
                Clean Local Project Config
              </button>
            </form>
            <form action={bootstrapSovereignProjectAction}>
              <button
                type="submit"
                className="rounded-xl border border-emerald-300/25 bg-emerald-200/10 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-200/20"
              >
                Add/refresh default product (GitHub metadata)
              </button>
            </form>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
          <span className="ds-pill-deep">
            Active products: {activeRows.length}
          </span>
          {planningSyncEnabled ? (
            <span className="ds-pill-deep">
              Planning cards: {totalCards}
            </span>
          ) : null}
          {planningSyncEnabled ? (
            <span className="ds-pill-deep">
              Unassigned cards: {unassignedCards}
            </span>
          ) : null}
          {statusSummary.slice(0, 4).map(([status, count]) => (
            <span
              key={`status:${status}`}
              className="rounded-full border border-cyan-300/20 bg-cyan-200/10 px-2 py-0.5 text-cyan-50"
            >
              {status}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {activeRows.map((row) => (
          <Link
            key={row.lower}
            href={`/products/${encodeURIComponent(row.name)}`}
            className="ds-card p-5 hover:bg-white/[0.07]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-semibold">{row.name}</div>
              <div className="rounded-full border border-cyan-300/25 bg-cyan-200/10 px-2 py-0.5 text-[11px] text-cyan-50">
                {row.total} cards
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-white/65">
              {row.statusCounts.slice(0, 4).map(([status, count]) => (
                <span
                  key={`${row.lower}:${status}`}
                  className="ds-pill-deep"
                >
                  {status}: {count}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  row.configured
                    ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-50"
                    : "border-white/15 bg-white/5 text-white/65"
                }`}
              >
                {row.configured ? "Configured" : "No config"}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  row.boardLinked
                    ? "border-white/15 bg-white/5 text-white/70"
                    : "border-amber-300/25 bg-amber-200/10 text-amber-50"
                }`}
              >
                {row.boardLinked ? "Planning option" : "No planning option"}
              </span>
            </div>
            <div className="mt-2 text-sm text-white/70">View planning items and edit local settings scoped to this product.</div>
          </Link>
        ))}
      </div>
      {activeRows.length === 0 ? (
        <div className="mt-4 ds-hint">No active product cards found on the board.</div>
      ) : null}

      {configuredNoCardsRows.length > 0 ? (
        <div className="mt-6 ds-card p-5">
          <div className="text-sm font-semibold">Configured products without board cards</div>
          <div className="mt-1 text-xs text-white/60">
            These are configured locally but currently have zero cards on the board.
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {configuredNoCardsRows.map((row) => (
              <Link
                key={`configured-empty:${row.lower}`}
                href={`/products/${encodeURIComponent(row.name)}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white/90">{row.name}</div>
                  <div className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                    0 cards
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {row.boardLinked
                    ? "Board option exists; no cards currently."
                    : "Local config exists but Product option is missing from board."}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {staleOptionRows.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-200/10 p-5">
          <div className="text-sm font-semibold text-amber-100">Board product options with no cards/config</div>
          <div className="mt-1 text-xs text-amber-100/80">
            These options may be stale board metadata and are not currently active products.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {staleOptionRows.map((row) => (
              <span
                key={`stale:${row.lower}`}
                className="rounded-full border border-amber-200/25 bg-black/20 px-2 py-0.5 text-[11px] text-amber-50"
              >
                {row.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

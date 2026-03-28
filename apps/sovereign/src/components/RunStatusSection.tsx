import Link from "next/link";
import type { LocalServiceStatus } from "@/lib/local-system-status";

function statusChip(status: LocalServiceStatus["status"]) {
  if (status === "HEALTHY") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (status === "DEGRADED") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  return "border-rose-400/40 bg-rose-500/15 text-rose-100";
}

export function RunStatusSection(props: {
  services: LocalServiceStatus[];
  databaseQueryOk: boolean | null;
}) {
  const { services, databaseQueryOk } = props;

  return (
    <section className="mb-8 ds-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-white/95">Live status</div>
          <div className="mt-0.5 text-xs text-white/55">
            Checked on this machine when the page loads. macOS launchd + port checks.
          </div>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"
        >
          Dashboard telemetry →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((s) => (
          <div
            key={s.key}
            className={`rounded-xl border px-3 py-2 text-sm ${statusChip(s.status)}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.label}</span>
              <span className="font-mono text-xs uppercase">{s.status}</span>
            </div>
            <div className="mt-1 text-xs opacity-90">{s.detail}</div>
          </div>
        ))}
      </div>

      {databaseQueryOk !== null ? (
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
            databaseQueryOk
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
              : "border-rose-400/40 bg-rose-500/15 text-rose-100"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Database (Prisma)</span>
            <span className="font-mono text-xs uppercase">
              {databaseQueryOk ? "CONNECTED" : "FAILED"}
            </span>
          </div>
          <div className="mt-1 text-xs opacity-90">
            {databaseQueryOk
              ? "Application can run queries against DATABASE_URL."
              : "Could not execute a simple query. Check .env and Postgres."}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="text-xs text-white/55">
          Sentinels are managed by the Immortality Protocol (launchd).
        </div>
      </div>
    </section>
  );
}

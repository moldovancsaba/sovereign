import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLocalRuntimeHealth } from "@/lib/runtime-health";
import { getLocalSystemStatus } from "@/lib/local-system-status";
import { getOrchestratorIntrospectionSnapshot } from "@/lib/orchestrator-introspection";

export const dynamic = "force-dynamic";

export default async function ControlRoomPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  let recentTasks: any[] = [];
  let introspection: any = null;
  let runtimeHealth: any = null;
  let systemStatus: any[] = [];
  let error: string | null = null;

  try {
    [recentTasks, introspection, runtimeHealth] = await Promise.all([
      prisma.agentTask.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          lastFailureCode: true
        }
      }),
      getOrchestratorIntrospectionSnapshot(),
      getLocalRuntimeHealth()
    ]);
    systemStatus = getLocalSystemStatus();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <Shell
      title="Control Room"
      subtitle="Governed Routing Brain — Deterministic DAG Engine & Sentinel Watch"
    >
      <div className="space-y-6">
        {/* Five-Point Engine Pulse */}
        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-3">
            Engine Pulse
          </h2>
          <div className="grid gap-3 sm:grid-cols-5">
            {systemStatus.map((service) => (
              <div key={service.key} className="ds-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{service.label}</span>
                  <div className={`h-2 w-2 rounded-full ${
                    service.status === "HEALTHY" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : 
                    service.status === "DEGRADED" ? "bg-amber-500" : "bg-rose-500"
                  }`} />
                </div>
                <div className="mt-2 text-sm font-semibold text-white/90">{service.status}</div>
                <div className="mt-1 text-[11px] leading-tight text-white/45">{service.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Orchestrator Introspection */}
          <section aria-labelledby="introspection-heading">
            <h2 id="introspection-heading" className="text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-3">
              DAG Introspection
            </h2>
            <div className="ds-card divide-y divide-white/[0.06]">
              {introspection ? (
                <>
                  <div className="p-4">
                    <div className="text-xs font-semibold text-white/70 uppercase tracking-tight">Lease Status</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-white/90">{introspection.lease.reason}</span>
                      <span className="font-mono text-[11px] text-white/40">
                        {introspection.lease.ownerAgentKey ? `@${introspection.lease.ownerAgentKey}` : "no owner"}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-semibold text-white/70 uppercase tracking-tight">Task Pipeline</div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Queued", val: introspection.tasks.queued },
                        { label: "Running", val: introspection.tasks.running },
                        { label: "Manual", val: introspection.tasks.manualRequired },
                        { label: "Dead", val: introspection.tasks.deadLetter }
                      ].map(stat => (
                        <div key={stat.label} className="rounded-lg bg-white/5 py-2">
                          <div className="text-[10px] text-white/40 uppercase font-medium">{stat.label}</div>
                          <div className="text-lg font-semibold text-white/90">{stat.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-semibold text-white/70 uppercase tracking-tight">Active Models</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {runtimeHealth?.providers[0]?.installedModels.slice(0, 4).map((m: string) => (
                        <span key={m} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-mono text-white/60">
                          {m}
                        </span>
                      )) || <span className="text-xs text-white/30">No models found</span>}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-sm text-white/30">Snapshot Unavailable</div>
              )}
            </div>
          </section>

          {/* Task Stream */}
          <section aria-labelledby="stream-heading">
            <h2 id="stream-heading" className="text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-3">
              Recent Task Stream
            </h2>
            <div className="ds-card overflow-hidden">
              <div className="divide-y divide-white/[0.06]">
                {recentTasks.map((task: any) => (
                  <div key={task.id} className="group flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`h-1.5 w-1.5 rounded-full ${
                        task.status === "DONE" ? "bg-emerald-500" :
                        task.status === "FAILED" || task.status === "DEAD_LETTER" ? "bg-rose-500" :
                        task.status === "MANUAL_REQUIRED" ? "bg-amber-500" : "bg-cyan-500"
                      }`} />
                      <div className="font-mono text-[12px] text-white/80">{task.id.slice(0, 12)}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] items-center rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-medium text-white/40">
                        {task.status}
                      </span>
                      <span className="text-[11px] text-white/25">
                        {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                {recentTasks.length === 0 && (
                  <div className="p-12 text-center text-sm text-white/20 font-medium">No tasks found in stream.</div>
                )}
              </div>
              <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-2 flex justify-center">
                <Link href="/backlog" className="text-[11px] font-semibold text-white/40 hover:text-white/60 transition-colors uppercase tracking-wider">
                  View Full Backlog →
                </Link>
              </div>
            </div>
          </section>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300/25 bg-rose-200/5 p-4 text-xs font-mono text-rose-200/80">
            System Error: {error}
          </div>
        )}
      </div>
    </Shell>
  );
}

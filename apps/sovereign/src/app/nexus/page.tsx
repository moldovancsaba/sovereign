import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { listUnifiedChatAgentAvailability } from "@/lib/active-agents";
import {
  getExternalWorkflowRuntimePath,
  getNexusRoleMapping,
  getOrchestrationBenchmarkWorkflowPath,
  readNexusModelRouting,
  readNexusRunArtifact
} from "@/lib/nexus-control";
import {
  runNexusSeminarAction,
  syncNexusSeminarToSentinelSquadAction
} from "@/app/nexus/actions";

export const dynamic = "force-dynamic";

export default async function NexusPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const mapping = getNexusRoleMapping();
  const [agents, modelRouting, lastRun] = await Promise.all([
    listUnifiedChatAgentAvailability(),
    readNexusModelRouting(),
    readNexusRunArtifact()
  ]);
  const activeAgents = agents.filter((agent) => agent.active);

  return (
    <Shell
      title="Orchestration"
      subtitle="External benchmark workflows and role mapping for {sovereign}. Prefer Chat for day-to-day control."
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/12 bg-black/25 p-4">
          <div className="text-sm font-semibold">Role Mapping</div>
          <div className="mt-2 text-xs text-white/75">
            Drafter: <span className="font-mono">@{mapping.drafterKey}</span> | Writer: <span className="font-mono">@{mapping.writerKey}</span> | Controller: <span className="font-mono">@{mapping.controllerKey}</span>
          </div>
          <div className="mt-2 text-xs text-white/65">
            Unified-chat active agents: {activeAgents.map((a) => `@${a.key}(${a.runtime}/${a.controlRole})`).join(", ") || "none"}
          </div>
        </section>

        <section className="rounded-2xl border border-white/12 bg-black/25 p-4">
          <div className="text-sm font-semibold">Model Routing</div>
          <pre className="mt-2 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
{JSON.stringify(modelRouting, null, 2)}
          </pre>
        </section>

        <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
          <div className="text-sm font-semibold text-cyan-50">External Workflow Benchmark</div>
          <div className="mt-2 text-xs text-cyan-100/90">
            Runtime path: <span className="font-mono">{getExternalWorkflowRuntimePath()}</span>
          </div>
          <div className="mt-1 text-xs text-cyan-100/90">
            Workflow: <span className="font-mono">{getOrchestrationBenchmarkWorkflowPath()}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <form action={runNexusSeminarAction}>
              <button
                type="submit"
                className="rounded-lg border border-cyan-200/35 bg-cyan-200/15 px-3 py-1 text-xs font-medium text-cyan-50 hover:bg-cyan-200/25"
              >
                Run Benchmark
              </button>
            </form>
            <form action={syncNexusSeminarToSentinelSquadAction}>
              <button
                type="submit"
                className="rounded-lg border border-emerald-200/35 bg-emerald-200/15 px-3 py-1 text-xs font-medium text-emerald-50 hover:bg-emerald-200/25"
              >
                Sync Result To Chat
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border border-white/12 bg-black/25 p-4">
          <div className="text-sm font-semibold">Last Run</div>
          {!lastRun ? (
            <div className="mt-2 text-xs text-white/65">No run artifact yet.</div>
          ) : (
            <>
              <div className="mt-2 text-xs text-white/70">
                {lastRun.ok ? "PASS" : "FAIL"} | {new Date(lastRun.timestamp).toLocaleString()}
              </div>
              <pre className="mt-2 max-h-[36vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
{lastRun.output}
              </pre>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

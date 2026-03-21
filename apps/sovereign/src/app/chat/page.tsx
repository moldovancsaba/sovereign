import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { getOrCreateThread } from "@/lib/chat";
import { initializeNexusCellAction, sendGlobalMessage } from "@/app/chat/actions";
import { buildMentionables } from "@/lib/mentionables";
import { MentionInput } from "@/components/MentionInput";
import { listUnifiedChatAgentAvailability } from "@/lib/active-agents";
import { listThreadTimeline } from "@/lib/thread-events";

export const dynamic = "force-dynamic";

type TimelineEntry = Awaited<ReturnType<typeof listThreadTimeline>>[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readWorkerDoneMeta(meta: unknown): null | {
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  grounded: boolean;
  doneReason: string | null;
} {
  const record = asRecord(meta);
  if (!record || record.kind !== "worker_done") return null;
  return {
    provider: typeof record.provider === "string" ? record.provider : null,
    model: typeof record.model === "string" ? record.model : null,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : null,
    grounded: record.grounded === true,
    doneReason: typeof record.doneReason === "string" ? record.doneReason : null
  };
}

function readSystemMeta(meta: unknown): null | {
  kind: string;
  reason: string | null;
} {
  const record = asRecord(meta);
  if (!record || typeof record.kind !== "string") return null;
  if (
    record.kind !== "task_manual_required" &&
    record.kind !== "mention_inactive" &&
    record.kind !== "runtime_status_snapshot"
  ) {
    return null;
  }
  return {
    kind: record.kind,
    reason: typeof record.reason === "string" ? record.reason : null
  };
}

function readWorkerJudgementMeta(meta: unknown): null | {
  outcome: string | null;
  agentKey: string | null;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  code: string | null;
  doneReason: string | null;
  grounded: boolean;
  memoryCaptured: boolean;
} {
  const record = asRecord(meta);
  if (!record || record.kind !== "worker_judgement") return null;
  return {
    outcome: typeof record.outcome === "string" ? record.outcome : null,
    agentKey: typeof record.agentKey === "string" ? record.agentKey : null,
    provider: typeof record.provider === "string" ? record.provider : null,
    model: typeof record.model === "string" ? record.model : null,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : null,
    code: typeof record.code === "string" ? record.code : null,
    doneReason: typeof record.doneReason === "string" ? record.doneReason : null,
    grounded: record.grounded === true,
    memoryCaptured: record.memoryCaptured === true
  };
}

function latestMatchingMessage(
  timeline: TimelineEntry[],
  predicate: (entry: TimelineEntry) => boolean
) {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (predicate(entry)) return entry;
  }
  return null;
}

function buildCommandCenterSummary(timeline: TimelineEntry[]) {
  const latestJudgement = latestMatchingMessage(
    timeline,
    (entry) => entry.type === "message" && readWorkerJudgementMeta(entry.message.meta) !== null
  );
  const latestSuccess = latestMatchingMessage(
    timeline,
    (entry) => entry.type === "message" && readWorkerDoneMeta(entry.message.meta) !== null
  );
  const latestManualRequired = latestMatchingMessage(
    timeline,
    (entry) =>
      entry.type === "message" &&
      entry.message.authorType === "SYSTEM" &&
      readSystemMeta(entry.message.meta)?.kind === "task_manual_required"
  );
  const latestInactiveAgent = latestMatchingMessage(
    timeline,
    (entry) =>
      entry.type === "message" &&
      entry.message.authorType === "SYSTEM" &&
      readSystemMeta(entry.message.meta)?.kind === "mention_inactive"
  );

  const recentToolFailures = timeline.filter(
    (
      entry
    ): entry is Extract<TimelineEntry, { type: "event" }> =>
      entry.type === "event" && entry.event.kind === "TOOL_CALL_FAILED"
  );

  const latestJudgementEvent = latestMatchingMessage(
    timeline,
    (entry) => entry.type === "event" && entry.event.kind === "JUDGEMENT"
  );
  const judgementEventPayload =
    latestJudgementEvent && latestJudgementEvent.type === "event"
      ? asRecord(latestJudgementEvent.event.payload)
      : null;

  return {
    latestFinalJudgement:
      latestJudgementEvent && latestJudgementEvent.type === "event" && judgementEventPayload
        ? {
            createdAt: latestJudgementEvent.event.createdAt,
            vote: typeof judgementEventPayload.vote === "string" ? judgementEventPayload.vote : null,
            reason: typeof judgementEventPayload.reason === "string" ? judgementEventPayload.reason : null,
            confidence:
              typeof judgementEventPayload.confidence === "number" ? judgementEventPayload.confidence : null,
            agentKey:
              typeof judgementEventPayload.agentKey === "string" ? judgementEventPayload.agentKey : null
          }
        : null,
    latestJudgement:
      latestJudgement && latestJudgement.type === "message"
        ? {
            createdAt: latestJudgement.message.createdAt,
            content: latestJudgement.message.content,
            meta: readWorkerJudgementMeta(latestJudgement.message.meta)
          }
        : null,
    latestSuccess:
      latestSuccess && latestSuccess.type === "message"
        ? {
            createdAt: latestSuccess.message.createdAt,
            authorKey: latestSuccess.message.authorKey,
            meta: readWorkerDoneMeta(latestSuccess.message.meta)
          }
        : null,
    latestManualRequired:
      latestManualRequired && latestManualRequired.type === "message"
        ? {
            createdAt: latestManualRequired.message.createdAt,
            content: latestManualRequired.message.content,
            meta: readSystemMeta(latestManualRequired.message.meta)
          }
        : null,
    latestInactiveAgent:
      latestInactiveAgent && latestInactiveAgent.type === "message"
        ? {
            createdAt: latestInactiveAgent.message.createdAt,
            content: latestInactiveAgent.message.content,
            meta: readSystemMeta(latestInactiveAgent.message.meta)
          }
        : null,
    recentToolFailureCount: recentToolFailures.length,
    recentToolFailures: recentToolFailures.slice(-3).map((entry) => ({
      createdAt: entry.event.createdAt,
      actorKey: entry.event.actorKey,
      payload: asRecord(entry.event.payload)
    }))
  };
}

function isHistoricalSystemNoise(entry: TimelineEntry) {
  if (entry.type !== "message" || entry.message.authorType !== "SYSTEM") return false;
  const meta = asRecord(entry.message.meta);
  const kind = typeof meta?.kind === "string" ? meta.kind : null;
  return (
    kind === "mention_unmapped" ||
    kind === "mention_inactive" ||
    kind === "nexus_cell_init_unavailable" ||
    kind === "worker_dead_letter"
  );
}

function isSuccessfulAgentResult(entry: TimelineEntry) {
  if (entry.type !== "message" || entry.message.authorType !== "AGENT") return false;
  const meta = asRecord(entry.message.meta);
  return meta?.kind === "worker_done";
}

function buildDisplayedTimeline(timeline: TimelineEntry[]) {
  const latestHealthyReplyIndex = [...timeline]
    .reverse()
    .findIndex((entry) => isSuccessfulAgentResult(entry));
  const latestHealthyReplyAbsoluteIndex =
    latestHealthyReplyIndex === -1 ? -1 : timeline.length - 1 - latestHealthyReplyIndex;

  const hiddenHistoricalNoise: TimelineEntry[] = [];
  const visibleTimeline = timeline.filter((entry, index) => {
    if (
      latestHealthyReplyAbsoluteIndex !== -1 &&
      index < latestHealthyReplyAbsoluteIndex &&
      isHistoricalSystemNoise(entry)
    ) {
      hiddenHistoricalNoise.push(entry);
      return false;
    }
    return true;
  });

  return {
    visibleTimeline,
    hiddenHistoricalNoiseCount: hiddenHistoricalNoise.length
  };
}

function readRoutedHandoffMeta(meta: unknown): null | {
  requestedByAgent: string;
  targetAgentKey: string;
  sourceMessageId: string | null;
  manualRequired: boolean;
  reason: string | null;
  sourceChannel: string | null;
  routeCode: string | null;
  nbaImpact: string | null;
  humanGateRequired: boolean;
  humanGateApproved: boolean;
} {
  const record = asRecord(meta);
  if (
    !record ||
    (record.kind !== "agent_handoff_routed" &&
      record.kind !== "agent_handoff_manual_required")
  ) {
    return null;
  }

  const requestedByAgent =
    typeof record.requestedByAgent === "string" ? record.requestedByAgent : null;
  const targetAgentKey =
    typeof record.targetAgentKey === "string" ? record.targetAgentKey : null;
  const sourceMessageId =
    typeof record.sourceMessageId === "string" ? record.sourceMessageId : null;
  const reason = typeof record.reason === "string" ? record.reason : null;
  const sourceChannel =
    typeof record.sourceChannel === "string" ? record.sourceChannel : null;
  const routeCode = typeof record.routeCode === "string" ? record.routeCode : null;
  const nbaImpact = typeof record.nbaImpact === "string" ? record.nbaImpact : null;

  if (!requestedByAgent || !targetAgentKey) return null;

  return {
    requestedByAgent,
    targetAgentKey,
    sourceMessageId,
    manualRequired: record.kind === "agent_handoff_manual_required",
    reason,
    sourceChannel,
    routeCode,
    nbaImpact,
    humanGateRequired: record.humanGateRequired === true,
    humanGateApproved: record.humanGateApproved === true
  };
}

export default async function ChatPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;

  const thread = await getOrCreateThread({
    kind: "GLOBAL",
    ref: "main",
    title: "Global",
    createdById: userId ?? null
  });
  const timeline = await listThreadTimeline(thread.id, 200);
  const { visibleTimeline, hiddenHistoricalNoiseCount } = buildDisplayedTimeline(timeline);
  const commandCenterSummary = buildCommandCenterSummary(timeline);
  const messages = timeline
    .filter((entry) => entry.type === "message")
    .map((entry) => entry.message);
  const agents = await listUnifiedChatAgentAvailability();
  const activeAgents = agents.filter((agent) => agent.active);
  const mentionables = buildMentionables({
    agentKeys: activeAgents.map((a) => a.key),
    humanNames: []
  });

  return (
    <Shell
      title="Chat"
      subtitle="Unified transcript for all agents. Mention an active agent to queue work (e.g. @Controller review the backlog)."
    >
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-100/70">Latest verdict</div>
          <div className="mt-2 text-sm text-emerald-50">
            {commandCenterSummary.latestJudgement?.meta?.outcome
              ? `${commandCenterSummary.latestJudgement.meta.outcome} · @${
                  commandCenterSummary.latestJudgement.meta.agentKey || "agent"
                }`
              : commandCenterSummary.latestSuccess
              ? `@${commandCenterSummary.latestSuccess.authorKey || "agent"} completed a run`
              : "No final verdict yet."}
          </div>
          {commandCenterSummary.latestFinalJudgement ? (
            <div className="mt-1 text-xs text-emerald-100/90">
              Judgement:{" "}
              {commandCenterSummary.latestFinalJudgement.vote === "ESCALATE"
                ? `Escalated — ${commandCenterSummary.latestFinalJudgement.reason || "needs PO attention"}`
                : commandCenterSummary.latestFinalJudgement.vote === "APPROVE"
                ? "Approved"
                : commandCenterSummary.latestFinalJudgement.vote === "REJECT"
                ? "Rejected"
                : commandCenterSummary.latestFinalJudgement.vote ?? "—"}
              {commandCenterSummary.latestFinalJudgement.confidence != null
                ? ` (${(commandCenterSummary.latestFinalJudgement.confidence * 100).toFixed(0)}%)`
                : ""}
            </div>
          ) : null}
          {commandCenterSummary.latestJudgement ? (
            <div className="mt-2 text-xs text-emerald-100/75">
              {new Date(commandCenterSummary.latestJudgement.createdAt).toLocaleString()}
              {commandCenterSummary.latestJudgement.meta?.model
                ? ` · ${commandCenterSummary.latestJudgement.meta.model}`
                : ""}
              {commandCenterSummary.latestJudgement.meta?.durationMs != null
                ? ` · ${Math.round(commandCenterSummary.latestJudgement.meta.durationMs)}ms`
                : ""}
              {commandCenterSummary.latestJudgement.meta?.memoryCaptured
                ? " · memory captured"
                : ""}
            </div>
          ) : commandCenterSummary.latestSuccess ? (
            <div className="mt-2 text-xs text-emerald-100/75">
              {new Date(commandCenterSummary.latestSuccess.createdAt).toLocaleString()}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
          <div className="text-xs uppercase tracking-wide text-amber-100/70">Unresolved blocker</div>
          <div className="mt-2 text-sm text-amber-50">
            {commandCenterSummary.latestManualRequired
              ? "A task is waiting for manual intervention."
              : commandCenterSummary.latestFinalJudgement?.vote === "ESCALATE"
              ? "A task was escalated for PO attention."
              : commandCenterSummary.latestInactiveAgent
              ? "A requested agent is currently unavailable."
              : "No current manual or availability blocker."}
          </div>
          {commandCenterSummary.latestManualRequired || commandCenterSummary.latestInactiveAgent ? (
            <div className="mt-2 text-xs text-amber-100/75">
              {new Date(
                (commandCenterSummary.latestManualRequired || commandCenterSummary.latestInactiveAgent)!.createdAt
              ).toLocaleString()}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4">
          <div className="text-xs uppercase tracking-wide text-rose-100/70">Recent tool failures</div>
          <div className="mt-2 text-sm text-rose-50">
            {commandCenterSummary.recentToolFailureCount} failure
            {commandCenterSummary.recentToolFailureCount === 1 ? "" : "s"} in transcript history
          </div>
          <div className="mt-2 text-xs text-rose-100/75">
            {commandCenterSummary.recentToolFailures.length
              ? commandCenterSummary.recentToolFailures
                  .map((failure) => `@${failure.actorKey || "agent"} ${failure.payload?.tool || "tool"}`)
                  .join(" · ")
              : "No recorded tool failures."}
          </div>
        </div>
      </div>
        <div className="mb-4 rounded-2xl border border-white/12 bg-white/5 p-4">
        <div className="text-sm font-medium text-white/90">Operator shortcuts</div>
        <div className="mt-2 grid gap-2 text-xs text-white/65 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <span className="font-mono text-white/85">/agents</span> opens the live agent roster.
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <span className="font-mono text-white/85">@Controller &lt;task&gt;</span> queues ALPHA orchestration work.
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <span className="font-mono text-white/85">@Writer &lt;task&gt;</span> queues implementation work directly.
          </div>
        </div>
        {hiddenHistoricalNoiseCount > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
            Hidden {hiddenHistoricalNoiseCount} stale bootstrap/system warning
            {hiddenHistoricalNoiseCount === 1 ? "" : "s"} from earlier startup attempts.
          </div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-white/12 bg-white/5">
        <div className="max-h-[55vh] overflow-auto p-5">
          <div className="space-y-4">
            {visibleTimeline.map((entry) => {
              if (entry.type === "event") {
                const payload = asRecord(entry.event.payload);
                const eventKind = String(entry.event.kind);
                const projectSessionRelPath =
                  typeof payload?.projectSessionRelPath === "string"
                    ? payload.projectSessionRelPath
                    : typeof payload?.relPath === "string"
                    ? payload.relPath
                    : null;
                return (
                  <div key={entry.event.id} className="flex gap-3">
                    <div className="mt-1 h-8 w-8 flex-none rounded-full border border-cyan-300/20 bg-cyan-300/10" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-white/60">
                        <div className="font-medium text-cyan-100/85">Event</div>
                        <div className="font-mono">
                          {new Date(entry.event.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-1 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-50">
                        {eventKind === "PROJECT_SESSION_OPENED"
                          ? `Project session opened: ${projectSessionRelPath || "."}`
                          : eventKind === "TOOL_CALL_FAILED"
                          ? `Tool call failed for @${entry.event.actorKey || "agent"}`
                          : eventKind === "TOOL_CALL_EXECUTED"
                          ? `Tool call executed for @${entry.event.actorKey || "agent"}`
                          : eventKind === "TASK_MANUAL_REQUIRED"
                          ? `Task queued as manual-required for @${entry.event.actorKey || "agent"}`
                          : eventKind === "JUDGEMENT"
                          ? (() => {
                              const vote = typeof payload?.vote === "string" ? payload.vote : null;
                              const reason = typeof payload?.reason === "string" ? payload.reason : null;
                              if (vote === "ESCALATE") {
                                return `Escalated: ${reason || "needs PO attention"}`;
                              }
                              if (vote === "APPROVE") return `Judgement: Approved${reason ? ` — ${reason}` : ""}`;
                              if (vote === "REJECT") return `Judgement: Rejected${reason ? ` — ${reason}` : ""}`;
                              return `Judgement: ${vote ?? "—"}`;
                            })()
                          : `Task queued for @${entry.event.actorKey || "agent"}`}
                        {eventKind !== "JUDGEMENT" && typeof payload?.title === "string" ? ` - ${payload.title}` : ""}
                        {eventKind !== "JUDGEMENT" && typeof payload?.tool === "string" ? ` - ${payload.tool}` : ""}
                        {eventKind !== "JUDGEMENT" && typeof payload?.reason === "string" ? ` - ${payload.reason}` : ""}
                        {eventKind === "JUDGEMENT" && typeof payload?.confidence === "number"
                          ? ` (confidence ${payload.confidence.toFixed(2)})`
                          : ""}
                      </div>
                    </div>
                  </div>
                );
              }

              const m = entry.message;
              const routed = readRoutedHandoffMeta(m.meta);
              const doneMeta = readWorkerDoneMeta(m.meta);
              const systemMeta = readSystemMeta(m.meta);
              const judgementMeta = readWorkerJudgementMeta(m.meta);
              return (
                <div key={m.id} className="flex gap-3">
                  <div className="mt-1 h-8 w-8 flex-none rounded-full border border-white/15 bg-white/5" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <div className="font-medium text-white/75">
                        {m.authorType === "HUMAN"
                          ? m.user?.name || "Human"
                          : m.authorKey || m.authorType}
                      </div>
                      <div className="font-mono">
                        {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-white/90">
                      {m.content}
                    </div>
                    {doneMeta ? (
                      <div className="mt-2 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">
                        Run complete
                        {doneMeta.provider ? ` · provider=${doneMeta.provider}` : ""}
                        {doneMeta.model ? ` · model=${doneMeta.model}` : ""}
                        {doneMeta.durationMs != null ? ` · duration=${Math.round(doneMeta.durationMs)}ms` : ""}
                        {doneMeta.grounded ? " · grounded" : ""}
                        {doneMeta.doneReason ? ` · reason=${doneMeta.doneReason}` : ""}
                      </div>
                    ) : null}
                    {judgementMeta ? (
                      <div className="mt-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
                        Final verdict
                        {judgementMeta.outcome ? ` · ${judgementMeta.outcome}` : ""}
                        {judgementMeta.agentKey ? ` · @${judgementMeta.agentKey}` : ""}
                        {judgementMeta.provider ? ` · provider=${judgementMeta.provider}` : ""}
                        {judgementMeta.model ? ` · model=${judgementMeta.model}` : ""}
                        {judgementMeta.durationMs != null
                          ? ` · duration=${Math.round(judgementMeta.durationMs)}ms`
                          : ""}
                        {judgementMeta.doneReason ? ` · reason=${judgementMeta.doneReason}` : ""}
                        {judgementMeta.code ? ` · code=${judgementMeta.code}` : ""}
                        {judgementMeta.grounded ? " · grounded" : ""}
                        {judgementMeta.memoryCaptured ? " · memory=captured" : ""}
                      </div>
                    ) : null}
                    {m.authorType === "SYSTEM" && systemMeta?.kind === "task_manual_required" ? (
                      <div className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                        Manual intervention required
                        {systemMeta.reason ? ` · ${systemMeta.reason}` : ""}
                      </div>
                    ) : null}
                    {m.authorType === "SYSTEM" && systemMeta?.kind === "mention_inactive" ? (
                      <div className="mt-2 rounded-lg border border-rose-300/25 bg-rose-300/10 px-2 py-1 text-xs text-rose-100">
                        Agent unavailable
                        {systemMeta.reason ? ` · ${systemMeta.reason}` : ""}
                      </div>
                    ) : null}
                    {routed ? (
                      <div
                        className={`mt-2 rounded-lg border px-2 py-1 text-xs ${
                          routed.manualRequired
                            ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                            : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                        }`}
                      >
                        {routed.manualRequired ? "Manual-required handoff" : "Routed handoff"} @
                        {routed.requestedByAgent} -&gt; @{routed.targetAgentKey}
                        {routed.sourceMessageId
                          ? ` (src ${routed.sourceMessageId.slice(0, 8)})`
                          : ""}
                        {routed.reason ? ` - ${routed.reason}` : ""}
                        {routed.sourceChannel ? ` - channel=${routed.sourceChannel}` : ""}
                        {routed.routeCode ? ` - route=${routed.routeCode}` : ""}
                        {routed.nbaImpact ? ` - impact=${routed.nbaImpact}` : ""}
                        {routed.humanGateRequired
                          ? routed.humanGateApproved
                            ? " - gate=approved"
                            : " - gate=required"
                          : ""}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {visibleTimeline.length === 0 ? (
              <div className="text-sm text-white/70">No messages yet.</div>
            ) : null}
          </div>
        </div>
        <div className="border-t border-white/10 p-5">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2">
            <div className="text-xs text-cyan-100">
              Quick action: queue <span className="font-mono">@Controller initialize squad orchestration</span>
            </div>
            <form action={initializeNexusCellAction}>
              <button
                type="submit"
                className="rounded-lg border border-cyan-200/35 bg-cyan-200/15 px-3 py-1 text-xs font-medium text-cyan-50 hover:bg-cyan-200/25"
              >
                Initialize Squad
              </button>
            </form>
          </div>
          {agents.length > 0 ? (
            <div className="mb-3 space-y-2">
              <div className="text-xs text-white/60">
                Active in unified chat:{" "}
                {activeAgents.length
                  ? activeAgents.map((agent) => `@${agent.key}`).join(", ")
                  : "none"}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {agents.map((agent) => (
                  <div
                    key={agent.key}
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      agent.active
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                        : "border-white/10 bg-white/5 text-white/75"
                    }`}
                  >
                    <div className="font-medium">
                      @{agent.key} {agent.active ? "active" : "inactive"}
                    </div>
                    <div className="mt-1 text-[11px] opacity-85">
                      {agent.controlRole} / {agent.runtime} / {agent.readiness}
                      {agent.model ? ` / ${agent.model}` : ""}
                    </div>
                    {!agent.active && agent.reason ? (
                      <div className="mt-1 text-[11px] opacity-80">{agent.reason}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <form action={sendGlobalMessage} className="flex gap-3">
            <MentionInput
              name="content"
              mentionables={mentionables}
              placeholder='Message (try: "@Agent sync on amanoba" or "/agents")'
            />
            <button
              type="submit"
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { getOrCreateThread } from "@/lib/chat";
import {
  getProjectAlphaLockSnapshot,
  listProjectAlphaContextAuditEvents
} from "@/lib/alpha-context";
import {
  ensureProjectItemForIssue,
  getIssueDetails,
  getItemSingleSelectValues,
  getProjectMeta,
  isGithubGraphqlConfigured,
  reconcileBoardAgentOptions,
  reconcileBoardAgentValue
} from "@/lib/github";
import {
  activateIssueAlphaContextAction,
  closeIssueAlphaContextAction,
  enqueueIssueTask,
  overrideIssueGuardrailAction,
  recordIssueHandoverPackageAction,
  requestIssueTaskControlAction,
  resumeIssueTaskAction,
  sendIssueMessage,
  transferIssueAlphaContextAction,
  updateIssueFields
} from "@/app/issues/[number]/actions";
import { prisma } from "@/lib/prisma";
import { listAgentTasks } from "@/lib/tasks";
import {
  listIssueTaskPromptPackageInvariants,
  listProjectAlphaContextPackageInvariants
} from "@/lib/prompt-package-invariants";
import { buildMentionables } from "@/lib/mentionables";
import {
  promptPackageMissingSummary,
  validateExecutablePromptPackage
} from "@/lib/executable-prompt";
import { MentionInput } from "@/components/MentionInput";
import { listUnifiedChatAgentAvailability } from "@/lib/active-agents";
import { listThreadTimeline } from "@/lib/thread-events";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

function readTaskHandoffTrace(payload: unknown): null | {
  requestedByAgent: string;
  sourceThreadId: string;
  sourceMessageId: string;
} {
  const record = asRecord(payload);
  if (!record || record.kind !== "agent_handoff") return null;

  const requestedByAgent =
    typeof record.requestedByAgent === "string" ? record.requestedByAgent : null;
  const sourceThreadId =
    typeof record.sourceThreadId === "string" ? record.sourceThreadId : null;
  const sourceMessageId =
    typeof record.sourceMessageId === "string" ? record.sourceMessageId : null;

  if (!requestedByAgent || !sourceThreadId || !sourceMessageId) return null;
  return { requestedByAgent, sourceThreadId, sourceMessageId };
}

function readTaskControlState(payload: unknown): null | {
  lastAction: string | null;
  reason: string | null;
  requestedAt: string | null;
  resumeAllowed: boolean;
} {
  const record = asRecord(payload);
  const taskControl = asRecord(record?.taskControl);
  const state = asRecord(taskControl?.state);
  if (!state) return null;
  return {
    lastAction: typeof state.lastAction === "string" ? state.lastAction : null,
    reason: typeof state.reason === "string" ? state.reason : null,
    requestedAt: typeof state.requestedAt === "string" ? state.requestedAt : null,
    resumeAllowed: state.resumeAllowed === true
  };
}

export default async function IssuePage(props: {
  params: Promise<{ number: string }>;
}) {
  const session = await requireSession();
  if (!session) redirect("/signin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;

  const { number } = await props.params;
  const issueNumber = Number(number);
  if (!Number.isFinite(issueNumber)) redirect("/dashboard");

  if (!isGithubGraphqlConfigured()) {
    return (
      <Shell title={`Issue #${issueNumber}`} subtitle="GitHub integration is not configured.">
        <div className="ds-card max-w-xl p-5 text-sm text-white/75">
          <p>
            Issue pages read from GitHub Projects (GraphQL). Set{" "}
            <code className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs text-white/90">
              SOVEREIGN_GITHUB_TOKEN
            </code>{" "}
            or{" "}
            <code className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-xs text-white/90">
              GITHUB_TOKEN
            </code>{" "}
            in <code className="text-xs">apps/sovereign/.env</code>, then restart the dev server. See{" "}
            <code className="text-xs">.env.example</code> for the full checklist.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-[color:var(--accent)] underline-offset-2 hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  const [meta, issue] = await Promise.all([
    getProjectMeta(),
    getIssueDetails({ issueNumber })
  ]);

  const { itemId } = await ensureProjectItemForIssue({ issueNumber });
  const current = await getItemSingleSelectValues({ itemId });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  const timeline = await listThreadTimeline(thread.id, 200);
  const messages = timeline
    .filter((entry) => entry.type === "message")
    .map((entry) => entry.message);
  const promptValidation = validateExecutablePromptPackage(issue.body || "");

  const statusOpts = meta.fields.find((f) => f.name === "Status")?.options ?? [];
  const boardAgentOpts = meta.fields.find((f) => f.name === "Agent")?.options ?? [];
  const priOpts = meta.fields.find((f) => f.name === "Priority")?.options ?? [];
  const dodOpts = meta.fields.find((f) => f.name === "DoD")?.options ?? [];

  const [agents, availability] = await Promise.all([
    prisma.agent.findMany({ orderBy: { displayName: "asc" } }),
    listUnifiedChatAgentAvailability()
  ]);
  const runtimeAgents = agents.filter((a) => a.runtime !== "MANUAL");
  const activeAgents = availability.filter((agent) => agent.active);
  const activeAgentKeys = new Set(activeAgents.map((agent) => agent.key.toLowerCase()));
  const boardAgentResolution = reconcileBoardAgentValue({
    boardAgentValue: current["Agent"] || null,
    dbAgents: runtimeAgents.map((a) => ({
      key: a.key,
      displayName: a.displayName,
      enabled: a.enabled,
      runtime: a.runtime
    }))
  });
  const boardAgentReconciliation = reconcileBoardAgentOptions({
    boardAgentOptions: boardAgentOpts.map((o) => o.name),
    dbAgents: runtimeAgents.map((a) => ({
      key: a.key,
      displayName: a.displayName,
      enabled: a.enabled,
      runtime: a.runtime
    }))
  });
  const mentionables = buildMentionables({
    agentKeys: activeAgents.map((agent) => agent.key),
    humanNames: []
  });
  const activeAgentForTasks =
    boardAgentResolution.mappedAgentKey &&
    activeAgentKeys.has(boardAgentResolution.mappedAgentKey.toLowerCase())
      ? boardAgentResolution.mappedAgentKey
      : null;
  const alphaAgents = activeAgents.filter((agent) => agent.controlRole === "ALPHA");
  const currentProjectName = String(current["Product"] || "").trim();
  const alphaLockSnapshot = currentProjectName
    ? await getProjectAlphaLockSnapshot(currentProjectName)
    : null;
  const alphaLockAudits = currentProjectName
    ? await listProjectAlphaContextAuditEvents({
        projectName: currentProjectName,
        limit: 10
      })
    : [];
  const tasks = activeAgentForTasks
    ? await listAgentTasks({
        agentKey: activeAgentForTasks,
        issueNumber,
        limit: 20
      })
    : [];
  const taskPromptInvariants = await listIssueTaskPromptPackageInvariants({
    issueNumber,
    limit: 12
  });
  const alphaContextPackageInvariants = currentProjectName
    ? await listProjectAlphaContextPackageInvariants({
        projectName: currentProjectName,
        limit: 12
      })
    : [];

  return (
    <Shell
      title={`Issue #${issueNumber}`}
      subtitle={`${current["Product"] || "(no product)"} · ${current["Status"] || "(no status)"} · ${current["Agent"] || "(no agent)"}`}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="ds-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-white/95">
                  {issue.title}
                </div>
                <div className="mt-2 text-xs text-white/60">
                  Updated {new Date(issue.updatedAt).toLocaleString()}
                </div>
              </div>
              <Link
                href={issue.url}
                target="_blank"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/85 hover:bg-white/10"
              >
                Open on GitHub
              </Link>
            </div>
            {issue.body ? (
              <div className="mt-4 whitespace-pre-wrap text-sm text-white/85">
                {issue.body}
              </div>
            ) : (
              <div className="mt-4 text-sm text-white/70">(No description)</div>
            )}
            {!promptValidation.valid ? (
              <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                {promptPackageMissingSummary(promptValidation)}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-200/10 px-3 py-2 text-xs text-emerald-100">
                Executable Prompt Package: valid.
              </div>
            )}
          </div>

          <div className="ds-card p-5">
            <div className="text-sm font-semibold">Board fields</div>
            <div className="mt-1 text-xs text-white/60">
              Updates go directly to GitHub Project fields.
            </div>
            <form
              action={async (fd) => {
                "use server";
                await updateIssueFields(issueNumber, fd);
              }}
              className="mt-4 grid gap-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-1 text-xs text-white/60">Status</div>
                  <select
                    name="Status"
                    defaultValue={current["Status"] || ""}
                    className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/25"
                  >
                    <option value="">(no change)</option>
                    {statusOpts.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="mb-1 text-xs text-white/60">Agent</div>
                  <select
                    name="Agent"
                    defaultValue={boardAgentResolution.mappedAgentKey || ""}
                    className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/25"
                  >
                    <option value="">(no change)</option>
                    {runtimeAgents.map((a) => (
                      <option key={a.id} value={a.key}>
                        {a.displayName || a.key}
                        {a.enabled ? "" : " (disabled)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-1 text-xs text-white/60">Priority</div>
                  <select
                    name="Priority"
                    defaultValue={current["Priority"] || ""}
                    className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/25"
                  >
                    <option value="">(no change)</option>
                    {priOpts.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="mb-1 text-xs text-white/60">DoD</div>
                  <select
                    name="DoD"
                    defaultValue={current["DoD"] || ""}
                    className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/25"
                  >
                    <option value="">(no change)</option>
                    {dodOpts.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="submit"
                className="mt-2 w-fit rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
              >
                Update fields
              </button>
            </form>
            <div className="mt-4 text-xs text-white/60">
              Current: Status={current["Status"] || "-"}, Agent=
              {current["Agent"] || "-"}, Priority={current["Priority"] || "-"}, DoD=
              {current["DoD"] || "-"}
            </div>
            {boardAgentResolution.status === "UNMAPPED" ? (
              <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                Board Agent value <code>{boardAgentResolution.rawValue}</code> is not mapped to any DB runtime
                agent. Select a runtime agent and update fields to reconcile.
              </div>
            ) : boardAgentResolution.status === "MAPPED" &&
              boardAgentResolution.rawValue &&
              boardAgentResolution.rawValue !== boardAgentResolution.mappedAgentKey ? (
              <div className="mt-2 rounded-xl border border-cyan-300/25 bg-cyan-200/10 px-3 py-2 text-xs text-cyan-100">
                Board Agent <code>{boardAgentResolution.rawValue}</code> maps to canonical runtime key{" "}
                <code>{boardAgentResolution.mappedAgentKey}</code>.
              </div>
            ) : null}
            <div className="mt-2 text-xs text-white/55">
              Agent option integrity: mapped={boardAgentReconciliation.mappedCount}, unmapped=
              {boardAgentReconciliation.unmappedCount}.
            </div>
          </div>

          <div className="ds-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Alpha context lock (MVP)</div>
              {alphaLockSnapshot?.activeWindow ? (
                <span className="rounded-full border border-emerald-300/25 bg-emerald-200/10 px-2 py-0.5 text-xs text-emerald-100">
                  ACTIVE
                </span>
              ) : (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                  UNLOCKED
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-white/60">
              One active Alpha context window per Product is allowed.
            </div>

            {!currentProjectName ? (
              <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                Product is not set on this issue, so per-project Alpha context lock cannot be managed yet.
              </div>
            ) : (
              <>
                <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/75">
                  <div>
                    Product: <span className="font-mono">{currentProjectName}</span>
                  </div>
                  <div className="mt-1 text-white/60">
                    Active owner:{" "}
                    {alphaLockSnapshot?.activeWindow
                      ? `@${alphaLockSnapshot.activeWindow.ownerAgentKey}`
                      : "(none)"}
                  </div>
                  <div className="mt-1 text-white/60">
                    Window id:{" "}
                    {alphaLockSnapshot?.activeWindow
                      ? alphaLockSnapshot.activeWindow.id.slice(0, 12)
                      : "(none)"}
                  </div>
                  <div className="mt-1 text-white/60">
                    Activated:{" "}
                    {alphaLockSnapshot?.activeWindow?.activatedAt
                      ? new Date(alphaLockSnapshot.activeWindow.activatedAt).toLocaleString()
                      : "(none)"}
                  </div>
                  <div className="mt-1 text-white/60">
                    Continuity ref: {alphaLockSnapshot?.continuityRef || "(none)"}
                  </div>
                  <div className="mt-1 text-white/60">
                    Context usage:{" "}
                    {alphaLockSnapshot?.activeWindow
                      ? `${alphaLockSnapshot.activeWindow.contextUsagePercent}%`
                      : "0%"}
                  </div>
                  <div className="mt-1 text-white/60">
                    Guardrail state: {alphaLockSnapshot?.activeWindow?.guardrailState || "NO_ACTIVE_LOCK"}
                  </div>
                  <div className="mt-1 text-white/60">
                    Package ready:{" "}
                    {alphaLockSnapshot?.activeWindow?.handoverPackageReadyAt
                      ? new Date(alphaLockSnapshot.activeWindow.handoverPackageReadyAt).toLocaleString()
                      : "(not recorded)"}
                  </div>
                </div>

                {alphaLockSnapshot?.activeWindow?.guardrailState === "WARNING" ? (
                  <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                    Context usage is approaching threshold. Prepare handover package before crossing 70%.
                  </div>
                ) : null}
                {alphaLockSnapshot?.activeWindow?.guardrailState === "BLOCKED" ? (
                  <div className="mt-2 rounded-xl border border-rose-300/25 bg-rose-200/10 px-3 py-2 text-xs text-rose-100">
                    Scope expansion is blocked until both handover package ref and continuation prompt ref are recorded.
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3">
                  {alphaAgents.length === 0 ? (
                    <div className="rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                      No enabled ALPHA agents are available. Configure one on `/agents` before activating or
                      transferring context locks.
                    </div>
                  ) : null}

                  <form
                    action={async (fd) => {
                      "use server";
                      await activateIssueAlphaContextAction(issueNumber, fd);
                    }}
                    className="rounded-xl border border-white/10 bg-black/15 p-3"
                  >
                    <div className="text-xs font-semibold text-white/80">
                      Activate context lock
                    </div>
                    <input type="hidden" name="projectName" value={currentProjectName} />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-white/70">
                        Alpha owner
                        <select
                          name="ownerAgentKey"
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                          defaultValue={alphaAgents[0]?.key || ""}
                        >
                          {alphaAgents.length === 0 ? (
                            <option value="">(no enabled ALPHA agents)</option>
                          ) : null}
                          {alphaAgents.map((agent) => (
                            <option key={agent.key} value={agent.key}>
                              {agent.displayName || agent.key}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-white/70">
                        Handover reference (optional)
                        <input
                          type="text"
                          name="activationHandoverRef"
                          placeholder="HANDOVER.md#..."
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-xs text-white/70">
                      Continuity note (optional)
                      <input
                        type="text"
                        name="continuityNote"
                        placeholder="operator handover note"
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={alphaAgents.length === 0}
                      className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
                    >
                      Activate
                    </button>
                  </form>

                  <form
                    action={async (fd) => {
                      "use server";
                      await transferIssueAlphaContextAction(issueNumber, fd);
                    }}
                    className="rounded-xl border border-white/10 bg-black/15 p-3"
                  >
                    <div className="text-xs font-semibold text-white/80">
                      Transfer active context lock
                    </div>
                    <input type="hidden" name="projectName" value={currentProjectName} />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-white/70">
                        Successor Alpha
                        <select
                          name="toAgentKey"
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                          defaultValue={alphaAgents[0]?.key || ""}
                        >
                          {alphaAgents.length === 0 ? (
                            <option value="">(no enabled ALPHA agents)</option>
                          ) : null}
                          {alphaAgents.map((agent) => (
                            <option key={agent.key} value={agent.key}>
                              {agent.displayName || agent.key}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-white/70">
                        Handover reference
                        <input
                          type="text"
                          name="handoverRef"
                          required
                          placeholder="HANDOVER.md#transfer"
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-xs text-white/70">
                      Continuity note (optional)
                      <input
                        type="text"
                        name="continuityNote"
                        placeholder="what changed before transfer"
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={alphaAgents.length === 0}
                      className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
                    >
                      Transfer
                    </button>
                  </form>

                  <form
                    action={async (fd) => {
                      "use server";
                      await closeIssueAlphaContextAction(issueNumber, fd);
                    }}
                    className="rounded-xl border border-white/10 bg-black/15 p-3"
                  >
                    <div className="text-xs font-semibold text-white/80">
                      Close active context lock
                    </div>
                    <input type="hidden" name="projectName" value={currentProjectName} />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-white/70">
                        Handover reference
                        <input
                          type="text"
                          name="handoverRef"
                          required
                          placeholder="HANDOVER.md#close"
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </label>
                      <label className="text-xs text-white/70">
                        Close reason (optional)
                        <input
                          type="text"
                          name="closeReason"
                          placeholder="context complete / paused"
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
                    >
                      Close lock
                    </button>
                  </form>

                  <form
                    action={async (fd) => {
                      "use server";
                      await recordIssueHandoverPackageAction(issueNumber, fd);
                    }}
                    className="rounded-xl border border-white/10 bg-black/15 p-3"
                  >
                    <div className="text-xs font-semibold text-white/80">
                      Record handover package (guardrail gate)
                    </div>
                    <input type="hidden" name="projectName" value={currentProjectName} />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-white/70">
                        Handover package ref
                        <input
                          type="text"
                          name="handoverPackageRef"
                          required
                          placeholder="HANDOVER.md#..."
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </label>
                      <label className="text-xs text-white/70">
                        Continuation prompt ref
                        <input
                          type="text"
                          name="continuationPromptRef"
                          required
                          placeholder="docs/SOVEREIGN_DELIVERY_ROADMAP.md#..."
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-xs text-white/70">
                      Note (optional)
                      <input
                        type="text"
                        name="handoverNote"
                        placeholder="summary of continuation package readiness"
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/25"
                      />
                    </label>
                    <button
                      type="submit"
                      className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
                    >
                      Record package
                    </button>
                  </form>

                  <form
                    action={async (fd) => {
                      "use server";
                      await overrideIssueGuardrailAction(issueNumber, fd);
                    }}
                    className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"
                  >
                    <div className="text-xs font-semibold text-amber-100">
                      Guardrail override (explicit + audited)
                    </div>
                    <input type="hidden" name="projectName" value={currentProjectName} />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-amber-100/80">
                        Override reason
                        <input
                          type="text"
                          name="overrideReason"
                          required
                          placeholder="why temporary bypass is required"
                          className="mt-1 w-full rounded-lg border border-amber-300/25 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-amber-300/45"
                        />
                      </label>
                      <label className="text-xs text-amber-100/80">
                        Duration (minutes)
                        <input
                          type="number"
                          name="durationMinutes"
                          min={5}
                          max={240}
                          defaultValue={30}
                          className="mt-1 w-full rounded-lg border border-amber-300/25 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-amber-300/45"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="mt-3 rounded-lg border border-amber-300/35 bg-amber-300/15 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-300/20"
                    >
                      Set override
                    </button>
                  </form>
                </div>

                <div className="mt-3 text-xs text-white/65">Recent context lock events</div>
                <div className="mt-2 space-y-1.5">
                  {alphaLockAudits.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-1.5 py-0.5 ${
                            event.allowed
                              ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-100"
                              : "border-rose-300/25 bg-rose-200/10 text-rose-100"
                          }`}
                        >
                          {event.allowed ? "ALLOW" : "DENY"}
                        </span>
                        <span className="font-mono text-white/75">{event.action}</span>
                        <span className="text-white/45">
                          {new Date(event.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-white/65">{event.reason}</div>
                    </div>
                  ))}
                  {alphaLockAudits.length === 0 ? (
                    <div className="text-[11px] text-white/55">(no context lock events yet)</div>
                  ) : null}
                </div>

                <div className="mt-4 text-xs text-white/65">
                  Prompt/package lineage snapshots
                </div>
                <div className="mt-2 space-y-1.5">
                  {alphaContextPackageInvariants.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-300/25 bg-cyan-200/10 px-1.5 py-0.5 text-cyan-100">
                          {snapshot.snapshotKind}
                        </span>
                        <span className="font-mono text-white/60">{snapshot.windowId.slice(0, 8)}</span>
                        <span className="text-white/45">
                          {new Date(snapshot.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-white/65">
                        hash {snapshot.snapshotHash.slice(0, 12)}
                        {snapshot.predecessorSnapshotId
                          ? ` · prev ${snapshot.predecessorSnapshotId.slice(0, 8)}`
                          : " · root"}
                        {snapshot.handoverPackageRef
                          ? ` · package ${snapshot.handoverPackageRef}`
                          : ""}
                      </div>
                    </div>
                  ))}
                  {alphaContextPackageInvariants.length === 0 ? (
                    <div className="text-[11px] text-white/55">(no context package snapshots yet)</div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="ds-card">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold">Issue thread</div>
            <div className="mt-1 text-xs text-white/60">
              Stored in Postgres. This is where agents will coordinate.
            </div>
          </div>
          <div className="max-h-[55vh] overflow-auto p-5">
            <div className="space-y-4">
              {timeline.map((entry) => {
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
                            : `Task queued for @${entry.event.actorKey || "agent"}`}
                          {typeof payload?.title === "string" ? ` - ${payload.title}` : ""}
                          {typeof payload?.tool === "string" ? ` - ${payload.tool}` : ""}
                          {typeof payload?.reason === "string" ? ` - ${payload.reason}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                }

                const m = entry.message;
                const routed = readRoutedHandoffMeta(m.meta);
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
              {timeline.length === 0 ? (
                <div className="text-sm text-white/70">
                  No messages yet. Use this thread as the canonical place for task coordination.
                </div>
              ) : null}
            </div>
          </div>
          <div className="border-t border-white/10 p-5">
            <form
              action={async (fd) => {
                "use server";
                await sendIssueMessage(issueNumber, fd);
              }}
              className="flex gap-3"
            >
              <MentionInput
                name="content"
                mentionables={mentionables}
                placeholder='Message (try: "@Agent take this once Status=Ready")'
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

        <div className="ds-card">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold">Enqueue work</div>
            <div className="mt-1 text-xs text-white/60">
              This creates a task in the Sovereign queue. The worker picks it up when ready.
            </div>
          </div>
          <div className="p-5">
            <form
              action={async (fd) => {
                "use server";
                await enqueueIssueTask(issueNumber, fd);
              }}
              className="grid gap-3"
            >
              <label className="text-sm">
                <div className="mb-1 text-xs text-white/60">Agent</div>
                <select
                  name="agentKey"
                  defaultValue={activeAgentForTasks || ""}
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/25"
                >
                  <option value="">Select agent</option>
                  {activeAgents.map((agent) => (
                    <option key={agent.key} value={agent.key}>
                      {agent.displayName || agent.key} ({agent.runtime}/{agent.controlRole})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-1 text-xs text-white/60">Task title</div>
                <input
                  name="title"
                  placeholder="e.g. Implement the fix and open PR"
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 placeholder:text-white/45 outline-none focus:border-white/25"
                />
              </label>
              <button
                type="submit"
                className="w-fit rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/15"
              >
                Enqueue
              </button>
            </form>

            {boardAgentResolution.mappedAgentKey && !activeAgentForTasks ? (
              <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                Board-assigned agent @{boardAgentResolution.mappedAgentKey} is not currently active for execution.
                Pick an active agent above or restore worker/readiness coverage first.
              </div>
            ) : null}

            {activeAgentForTasks ? (
              <div className="mt-6">
                <div className="text-sm font-semibold">
                  Recent issue tasks for {activeAgentForTasks}
                </div>
                <div className="mt-3 space-y-2">
                  {tasks.map((t) => (
                    (() => {
                      const handoff = readTaskHandoffTrace(t.payload);
                      const control = readTaskControlState(t.payload);
                      const resumeAllowed = Boolean(control?.resumeAllowed && t.status === "CANCELED");
                      return (
                        <div
                          key={t.id}
                          className="rounded-xl border border-white/10 bg-black/15 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-white/90">{t.title}</div>
                            <div className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                              {t.status}
                            </div>
                          </div>
                          {handoff ? (
                            <div className="mt-1 text-xs text-cyan-100/90">
                              Handoff from @{handoff.requestedByAgent} (src{" "}
                              {handoff.sourceMessageId.slice(0, 8)})
                            </div>
                          ) : null}
                          {t.error ? (
                            <div className="mt-1 text-xs text-amber-100/90">{t.error}</div>
                          ) : null}
                          {control ? (
                            <div className="mt-1 text-xs text-cyan-100/85">
                              Control: {control.lastAction || "unknown"}
                              {control.reason ? ` (${control.reason})` : ""}
                              {control.requestedAt
                                ? ` · ${new Date(control.requestedAt).toLocaleString()}`
                                : ""}
                            </div>
                          ) : null}
                          <div className="mt-1 font-mono text-[11px] text-white/55">
                            {new Date(t.createdAt).toLocaleString()}
                          </div>
                          {t.status === "RUNNING" ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <form
                                action={async (fd) => {
                                  "use server";
                                  await requestIssueTaskControlAction(issueNumber, fd);
                                }}
                                className="flex items-center gap-2"
                              >
                                <input type="hidden" name="taskId" value={t.id} />
                                <input type="hidden" name="control" value="INTERRUPT" />
                                <input
                                  type="text"
                                  name="reason"
                                  placeholder="interrupt reason (optional)"
                                  className="w-56 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/85 outline-none focus:border-white/25"
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg border border-amber-300/35 bg-amber-300/15 px-2 py-1 text-xs text-amber-100 hover:bg-amber-300/25"
                                >
                                  Interrupt
                                </button>
                              </form>
                              <form
                                action={async (fd) => {
                                  "use server";
                                  await requestIssueTaskControlAction(issueNumber, fd);
                                }}
                                className="flex items-center gap-2"
                              >
                                <input type="hidden" name="taskId" value={t.id} />
                                <input type="hidden" name="control" value="CANCEL" />
                                <input
                                  type="text"
                                  name="reason"
                                  placeholder="cancel reason (optional)"
                                  className="w-52 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/85 outline-none focus:border-white/25"
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg border border-rose-300/35 bg-rose-300/15 px-2 py-1 text-xs text-rose-100 hover:bg-rose-300/25"
                                >
                                  Cancel
                                </button>
                              </form>
                            </div>
                          ) : null}
                          {resumeAllowed ? (
                            <form
                              action={async (fd) => {
                                "use server";
                                await resumeIssueTaskAction(issueNumber, fd);
                              }}
                              className="mt-2 flex flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="taskId" value={t.id} />
                              <input
                                type="text"
                                name="resumeNote"
                                placeholder="resume note (optional)"
                                className="w-56 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/85 outline-none focus:border-white/25"
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-emerald-300/35 bg-emerald-300/15 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-300/25"
                              >
                                Resume
                              </button>
                            </form>
                          ) : null}
                        </div>
                      );
                    })()
                  ))}
                  {tasks.length === 0 ? (
                    <div className="text-sm text-white/70">
                      No issue-scoped tasks for this agent yet.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : boardAgentResolution.status === "UNMAPPED" ? (
              <div className="mt-4 text-sm text-amber-100/90">
                Task history unavailable: board Agent <code>{boardAgentResolution.rawValue}</code> is unmapped.
              </div>
            ) : (
              <div className="mt-4 text-sm text-white/70">
                Set an Agent on the card to see per-agent task history here.
              </div>
            )}

            <div className="mt-6">
              <div className="text-sm font-semibold">Task prompt/package invariants</div>
              <div className="mt-3 space-y-2">
                {taskPromptInvariants.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="rounded-xl border border-white/10 bg-black/15 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-white/90">{snapshot.promptText}</div>
                      <div className="rounded-full border border-cyan-300/25 bg-cyan-200/10 px-2 py-0.5 text-xs text-cyan-100">
                        {snapshot.sourceKind}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      task {snapshot.taskId.slice(0, 8)} · hash {snapshot.snapshotHash.slice(0, 12)} ·{" "}
                      {new Date(snapshot.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
                {taskPromptInvariants.length === 0 ? (
                  <div className="text-sm text-white/70">
                    No task prompt/package invariants recorded for this issue yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

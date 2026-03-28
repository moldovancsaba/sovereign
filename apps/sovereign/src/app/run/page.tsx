import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { CopyCommandButton } from "@/components/CopyCommandButton";
import { RunStatusSection } from "@/components/RunStatusSection";
import { getLocalSystemStatus } from "@/lib/local-system-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Repo root from any working tree; works when your shell cwd is inside the clone. */
const CD_REPO = 'cd "$(git rev-parse --show-toplevel)"';
const CD_APP = 'cd "$(git rev-parse --show-toplevel)/apps/sovereign"';

const FLOWS: Array<{
  title: string;
  description: string;
  commands: string[];
  cwd?: string;
  notes?: string;
}> = [
  {
    title: "Start the database",
    description: "Start local Postgres (e.g. Docker or db:up).",
    commands: [CD_REPO, "npm run db:up"],
    cwd: "repo root",
    notes: "Skip if Postgres is already running."
  },
  {
    title: "Start the app",
    description: "Run the Next.js app on port 3007.",
    commands: [CD_REPO, "npm run dev"],
    cwd: "repo root",
    notes: "You are viewing this in the app when it is running."
  },
  {
    title: "Start the Nexus Bridge",
    description: "Launch the Python DAG engine and lease autority. Managed by launchd in production.",
    commands: [CD_REPO, "npm run nexus:bridge"],
    cwd: "repo root",
    notes: "Requires venv. Controlled by ~/Library/LaunchAgents/com.sovereign.nexus-bridge.plist."
  },
  {
    title: "Run the MCP backlog server",
    description: "Start the MCP server for backlog tools (stdio). MCP clients can call backlog_list_boards, backlog_list_items, backlog_create_item, etc.",
    commands: [CD_APP, "npm run mcp:backlog"],
    cwd: "apps/sovereign",
    notes: "Runs until stdin closes. Send JSON-RPC lines (e.g. {\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}) to list tools."
  },
  {
    title: "Run the MCP memory server",
    description:
      "MCP memory server: memory_search (lexical + optional semantic), memory_list_recent, memory_get; resources/list and resources/read (operator guide + sovereign-memory://memory/{id}).",
    commands: [CD_APP, "npm run mcp:memory"],
    cwd: "apps/sovereign",
    notes: "Requires DATABASE_URL and, for semantic search, Ollama + nomic-embed-text. Pass projectSessionId in tool args (from your active project session)."
  },
  {
    title: "Run the MCP docs server (runbooks)",
    description:
      "LLD-007: repo docs (doc://runbooks/…, doc://project/…) plus optional BookStack or Outline wiki (see docs/setup/WIKI_SELF_HOSTED.md).",
    commands: [CD_APP, "npm run mcp:docs"],
    cwd: "apps/sovereign",
    notes:
      "Send JSON-RPC on stdin: resources/list, resources/read. Repo: SOVEREIGN_DOCS_REPO_ROOT. Wiki: SOVEREIGN_WIKI_TYPE=bookstack|outline + creds in .env.example; URIs doc://wiki/bookstack/page/{id} or doc://wiki/outline/doc/{uuid}."
  },
  {
    title: "Run database migrations",
    description: "Apply pending Prisma migrations.",
    commands: [CD_APP, "npx prisma migrate dev"],
    cwd: "apps/sovereign"
  },
  {
    title: "Verify build",
    description: "Typecheck and build the app.",
    commands: [CD_REPO, "npm run typecheck", "npm run build"],
    cwd: "repo root"
  },
  {
    title: "Verify semantic memory stack",
    description:
      "Confirms Postgres has pgvector and Ollama returns 768-d embeddings (default nomic-embed-text).",
    commands: [CD_REPO, "npm run memory:verify"],
    cwd: "repo root",
    notes: "Requires database up and `ollama pull nomic-embed-text`. Optional: `SOVEREIGN_MEMORY_EMBED_ON_CAPTURE=1` when running the worker to store embeddings on capture."
  }
];

function CommandBlock({ commands, id }: { commands: string[]; id: string }) {
  const text = commands.join("\n");
  return (
    <div className="relative rounded-xl border border-white/15 bg-black/30 p-4 font-mono text-sm text-white/90">
      <CopyCommandButton text={text} />
      <pre id={id} className="whitespace-pre-wrap break-all pr-16">
        {commands.join("\n")}
      </pre>
    </div>
  );
}

export default async function RunPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const services = getLocalSystemStatus();
  let databaseQueryOk: boolean | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseQueryOk = true;
  } catch {
    databaseQueryOk = false;
  }

  return (
    <Shell
      title="Run"
      subtitle="Daily operator flows. Live status below; copy commands to run in your terminal."
    >
      <RunStatusSection
        services={services}
        databaseQueryOk={databaseQueryOk}
      />

      <div className="mb-6 space-y-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100/90">
        <p>
          Commands assume your terminal is inside the git clone. To jump to the repo root from anywhere:{" "}
          <code className="rounded bg-black/20 px-1">cd &quot;$(git rev-parse --show-toplevel)&quot;</code>
        </p>
        <p>
          Full details: <code className="rounded bg-black/20 px-1">docs/BUILD_AND_RUN.md</code> and{" "}
          <code className="rounded bg-black/20 px-1">docs/SETUP.md</code> in the repo.
        </p>
      </div>

      <section className="space-y-8" aria-labelledby="run-flows-heading">
        <h2
          id="run-flows-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-white/45"
        >
          Copy-paste flows
        </h2>
        {FLOWS.map((flow, i) => (
          <div key={flow.title} className="ds-card p-5" role="group" aria-label={flow.title}>
            <div className="mb-2 text-base font-semibold text-white/95">
              {flow.title}
            </div>
            <div className="mb-3 text-sm text-white/70">
              {flow.description}
              {flow.cwd ? (
                <span className="ml-1 text-white/55">(from {flow.cwd})</span>
              ) : null}
            </div>
            <CommandBlock id={`run-${i}`} commands={flow.commands} />
            {flow.notes ? (
              <div className="mt-2 text-xs text-white/55">{flow.notes}</div>
            ) : null}
          </div>
        ))}
      </section>
    </Shell>
  );
}

import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { CopyCommandButton } from "@/components/CopyCommandButton";
import { RunStatusSection } from "@/components/RunStatusSection";
import { getLocalSystemStatus } from "@/lib/local-system-status";
import { listRunningWorkers } from "@/lib/worker-process";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    commands: ["cd /Users/moldovancsaba/Projects/sovereign", "npm run db:up"],
    cwd: "repo root",
    notes: "Skip if Postgres is already running."
  },
  {
    title: "Start the app",
    description: "Run the Next.js app on port 3007.",
    commands: ["cd /Users/moldovancsaba/Projects/sovereign", "npm run dev"],
    cwd: "repo root",
    notes: "You are viewing this in the app when it is running."
  },
  {
    title: "Start the worker",
    description: "Run the control-plane worker (picks up tasks for @Controller). Run in a separate terminal.",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign",
      "npm run worker"
    ],
    cwd: "apps/sovereign",
    notes: "Requires SOVEREIGN_WORKER_AGENT_KEY (or --agent=...) for an ALPHA agent. See Agents page to start worker for a specific agent."
  },
  {
    title: "Run the MCP backlog server",
    description: "Start the MCP server for backlog tools (stdio). MCP clients can call backlog_list_boards, backlog_list_items, backlog_create_item, etc.",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign",
      "npm run mcp:backlog"
    ],
    cwd: "apps/sovereign",
    notes: "Runs until stdin closes. Send JSON-RPC lines (e.g. {\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}) to list tools."
  },
  {
    title: "Run the MCP memory server",
    description:
      "MCP memory server: memory_search (lexical + optional semantic), memory_list_recent, memory_get; resources/list and resources/read (operator guide + sovereign-memory://memory/{id}).",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign",
      "npm run mcp:memory"
    ],
    cwd: "apps/sovereign",
    notes: "Requires DATABASE_URL and, for semantic search, Ollama + nomic-embed-text. Pass projectSessionId in tool args (from your active project session)."
  },
  {
    title: "Run the MCP docs server (runbooks)",
    description:
      "LLD-007 slice: read-only MCP resources from repo docs (e.g. doc://runbooks/getting-started, doc://project/ssot-board). Optional BookStack: see docs/setup/WIKI_SELF_HOSTED.md.",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign",
      "npm run mcp:docs"
    ],
    cwd: "apps/sovereign",
    notes: "Send JSON-RPC lines on stdin: resources/list, resources/read with params.uri. Override repo root with SOVEREIGN_DOCS_REPO_ROOT if needed."
  },
  {
    title: "Run database migrations",
    description: "Apply pending Prisma migrations.",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign",
      "npx prisma migrate dev"
    ],
    cwd: "apps/sovereign"
  },
  {
    title: "Verify build",
    description: "Typecheck and build the app.",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign",
      "npm run typecheck",
      "npm run build"
    ],
    cwd: "repo root"
  },
  {
    title: "Verify semantic memory stack",
    description:
      "Confirms Postgres has pgvector and Ollama returns 768-d embeddings (default nomic-embed-text).",
    commands: [
      "cd /Users/moldovancsaba/Projects/sovereign",
      "npm run memory:verify"
    ],
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
  const workers = listRunningWorkers();
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
        workers={workers}
        databaseQueryOk={databaseQueryOk}
      />

      <div className="mb-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm text-cyan-100/90">
        Full details: <code className="rounded bg-black/20 px-1">docs/BUILD_AND_RUN.md</code> and{" "}
        <code className="rounded bg-black/20 px-1">docs/SETUP.md</code> in the repo.
      </div>

      <div className="space-y-8">
        {FLOWS.map((flow, i) => (
          <section
            key={flow.title}
            className="rounded-2xl border border-white/12 bg-white/5 p-5"
          >
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
          </section>
        ))}
      </div>
    </Shell>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  ideArchiveProjectSessionAction,
  ideGitDiffAction,
  ideOpenProjectSessionAction,
  ideHandoffAction,
  ideListAction,
  ideReadAction,
  ideRunCommandAction,
  ideSaveAction
} from "@/app/ide/actions";

type IdeNode = {
  type: "file" | "dir";
  name: string;
  relPath: string;
};

type RuntimeAgent = {
  key: string;
  runtime: string;
  controlRole: string;
};

type ProjectSession = {
  id: string;
  relPath: string;
  displayName: string;
  lastOpenedAt?: string;
};

function guessLanguage(relPath: string) {
  const ext = relPath.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx"].includes(ext)) return "typescript";
  if (["js", "jsx", "cjs", "mjs"].includes(ext)) return "javascript";
  if (ext === "py") return "python";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  if (ext === "sh") return "shell";
  if (ext === "yml" || ext === "yaml") return "yaml";
  return "plaintext";
}

export function IdeClient(props: {
  workspaceRoot: string;
  initialBase: string;
  initialNodes: IdeNode[];
  initialCommandPolicy: { cwdRelPath: string; matchedPathPrefix: string | null; allowedPrefixes: string[] };
  unsafeModeInfo: { enabled: boolean; requiredPhrase: string };
  rootProjectSession: ProjectSession;
  projectSessions: ProjectSession[];
  agents: RuntimeAgent[];
}) {
  const [cwd, setCwd] = useState(props.initialBase === "." ? "" : props.initialBase);
  const [nodes, setNodes] = useState<IdeNode[]>(props.initialNodes);
  const [allowedPrefixes, setAllowedPrefixes] = useState<string[]>(props.initialCommandPolicy.allowedPrefixes || []);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [command, setCommand] = useState("npm run build");
  const [terminalOut, setTerminalOut] = useState("");
  const [gitDiffOut, setGitDiffOut] = useState("");
  const [diffBaseline, setDiffBaseline] = useState("");
  const [showInlineDiff, setShowInlineDiff] = useState(false);
  const [status, setStatus] = useState("");
  const [projectSessions, setProjectSessions] = useState<ProjectSession[]>(props.projectSessions);
  const [activeProjectSessionId, setActiveProjectSessionId] = useState(props.rootProjectSession.id);
  const [handoffAgent, setHandoffAgent] = useState(props.agents[0]?.key || "");
  const [handoffTemplate, setHandoffTemplate] = useState<"bugfix" | "refactor" | "test">("bugfix");
  const [handoffContext, setHandoffContext] = useState("Please review and continue implementation from this file.");
  const [unsafeBypass, setUnsafeBypass] = useState(false);
  const [unsafePhrase, setUnsafePhrase] = useState("");
  const [isPending, startTransition] = useTransition();

  const canSave = useMemo(() => Boolean(selectedFile), [selectedFile]);
  const parent = cwd.includes("/") ? cwd.split("/").slice(0, -1).join("/") : "";

  function loadDir(nextRel: string) {
    startTransition(async () => {
      try {
        setStatus(`Loading: ${nextRel || "."}`);
        const fd = new FormData();
        fd.set("relPath", nextRel);
        const result = await ideListAction(fd);
        setCwd(result.base === "." ? "" : result.base);
        setNodes(result.nodes);
        setAllowedPrefixes(result.commandPolicy.allowedPrefixes);
        setStatus("Directory loaded.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function openProjectSession(nextRelPath: string, displayName?: string) {
    startTransition(async () => {
      try {
        setStatus(`Opening project session: ${nextRelPath || "."}`);
        const fd = new FormData();
        fd.set("relPath", nextRelPath);
        if (displayName) fd.set("displayName", displayName);
        const result = await ideOpenProjectSessionAction(fd);
        setActiveProjectSessionId(result.id);
        setProjectSessions((prev) => {
          const next = [
            {
              id: result.id,
              relPath: result.relPath,
              displayName: result.displayName,
              lastOpenedAt: new Date(result.lastOpenedAt).toISOString()
            },
            ...prev.filter((entry) => entry.id !== result.id)
          ];
          return next.slice(0, 12);
        });
        loadDir(result.relPath);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function archiveProjectSession(sessionId: string) {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("sessionId", sessionId);
        await ideArchiveProjectSessionAction(fd);
        const remaining = projectSessions.filter((session) => session.id !== sessionId);
        setProjectSessions(remaining);
        if (activeProjectSessionId === sessionId) {
          setActiveProjectSessionId(props.rootProjectSession.id);
          loadDir("");
        }
        setStatus("Project session archived.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function openFile(relPath: string) {
    startTransition(async () => {
      try {
        setStatus(`Opening: ${relPath}`);
        const fd = new FormData();
        fd.set("relPath", relPath);
        const result = await ideReadAction(fd);
        setSelectedFile(result.relPath);
        setFileContent(result.content);
        setShowInlineDiff(false);
        setStatus("File opened.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function saveFile() {
    if (!selectedFile) return;
    startTransition(async () => {
      try {
        setStatus(`Saving: ${selectedFile}`);
        const fd = new FormData();
        fd.set("relPath", selectedFile);
        fd.set("content", fileContent);
        await ideSaveAction(fd);
        setStatus("Saved.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function runCommand() {
    startTransition(async () => {
      try {
        setStatus("Running command...");
        const fd = new FormData();
        fd.set("command", command);
        fd.set("cwdRelPath", cwd);
        if (unsafeBypass) {
          fd.set("unsafePhrase", unsafePhrase);
        }
        const result = await ideRunCommandAction(fd);
        setTerminalOut(
          [
            `$ ${command}`,
            result.stdout ? `\n[stdout]\n${result.stdout}` : "",
            result.stderr ? `\n[stderr]\n${result.stderr}` : "",
            `\n[exit] ${result.exitCode}`
          ]
            .filter(Boolean)
            .join("\n")
        );
        setStatus("Command completed.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function loadDiff() {
    if (!selectedFile) return;
    startTransition(async () => {
      try {
        setStatus(`Loading git diff for ${selectedFile}`);
        const fd = new FormData();
        fd.set("relPath", selectedFile);
        fd.set("cwdRelPath", cwd);
        const result = await ideGitDiffAction(fd);
        if (result.stdout) {
          setGitDiffOut(result.stdout);
        } else if (result.stderr) {
          setGitDiffOut(`[stderr]\n${result.stderr}`);
        } else {
          setGitDiffOut("No git diff changes for selected file.");
        }
        setDiffBaseline(result.baseline || "");
        setShowInlineDiff(Boolean(result.baseline));
        setStatus("Diff loaded.");
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function applyTemplate(mode: "bugfix" | "refactor" | "test") {
    setHandoffTemplate(mode);
    if (!selectedFile) return;
    if (mode === "bugfix") {
      setHandoffContext(
        `Bugfix mode for ${selectedFile}: identify root cause, implement minimal fix, add/adjust regression tests, and summarize risk.`
      );
      return;
    }
    if (mode === "refactor") {
      setHandoffContext(
        `Refactor mode for ${selectedFile}: improve structure/readability without behavior changes, preserve interfaces, and report any residual technical debt.`
      );
      return;
    }
    setHandoffContext(
      `Test mode for ${selectedFile}: add or improve tests around current behavior and edge cases, ensure they pass, and report coverage gaps.`
    );
  }

  function handoffToAgent() {
    if (!selectedFile || !handoffAgent) return;
    startTransition(async () => {
      try {
        setStatus(`Queueing handoff to @${handoffAgent}...`);
        const fd = new FormData();
        fd.set("agentKey", handoffAgent);
        fd.set("relPath", selectedFile);
        fd.set("cwdRelPath", cwd);
        fd.set("context", handoffContext);
        const result = await ideHandoffAction(fd);
        setStatus(`Handoff queued. Task: ${result.taskId} (${result.status})`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="rounded-2xl border border-white/12 bg-black/25 p-3">
        <div className="mb-2 text-xs text-white/60">Workspace: {props.workspaceRoot}</div>
        <div className="mb-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/80">
            Project Sessions
          </div>
          <div className="mb-2 text-xs text-white/65">
            Register folders as durable local project sessions so chat, tasks, and tool execution can share the same workspace identity.
          </div>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => openProjectSession(cwd, cwd ? cwd.split("/").pop() : "workspace")}
              className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs hover:bg-cyan-300/20"
            >
              Open Current Folder As Session
            </button>
          </div>
          <div className="space-y-1">
            {projectSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between rounded-lg border px-2 py-1 text-xs ${
                  activeProjectSessionId === session.id
                    ? "border-cyan-300/40 bg-cyan-300/15"
                    : "border-white/10 bg-black/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveProjectSessionId(session.id);
                    loadDir(session.relPath);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate font-medium text-white">{session.displayName}</div>
                  <div className="truncate text-white/55">{session.relPath || "."}</div>
                </button>
                {session.id !== props.rootProjectSession.id ? (
                  <button
                    type="button"
                    onClick={() => archiveProjectSession(session.id)}
                    className="ml-2 rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadDir("")}
            className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
          >
            Root
          </button>
          <button
            type="button"
            onClick={() => loadDir(parent)}
            className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
          >
            Up
          </button>
          <div className="truncate text-xs text-white/70">{cwd || "."}</div>
        </div>
        <div className="max-h-[72vh] overflow-auto rounded-xl border border-white/10 bg-black/30 p-2">
          {nodes.map((node) => (
            <button
              key={`${node.type}:${node.relPath}`}
              type="button"
              onClick={() => (node.type === "dir" ? loadDir(node.relPath) : openFile(node.relPath))}
              className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-white/10"
            >
              <span className="text-xs text-white/60">{node.type === "dir" ? "DIR" : "FILE"}</span>
              <span className="truncate">{node.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Editor (Monaco)</div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canSave || isPending}
                onClick={loadDiff}
                className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs disabled:opacity-50"
              >
                Git diff
              </button>
              <button
                type="button"
                disabled={!canSave || isPending}
                onClick={saveFile}
                className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
          <div className="mb-2 text-xs text-white/60">{selectedFile || "No file selected"}</div>
          <Editor
            height="46vh"
            language={guessLanguage(selectedFile)}
            theme="vs-dark"
            value={fileContent}
            onChange={(value) => setFileContent(value || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true
            }}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="mb-2 text-sm font-semibold">Git Diff</div>
            {showInlineDiff ? (
              <div className="mb-2 rounded border border-white/10 bg-black/30 p-2 text-xs text-white/70">
                Side-by-side diff view is enabled below.
              </div>
            ) : null}
            <pre className="max-h-[24vh] overflow-auto rounded-lg border border-white/15 bg-black/50 p-3 text-xs text-white/85">
              {gitDiffOut || "Click Git diff after selecting a file."}
            </pre>
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="mb-2 text-sm font-semibold">Agent Handoff</div>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => applyTemplate("bugfix")}
                className={`rounded-md border px-2 py-1 text-xs ${handoffTemplate === "bugfix" ? "border-emerald-300/40 bg-emerald-300/15" : "border-white/20 bg-black/30"}`}
              >
                Bugfix
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("refactor")}
                className={`rounded-md border px-2 py-1 text-xs ${handoffTemplate === "refactor" ? "border-cyan-300/40 bg-cyan-300/15" : "border-white/20 bg-black/30"}`}
              >
                Refactor
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("test")}
                className={`rounded-md border px-2 py-1 text-xs ${handoffTemplate === "test" ? "border-amber-300/40 bg-amber-300/15" : "border-white/20 bg-black/30"}`}
              >
                Test
              </button>
            </div>
            <div className="mb-2 flex gap-2">
              <select
                value={handoffAgent}
                onChange={(e) => setHandoffAgent(e.target.value)}
                className="w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-xs"
              >
                {props.agents.map((agent) => (
                  <option key={agent.key} value={agent.key}>
                    @{agent.key} ({agent.runtime}/{agent.controlRole})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handoffToAgent}
                disabled={!selectedFile || !handoffAgent || isPending}
                className="rounded-md border border-violet-300/30 bg-violet-300/10 px-3 py-2 text-xs disabled:opacity-50"
              >
                Queue
              </button>
            </div>
            <textarea
              value={handoffContext}
              onChange={(e) => setHandoffContext(e.target.value)}
              className="h-[16vh] w-full rounded-lg border border-white/15 bg-black/40 p-3 text-xs"
            />
          </div>
        </div>

        {showInlineDiff ? (
          <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
            <div className="mb-2 text-sm font-semibold">Inline Diff (HEAD vs working copy)</div>
            <DiffEditor
              height="34vh"
              language={guessLanguage(selectedFile)}
              theme="vs-dark"
              original={diffBaseline}
              modified={fileContent}
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                automaticLayout: true
              }}
            />
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/12 bg-black/25 p-3">
          <div className="mb-2 text-sm font-semibold">Terminal</div>
          <div className="mb-2 flex gap-2">
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={runCommand}
              disabled={isPending}
              className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs disabled:opacity-50"
            >
              Run
            </button>
          </div>
          <div className="mb-2 rounded border border-rose-300/25 bg-rose-300/10 p-2 text-[11px] text-rose-100">
            Unsafe full-access bypass: {props.unsafeModeInfo.enabled ? "ENABLED (env)" : "DISABLED (env)"}
            {props.unsafeModeInfo.enabled ? (
              <div className="mt-1 text-rose-200/90">
                Required phrase: <span className="font-mono">{props.unsafeModeInfo.requiredPhrase}</span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={unsafeBypass}
                onChange={(e) => setUnsafeBypass(e.target.checked)}
                disabled={!props.unsafeModeInfo.enabled}
              />
              <span>Use unsafe bypass for this command</span>
            </div>
            {unsafeBypass ? (
              <input
                value={unsafePhrase}
                onChange={(e) => setUnsafePhrase(e.target.value)}
                placeholder="Enter required confirmation phrase"
                className="mt-2 w-full rounded border border-rose-200/30 bg-black/40 px-2 py-1 text-[11px]"
              />
            ) : null}
          </div>
          <pre className="max-h-[24vh] overflow-auto rounded-lg border border-white/15 bg-black/50 p-3 text-xs text-white/85">
            {terminalOut || "No output yet."}
          </pre>
        </div>

        <div className="rounded-2xl border border-white/12 bg-black/25 p-2 text-xs text-white/70">
          {isPending ? "Working..." : status || "Ready."}
          {allowedPrefixes.length ? (
            <div className="mt-1 text-[11px] text-white/55">
              Allowed command prefixes for this folder: {allowedPrefixes.join(", ")}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { getIdeWorkspaceRoot, listIdeTree } from "@/lib/ide";
import { IdeClient } from "@/app/ide/IdeClient";
import { prisma } from "@/lib/prisma";
import { getIdeUnsafeModeInfo } from "@/lib/ide";
import { getOrCreateProjectSession, listRecentProjectSessions } from "@/lib/project-sessions";

export default async function IdePage() {
  const session = await requireSession();
  if (!session) redirect("/signin");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;

  const workspaceRoot = getIdeWorkspaceRoot();
  const [initial, agents, unsafeModeInfo, rootProjectSession, projectSessions] = await Promise.all([
    listIdeTree(""),
    prisma.agent.findMany({
      where: { enabled: true, runtime: { not: "MANUAL" } },
      select: { key: true, runtime: true, controlRole: true },
      orderBy: { key: "asc" }
    }),
    getIdeUnsafeModeInfo(),
    getOrCreateProjectSession({
      relPath: "",
      displayName: "workspace",
      createdById: userId ?? null,
      metadata: { source: "ide_page_boot" }
    }),
    listRecentProjectSessions()
  ]);

  return (
    <Shell
      title="IDE"
      subtitle="In-app file explorer, editor, and command runner"
    >
      <IdeClient
        workspaceRoot={workspaceRoot}
        initialBase={initial.base}
        initialNodes={initial.nodes}
        initialCommandPolicy={initial.commandPolicy}
        unsafeModeInfo={unsafeModeInfo}
        rootProjectSession={{
          id: rootProjectSession.id,
          relPath: rootProjectSession.relPath,
          displayName: rootProjectSession.displayName
        }}
        projectSessions={projectSessions.map((session) => ({
          id: session.id,
          relPath: session.relPath,
          displayName: session.displayName,
          lastOpenedAt: session.lastOpenedAt.toISOString()
        }))}
        agents={agents.map((a) => ({
          key: a.key,
          runtime: a.runtime,
          controlRole: a.controlRole
        }))}
      />
    </Shell>
  );
}

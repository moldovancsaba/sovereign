import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class AgentGroupError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "AgentGroupError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalize(input: unknown) {
  return String(input ?? "").trim();
}

export async function listAgentGroups() {
  return prisma.$queryRaw<
    Array<{
      id: string;
      key: string;
      displayName: string;
      description: string | null;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  >(Prisma.sql`SELECT * FROM "AgentGroup" ORDER BY "createdAt" DESC`);
}

export async function createAgentGroup(params: { key: string; displayName: string; description?: string }) {
  const key = normalize(params.key);
  const displayName = normalize(params.displayName);
  const description = normalize(params.description || "") || null;
  if (!key) throw new AgentGroupError("key is required.", 400, "invalid_group_key");
  if (!displayName) throw new AgentGroupError("displayName is required.", 400, "invalid_group_name");
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "AgentGroup" WHERE "key" = ${key} LIMIT 1`
  );
  if (existing.length) {
    throw new AgentGroupError(`Agent group key "${key}" already exists.`, 409, "group_key_conflict");
  }
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      key: string;
      displayName: string;
      description: string | null;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  >(
    Prisma.sql`
      INSERT INTO "AgentGroup" ("id", "key", "displayName", "description", "active", "updatedAt")
      VALUES (${`ag_${randomUUID()}`}, ${key}, ${displayName}, ${description}, true, NOW())
      RETURNING *
    `
  );
  return rows[0];
}

async function getChildGroupIds(groupId: string) {
  const rows = await prisma.$queryRaw<Array<{ memberGroupId: string | null }>>(
    Prisma.sql`
      SELECT "memberGroupId"
      FROM "AgentGroupMember"
      WHERE "groupId" = ${groupId}
      AND "memberType" = 'GROUP'
      AND "memberGroupId" IS NOT NULL
    `
  );
  return rows.map((row) => row.memberGroupId).filter((v): v is string => Boolean(v));
}

async function wouldCreateCycle(params: { targetGroupId: string; candidateChildGroupId: string }) {
  if (params.targetGroupId === params.candidateChildGroupId) return true;
  const seen = new Set<string>();
  const stack = [params.candidateChildGroupId];
  while (stack.length) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (current === params.targetGroupId) return true;
    const children = await getChildGroupIds(current);
    for (const child of children) {
      if (!seen.has(child)) stack.push(child);
    }
  }
  return false;
}

export async function addAgentGroupMember(params: {
  groupKey: string;
  memberType: "AGENT" | "GROUP";
  memberAgentKey?: string;
  memberGroupKey?: string;
  role?: string;
}) {
  const groupKey = normalize(params.groupKey);
  const role = normalize(params.role || "") || null;
  const groups = await prisma.$queryRaw<Array<{ id: string; key: string }>>(
    Prisma.sql`SELECT "id", "key" FROM "AgentGroup" WHERE "key" = ${groupKey} LIMIT 1`
  );
  const group = groups[0];
  if (!group) throw new AgentGroupError(`Unknown group "${groupKey}".`, 404, "group_not_found");

  let memberAgentKey: string | null = null;
  let memberGroupId: string | null = null;
  if (params.memberType === "AGENT") {
    memberAgentKey = normalize(params.memberAgentKey);
    if (!memberAgentKey) {
      throw new AgentGroupError("memberAgentKey is required for AGENT memberType.", 400, "invalid_member");
    }
    const agent = await prisma.agent.findFirst({
      where: { key: { equals: memberAgentKey, mode: "insensitive" } },
      select: { key: true }
    });
    if (!agent) throw new AgentGroupError(`Unknown agent "${memberAgentKey}".`, 404, "agent_not_found");
    memberAgentKey = agent.key;
  } else {
    const memberGroupKey = normalize(params.memberGroupKey);
    if (!memberGroupKey) {
      throw new AgentGroupError("memberGroupKey is required for GROUP memberType.", 400, "invalid_member");
    }
    const rows = await prisma.$queryRaw<Array<{ id: string; key: string }>>(
      Prisma.sql`SELECT "id", "key" FROM "AgentGroup" WHERE "key" = ${memberGroupKey} LIMIT 1`
    );
    const child = rows[0];
    if (!child) throw new AgentGroupError(`Unknown group "${memberGroupKey}".`, 404, "member_group_not_found");
    const cycle = await wouldCreateCycle({ targetGroupId: group.id, candidateChildGroupId: child.id });
    if (cycle) {
      throw new AgentGroupError("Nested group link would create a cycle.", 409, "group_cycle_blocked");
    }
    memberGroupId = child.id;
  }

  const duplicate = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "AgentGroupMember"
      WHERE "groupId" = ${group.id}
        AND "memberType" = ${params.memberType}
        AND COALESCE("memberAgentKey",'') = COALESCE(${memberAgentKey},'')
        AND COALESCE("memberGroupId",'') = COALESCE(${memberGroupId},'')
      LIMIT 1
    `
  );
  if (duplicate.length) {
    throw new AgentGroupError("Member already exists in group.", 409, "duplicate_member");
  }

  const inserted = await prisma.$queryRaw<
    Array<{
      id: string;
      groupId: string;
      memberType: string;
      memberAgentKey: string | null;
      memberGroupId: string | null;
      role: string | null;
      createdAt: Date;
    }>
  >(
    Prisma.sql`
      INSERT INTO "AgentGroupMember"
      ("id", "groupId", "memberType", "memberAgentKey", "memberGroupId", "role")
      VALUES (${`agm_${randomUUID()}`}, ${group.id}, ${params.memberType}, ${memberAgentKey}, ${memberGroupId}, ${role})
      RETURNING *
    `
  );
  return inserted[0];
}

export async function listAgentGroupMembers(groupKey: string) {
  const key = normalize(groupKey);
  const groups = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "AgentGroup" WHERE "key" = ${key} LIMIT 1`
  );
  const group = groups[0];
  if (!group) throw new AgentGroupError(`Unknown group "${key}".`, 404, "group_not_found");
  return prisma.$queryRaw<
    Array<{
      id: string;
      memberType: string;
      memberAgentKey: string | null;
      memberGroupId: string | null;
      role: string | null;
      createdAt: Date;
    }>
  >(
    Prisma.sql`
      SELECT "id", "memberType", "memberAgentKey", "memberGroupId", "role", "createdAt"
      FROM "AgentGroupMember"
      WHERE "groupId" = ${group.id}
      ORDER BY "createdAt" ASC
    `
  );
}

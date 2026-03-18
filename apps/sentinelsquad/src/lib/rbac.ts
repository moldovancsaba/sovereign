import type { Prisma } from "@prisma/client";
import { getAppSession } from "@/lib/app-session";
import { prisma } from "@/lib/prisma";

export type SentinelSquadUserRole = "ADMIN" | "OPERATOR" | "VIEWER" | "CLIENT";

export const SENTINELSQUAD_USER_ROLES: SentinelSquadUserRole[] = [
  "ADMIN",
  "OPERATOR",
  "VIEWER",
  "CLIENT"
];

type RequireRbacAccessOptions = {
  action: string;
  allowedRoles: SentinelSquadUserRole[];
  entityType?: string;
  entityId?: string | null;
  metadata?: Prisma.JsonObject;
};

type RbacAuthContext = {
  userId: string | null;
  userEmail: string | null;
  role: SentinelSquadUserRole;
};

function normalizeRole(input: string | null | undefined): SentinelSquadUserRole | null {
  const value = String(input || "")
    .trim()
    .toUpperCase();
  if (!value) return null;
  if (SENTINELSQUAD_USER_ROLES.includes(value as SentinelSquadUserRole)) {
    return value as SentinelSquadUserRole;
  }
  return null;
}

function parseEmailList(raw: string | undefined): Set<string> {
  const emails = String(raw || "")
    .split(/[,\n; ]+/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

function resolveRoleFromEmail(email: string | null): SentinelSquadUserRole | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const adminEmails = parseEmailList(process.env.SENTINELSQUAD_RBAC_ADMIN_EMAILS);
  if (adminEmails.has(normalized)) return "ADMIN";

  const operatorEmails = parseEmailList(process.env.SENTINELSQUAD_RBAC_OPERATOR_EMAILS);
  if (operatorEmails.has(normalized)) return "OPERATOR";

  const viewerEmails = parseEmailList(process.env.SENTINELSQUAD_RBAC_VIEWER_EMAILS);
  if (viewerEmails.has(normalized)) return "VIEWER";

  const clientEmails = parseEmailList(process.env.SENTINELSQUAD_RBAC_CLIENT_EMAILS);
  if (clientEmails.has(normalized)) return "CLIENT";

  return null;
}

function resolveDefaultRole(): SentinelSquadUserRole {
  return normalizeRole(process.env.SENTINELSQUAD_RBAC_DEFAULT_ROLE) || "OPERATOR";
}

export function resolveSentinelSquadUserRole(email: string | null): SentinelSquadUserRole {
  return resolveRoleFromEmail(email) || resolveDefaultRole();
}

function formatAllowedRoles(roles: SentinelSquadUserRole[]) {
  return roles.join(", ");
}

async function recordRbacAuditEvent(input: {
  action: string;
  role: SentinelSquadUserRole;
  allowed: boolean;
  reason: string;
  userId: string | null;
  userEmail: string | null;
  allowedRoles: SentinelSquadUserRole[];
  entityType?: string;
  entityId?: string | null;
  metadata?: Prisma.JsonObject;
}) {
  const metadata: Prisma.JsonObject = {
    userId: input.userId,
    userEmail: input.userEmail,
    role: input.role,
    allowedRoles: input.allowedRoles,
    ...(input.metadata || {})
  };

  await prisma.lifecycleAuditEvent.create({
    data: {
      entityType: input.entityType || "RBAC",
      entityId: input.entityId || null,
      actorRole: `RBAC_${input.role}`,
      action: input.action,
      fromState: null,
      toState: null,
      allowed: input.allowed,
      reason: input.reason,
      metadata
    }
  });
}

export async function requireRbacAccess(
  options: RequireRbacAccessOptions
): Promise<RbacAuthContext> {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = ((session.user as any).id as string | undefined) || null;
  const userEmail = session.user.email ? String(session.user.email).trim().toLowerCase() : null;
  const role = resolveSentinelSquadUserRole(userEmail);
  const allowed = options.allowedRoles.includes(role);

  const reason = allowed
    ? `RBAC allow: role ${role} authorized for ${options.action}.`
    : `Access denied: role ${role} cannot perform ${options.action}. Required roles: ${formatAllowedRoles(
        options.allowedRoles
      )}.`;

  await recordRbacAuditEvent({
    action: options.action,
    role,
    allowed,
    reason,
    userId,
    userEmail,
    allowedRoles: options.allowedRoles,
    entityType: options.entityType,
    entityId: options.entityId || userId,
    metadata: options.metadata
  });

  if (!allowed) {
    throw new Error(reason);
  }

  return { userId, userEmail, role };
}

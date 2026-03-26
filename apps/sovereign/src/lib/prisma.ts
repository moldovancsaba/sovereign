import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function normalizeDatabaseUrl(input: string | undefined) {
  const raw = String(input || "").trim();
  if (!raw) return undefined;
  // Harden local docker connectivity: Prisma/Postgres can fail with localhost in some host setups.
  return raw.replace(/@localhost:/i, "@127.0.0.1:");
}

const normalizedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const prismaDatasourceUrl = normalizedDatabaseUrl || process.env.DATABASE_URL;

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    datasources: prismaDatasourceUrl ? { db: { url: prismaDatasourceUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;

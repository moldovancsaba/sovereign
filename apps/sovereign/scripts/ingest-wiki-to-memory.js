#!/usr/bin/env node
/**
 * Ingest wiki page(s) into ProjectMemory (LLD-007). BookStack or Outline via SOVEREIGN_WIKI_TYPE.
 *
 * Single page:
 *   node scripts/ingest-wiki-to-memory.js --page-id=<id> --project-session-id=<cuid> [--dry-run]
 *
 * Batch (first N pages from wiki list; skips rows that already exist for same sourceUrl + session):
 *   node scripts/ingest-wiki-to-memory.js --batch --project-session-id=<cuid> [--batch-limit=25] [--dry-run]
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");
const wikiAdapter = require("./lib/wiki-adapter");

const prisma = new PrismaClient();

function parseArgs(argv) {
  let pageId = null;
  let projectSessionId = null;
  let dryRun = false;
  let batch = false;
  let batchLimit = 25;
  for (const a of argv) {
    if (a.startsWith("--page-id=")) pageId = a.slice("--page-id=".length).trim();
    if (a.startsWith("--project-session-id=")) {
      projectSessionId = a.slice("--project-session-id=".length).trim();
    }
    if (a === "--dry-run") dryRun = true;
    if (a === "--batch") batch = true;
    if (a.startsWith("--batch-limit=")) {
      batchLimit = Math.min(200, Math.max(1, Number(a.slice("--batch-limit=".length)) || 25));
    }
  }
  return { pageId, projectSessionId, dryRun, batch, batchLimit };
}

function compactSummary(text, max = 240) {
  const n = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (n.length <= max) return n;
  return `${n.slice(0, max - 3).trimEnd()}...`;
}

async function ensureSession(projectSessionId) {
  const session = await prisma.projectSession.findUnique({
    where: { id: projectSessionId },
    select: { id: true }
  });
  if (!session) {
    console.error(`Unknown projectSessionId: ${projectSessionId}`);
    process.exit(1);
  }
}

async function ingestOne(pageId, projectSessionId, dryRun, wikiKind) {
  const page = await wikiAdapter.readPageForIngest(pageId);
  const summary = compactSummary(page.text, 240);
  const maxContent = 20000;
  const content =
    page.text.length > maxContent ? `${page.text.slice(0, maxContent)}\n\n…(truncated)` : page.text;

  const sourceKind = wikiKind === "outline" ? "outline" : "bookstack";
  const tags = ["wiki", sourceKind, `page:${page.pageId}`];

  if (dryRun) {
    return {
      dryRun: true,
      title: page.title,
      sourceUrl: page.sourceUrl,
      summaryLength: summary.length,
      contentLength: content.length
    };
  }

  const row = await prisma.projectMemory.create({
    data: {
      projectSessionId,
      title: page.title.slice(0, 500),
      summary,
      content,
      tags,
      status: "CAPTURED",
      kind: "PO_PRODUCT",
      sourceKind,
      sourceUrl: page.sourceUrl.slice(0, 2000)
    }
  });
  return { projectMemoryId: row.id, sourceUrl: page.sourceUrl };
}

async function main() {
  const { pageId, projectSessionId, dryRun, batch, batchLimit } = parseArgs(process.argv.slice(2));

  if (!projectSessionId) {
    console.error(
      "Usage:\n" +
        "  Single: node scripts/ingest-wiki-to-memory.js --page-id=<id> --project-session-id=<cuid> [--dry-run]\n" +
        "  Batch:  node scripts/ingest-wiki-to-memory.js --batch --project-session-id=<cuid> [--batch-limit=25] [--dry-run]"
    );
    process.exit(1);
  }

  const wikiKind = wikiAdapter.getWikiKind();
  if (!wikiKind) {
    console.error(
      "Wiki not configured. Set SOVEREIGN_WIKI_TYPE=bookstack or outline and matching credentials (see apps/sovereign/.env.example)."
    );
    process.exit(1);
  }

  if (batch) {
    const items = await wikiAdapter.listPagesForBatchIngest();
    const slice = items.slice(0, batchLimit);
    if (!dryRun) await ensureSession(projectSessionId);

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const item of slice) {
      try {
        const page = await wikiAdapter.readPageForIngest(item.id);
        if (!dryRun) {
          const dupe = await prisma.projectMemory.findFirst({
            where: { projectSessionId, sourceUrl: page.sourceUrl.slice(0, 2000) }
          });
          if (dupe) {
            skipped += 1;
            continue;
          }
        }
        const summary = compactSummary(page.text, 240);
        const maxContent = 20000;
        const content =
          page.text.length > maxContent ? `${page.text.slice(0, maxContent)}\n\n…(truncated)` : page.text;
        const sourceKind = wikiKind === "outline" ? "outline" : "bookstack";
        const tags = ["wiki", sourceKind, `page:${page.pageId}`];

        if (dryRun) {
          created += 1;
          continue;
        }

        await prisma.projectMemory.create({
          data: {
            projectSessionId,
            title: page.title.slice(0, 500),
            summary,
            content,
            tags,
            status: "CAPTURED",
            kind: "PO_PRODUCT",
            sourceKind,
            sourceUrl: page.sourceUrl.slice(0, 2000)
          }
        });
        created += 1;
      } catch (err) {
        errors.push({ id: item.id, message: String(err?.message || err) });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          batch: true,
          wikiKind,
          dryRun,
          listed: items.length,
          processed: slice.length,
          created: dryRun ? undefined : created,
          wouldCreate: dryRun ? created : undefined,
          skipped,
          errors: errors.length ? errors : undefined
        },
        null,
        2
      )
    );
    return;
  }

  if (!pageId) {
    console.error(
      "Missing --page-id (or use --batch). See --help in script header or apps/sovereign/package.json scripts."
    );
    process.exit(1);
  }

  if (!dryRun) await ensureSession(projectSessionId);
  const result = await ingestOne(pageId, projectSessionId, dryRun, wikiKind);
  console.log(JSON.stringify({ ok: true, wikiKind, ...result }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

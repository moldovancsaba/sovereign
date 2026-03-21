/**
 * Dispatches wiki operations by SOVEREIGN_WIKI_TYPE (bookstack | outline).
 */
"use strict";

const bookstack = require("./wiki-bookstack");
const outline = require("./wiki-outline");

function getWikiKind() {
  const raw = String(process.env.SOVEREIGN_WIKI_TYPE || "").trim().toLowerCase();

  if (raw === "outline") {
    return outline.isOutlineConfigured() ? "outline" : null;
  }

  if (raw === "bookstack") {
    return bookstack.isBookStackConfigured() ? "bookstack" : null;
  }

  if (bookstack.isBookStackConfigured()) return "bookstack";
  if (outline.isOutlineConfigured()) return "outline";
  return null;
}

function isWikiConfigured() {
  return Boolean(getWikiKind());
}

/** @returns {Promise<Array<{ uri: string; name: string; title: string; mimeType: string; description: string }>>} */
async function listWikiResourcesForMcp() {
  const kind = getWikiKind();
  if (!kind) return [];
  if (kind === "bookstack") {
    const pages = await bookstack.listPages();
    return pages
      .filter((p) => p.id != null)
      .map((p) => ({
        uri: `doc://wiki/bookstack/page/${p.id}`,
        name: `wiki-bs-${p.id}`,
        title: p.name || `BookStack page ${p.id}`,
        mimeType: "text/markdown",
        description: `BookStack page id ${p.id}${p.book_id != null ? ` (book ${p.book_id})` : ""}`
      }));
  }
  const docs = await outline.listDocuments();
  return docs.map((d) => ({
    uri: `doc://wiki/outline/doc/${d.id}`,
    name: `wiki-ol-${d.id}`,
    title: d.title || `Outline doc ${d.id}`,
    mimeType: "text/markdown",
    description: `Outline document ${d.id}`
  }));
}

/**
 * @param {string} uri
 * @returns {Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | { _badUri?: boolean; _wikiError?: boolean; uri?: string; message?: string }>}
 */
async function readWikiResourceForMcp(uri) {
  const u = String(uri || "").trim();
  const bs = /^doc:\/\/wiki\/bookstack\/page\/(\d+)$/i.exec(u);
  if (bs) {
    if (!bookstack.isBookStackConfigured()) {
      return { _badUri: true, uri: u };
    }
    try {
      const { title, text, mimeType } = await bookstack.readPageBodyForMcp(bs[1]);
      return {
        contents: [{ uri: u, mimeType, text: text || `_(empty page: ${title})_` }]
      };
    } catch (err) {
      return { _wikiError: true, uri: u, message: String(err?.message || err) };
    }
  }
  const ol = /^doc:\/\/wiki\/outline\/doc\/([0-9a-f-]{36})$/i.exec(u);
  if (ol) {
    if (!outline.isOutlineConfigured()) {
      return { _badUri: true, uri: u };
    }
    try {
      const { title, text, mimeType } = await outline.readDocumentBodyForMcp(ol[1]);
      return {
        contents: [{ uri: u, mimeType, text: text || `_(empty: ${title})_` }]
      };
    } catch (err) {
      return { _wikiError: true, uri: u, message: String(err?.message || err) };
    }
  }
  return { _badUri: true, uri: u };
}

async function readPageForIngest(pageId) {
  const kind = getWikiKind();
  if (kind === "bookstack") {
    return bookstack.readPageForIngest(pageId);
  }
  if (kind === "outline") {
    return outline.readDocumentForIngest(pageId);
  }
  throw new Error(
    "Wiki not configured. Set SOVEREIGN_WIKI_TYPE=bookstack|outline and matching credentials (see .env.example)."
  );
}

/** @returns {Promise<Array<{ id: string; title?: string }>>} */
async function listPagesForBatchIngest() {
  const kind = getWikiKind();
  if (kind === "bookstack") {
    const pages = await bookstack.listPages();
    return pages
      .filter((p) => p.id != null)
      .map((p) => ({ id: String(p.id), title: p.name }));
  }
  if (kind === "outline") {
    const docs = await outline.listDocuments();
    return docs.map((d) => ({ id: d.id, title: d.title }));
  }
  return [];
}

module.exports = {
  getWikiKind,
  isWikiConfigured,
  listWikiResourcesForMcp,
  readWikiResourceForMcp,
  readPageForIngest,
  listPagesForBatchIngest
};

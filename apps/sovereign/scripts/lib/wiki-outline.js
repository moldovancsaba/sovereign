/**
 * Outline (getoutline.com) API helpers (LLD-007).
 * RPC-style POST /api/{method} with JSON body.
 *
 * Env: SOVEREIGN_WIKI_TYPE=outline, SOVEREIGN_WIKI_BASE_URL, SOVEREIGN_WIKI_API_KEY
 * Optional: SOVEREIGN_WIKI_MCP_PAGE_LIMIT (default 60, max 100 for Outline list)
 */
"use strict";

function getOutlineConfig() {
  const baseUrl = String(process.env.SOVEREIGN_WIKI_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const apiKey = String(process.env.SOVEREIGN_WIKI_API_KEY || "").trim();
  const wikiType = String(process.env.SOVEREIGN_WIKI_TYPE || "bookstack")
    .trim()
    .toLowerCase();
  if (wikiType !== "outline") return null;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function isOutlineConfigured() {
  return Boolean(getOutlineConfig());
}

/**
 * @param {ReturnType<getOutlineConfig>} config
 * @param {string} method e.g. documents.list
 * @param {Record<string, unknown>} body
 */
async function outlineRpc(config, method, body) {
  const url = `${config.baseUrl}/api/${method}`;
  const payload = { ...body };
  if (process.env.SOVEREIGN_WIKI_OUTLINE_TOKEN_IN_BODY === "1") {
    payload.token = config.apiKey;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      // Prefer API payloads that include markdown `text` (not only ProseMirror `data`).
      "x-api-version": "1"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Outline ${method} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Outline ${method}: expected JSON`);
  }
}

/**
 * @param {{ limit?: number; offset?: number }} opts
 * @returns {Promise<Array<{ id: string; title?: string }>>}
 */
async function listDocuments(opts = {}) {
  const c = getOutlineConfig();
  if (!c) return [];
  const rawLimit =
    opts.limit != null ? opts.limit : process.env.SOVEREIGN_WIKI_MCP_PAGE_LIMIT;
  const limit = Math.min(Math.max(Number(rawLimit) || 60, 1), 100);
  const offset = Math.max(0, Number(opts.offset) || 0);
  const result = await outlineRpc(c, "documents.list", {
    limit,
    offset,
    sort: "updatedAt",
    direction: "DESC"
  });
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .map((row) => ({
      id: row.id != null ? String(row.id) : "",
      title: typeof row.title === "string" ? row.title : undefined
    }))
    .filter((row) => row.id);
}

/**
 * @param {string} documentId
 * @returns {Promise<{ title: string; text: string; mimeType: string }>}
 */
async function readDocumentBodyForMcp(documentId) {
  const c = getOutlineConfig();
  if (!c) throw new Error("Outline not configured (SOVEREIGN_WIKI_TYPE=outline, BASE_URL, API_KEY)");
  const id = String(documentId).trim();
  const result = await outlineRpc(c, "documents.info", { id });
  const doc =
    result.data && typeof result.data === "object" && result.data.document
      ? result.data.document
      : result.data;
  if (!doc || typeof doc !== "object") {
    throw new Error("Outline documents.info: missing data");
  }
  const title = typeof doc.title === "string" ? doc.title : `Document ${id}`;
  const text =
    typeof doc.text === "string" && doc.text.trim()
      ? doc.text
      : typeof doc.data === "object"
        ? JSON.stringify(doc.data, null, 2)
        : "";
  const mimeType =
    typeof doc.text === "string" && doc.text.trim() ? "text/markdown" : "application/json";
  return { title, text: text || `_(empty: ${title})_`, mimeType };
}

/**
 * @param {string} documentId
 * @returns {Promise<{ title: string; text: string; sourceUrl: string; pageId: string }>}
 */
async function readDocumentForIngest(documentId) {
  const c = getOutlineConfig();
  if (!c) throw new Error("Outline not configured");
  const id = String(documentId).trim();
  const result = await outlineRpc(c, "documents.info", { id });
  const doc =
    result.data && typeof result.data === "object" && result.data.document
      ? result.data.document
      : result.data;
  if (!doc || typeof doc !== "object") {
    throw new Error("Outline documents.info: missing data");
  }
  const title = typeof doc.title === "string" ? doc.title : `Document ${id}`;
  const text =
    typeof doc.text === "string"
      ? doc.text
      : typeof doc.data === "object"
        ? JSON.stringify(doc.data, null, 2)
        : "";
  const path = typeof doc.url === "string" ? doc.url : `/doc/${id}`;
  const sourceUrl = path.startsWith("http") ? path : `${c.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  return { title, text, sourceUrl, pageId: id };
}

module.exports = {
  getOutlineConfig,
  isOutlineConfigured,
  listDocuments,
  readDocumentBodyForMcp,
  readDocumentForIngest
};

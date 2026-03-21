function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeByTargetAndCommand(handoffs) {
  const out = [];
  const seen = new Set();
  for (const handoff of handoffs) {
    const target = normalizeLower(handoff?.target);
    const command = normalizeText(handoff?.command);
    if (!target || !command) continue;
    const key = `${target}::${command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      target: handoff.target,
      command,
      rawMention: normalizeText(handoff.rawMention) || command,
      routeMode: normalizeText(handoff.routeMode) || "EXPLICIT_AT"
    });
  }
  return out;
}

function parseExplicitHandoffs(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("@")) continue;
    const m = /^@([A-Za-z0-9_-]+)\s+([\s\S]+)$/.exec(trimmed);
    if (!m) continue;
    out.push({
      target: m[1],
      command: m[2].trim(),
      rawMention: trimmed,
      routeMode: "EXPLICIT_AT"
    });
  }

  return out.filter((h) => h.command.length > 0);
}

function buildKnownAgentAliases(knownAgents, requestedByAgent) {
  const sourceAgent = normalizeLower(requestedByAgent);
  const aliases = [];
  const source = Array.isArray(knownAgents) ? knownAgents : [];
  const seen = new Set();

  for (const agent of source) {
    const key = normalizeText(agent?.key);
    if (!key) continue;
    const keyLower = key.toLowerCase();
    if (keyLower === sourceAgent) continue;
    if (seen.has(keyLower)) continue;
    seen.add(keyLower);
    const names = [key];
    const displayName = normalizeText(agent?.displayName);
    if (displayName && displayName.toLowerCase() !== keyLower) {
      names.push(displayName);
    }
    aliases.push({
      key,
      keyLower,
      names
    });
  }

  return aliases.sort((a, b) => a.key.localeCompare(b.key));
}

function hasDelegationCue(sentence, alias) {
  const escaped = alias.names.map((name) => escapeRegex(name));
  const namePattern = escaped.join("|");
  if (!namePattern) return false;
  const cueRegex = new RegExp(
    String.raw`\b(?:contact|ask|discuss|coordinate|sync|handoff|delegate|loop\s+in|align|work\s+with)\b[\s\S]{0,30}\b(?:${namePattern})\b`,
    "i"
  );
  if (cueRegex.test(sentence)) return true;

  const relationshipRegex = new RegExp(
    String.raw`\b(?:with|to)\s+(?:${namePattern})\b`,
    "i"
  );
  if (relationshipRegex.test(sentence)) return true;

  const directAddressRegex = new RegExp(String.raw`^(?:${namePattern})\b[:,\s-]`, "i");
  return directAddressRegex.test(sentence);
}

function sentenceContainsAlias(sentence, alias) {
  const escaped = alias.names.map((name) => escapeRegex(name));
  if (!escaped.length) return false;
  const pattern = new RegExp(String.raw`\b(?:${escaped.join("|")})\b`, "i");
  return pattern.test(sentence);
}

function parseInferredHandoffs(params) {
  const text = normalizeText(params?.text);
  if (!text) return [];
  const knownAgents = buildKnownAgentAliases(params?.knownAgents, params?.requestedByAgent);
  if (!knownAgents.length) return [];
  const maxInferred = Number.isFinite(Number(params?.maxInferred))
    ? Math.max(1, Math.trunc(Number(params.maxInferred)))
    : 3;

  const inferred = [];
  const seenTargets = new Set();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (inferred.length >= maxInferred) break;
    if (line.startsWith("@")) continue;

    const sentenceParts = line
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const sentence of sentenceParts) {
      if (inferred.length >= maxInferred) break;
      for (const alias of knownAgents) {
        if (inferred.length >= maxInferred) break;
        if (seenTargets.has(alias.keyLower)) continue;
        if (!sentenceContainsAlias(sentence, alias)) continue;
        if (!hasDelegationCue(sentence, alias)) continue;

        inferred.push({
          target: alias.key,
          command: line,
          rawMention: sentence,
          routeMode: "INFERRED_PLAIN"
        });
        seenTargets.add(alias.keyLower);
      }
    }
  }

  return inferred;
}

function parseAgentHandoffs(params) {
  const text = params?.text;
  const explicit = parseExplicitHandoffs(text);
  const inferred = parseInferredHandoffs(params);
  return dedupeByTargetAndCommand([...explicit, ...inferred]);
}

module.exports = {
  parseAgentHandoffs
};

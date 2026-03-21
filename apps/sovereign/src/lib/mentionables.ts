export type Mentionable = {
  handle: string;
  label: string;
  kind: "agent" | "human";
};

function normalizeHandle(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildMentionables(params: {
  agentKeys: string[];
  humanNames: string[];
}): Mentionable[] {
  const out: Mentionable[] = [];
  const taken = new Set<string>();
  const agentByLower = new Map<string, Mentionable>();

  for (const key of params.agentKeys) {
    const handle = key.trim();
    if (!handle) continue;
    const lower = handle.toLowerCase();
    const next: Mentionable = { handle, label: handle, kind: "agent" };
    const existing = agentByLower.get(lower);
    if (!existing) {
      agentByLower.set(lower, next);
      continue;
    }
    // Prefer a cased variant over all-lowercase for cleaner UX.
    const existingIsLower = existing.handle === existing.handle.toLowerCase();
    const nextIsLower = next.handle === next.handle.toLowerCase();
    if (existingIsLower && !nextIsLower) {
      agentByLower.set(lower, next);
    }
  }

  for (const mentionable of agentByLower.values()) {
    const lower = mentionable.handle.toLowerCase();
    if (taken.has(lower)) continue;
    taken.add(lower);
    out.push(mentionable);
  }

  for (const name of params.humanNames) {
    if (!name) continue;
    let base = normalizeHandle(name);
    if (!base) continue;
    let handle = base;
    let i = 2;
    while (taken.has(handle.toLowerCase())) {
      handle = `${base}-${i}`;
      i += 1;
    }
    taken.add(handle.toLowerCase());
    out.push({ handle, label: name, kind: "human" });
  }

  return out;
}

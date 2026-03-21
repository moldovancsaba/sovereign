const MODE_OFF = "OFF";
const MODE_REDACT = "REDACT";
const MODE_DENY = "DENY";

const DLP_RULES = [
  {
    id: "GITHUB_TOKEN_CLASSIC",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]"
  },
  {
    id: "GITHUB_TOKEN_FINE_GRAINED",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]"
  },
  {
    id: "OPENAI_API_KEY",
    pattern: /\bsk-[A-Za-z0-9]{16,}\b/g,
    replacement: "[REDACTED_API_KEY]"
  },
  {
    id: "AWS_ACCESS_KEY_ID",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_ACCESS_KEY]"
  },
  {
    id: "BEARER_TOKEN",
    pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi,
    replacement: "Bearer [REDACTED_TOKEN]"
  },
  {
    id: "PRIVATE_KEY_BLOCK",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]"
  },
  {
    id: "JWT_TOKEN",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
    replacement: "[REDACTED_JWT]"
  },
  {
    id: "GENERIC_SECRET_KV",
    pattern: /((?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*)([^\s,;]+)/gi,
    replacement: "$1[REDACTED]"
  }
];

function resolveDlpMode(rawValue) {
  const mode = String(rawValue || "").trim().toUpperCase();
  if (mode === MODE_OFF || mode === MODE_REDACT || mode === MODE_DENY) {
    return mode;
  }
  return MODE_REDACT;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function applyOutputDlp(input, options = {}) {
  const mode = resolveDlpMode(options.mode);
  const text = String(input || "");
  if (!text) {
    return {
      text: "",
      mode,
      action: "ALLOW",
      redacted: false,
      blocked: false,
      matchCount: 0,
      ruleIds: [],
      channel: options.channel || "generic"
    };
  }

  if (mode === MODE_OFF) {
    return {
      text,
      mode,
      action: "ALLOW",
      redacted: false,
      blocked: false,
      matchCount: 0,
      ruleIds: [],
      channel: options.channel || "generic"
    };
  }

  let next = text;
  const matchedRuleIds = [];
  let matchCount = 0;

  for (const rule of DLP_RULES) {
    next = next.replace(rule.pattern, (...args) => {
      matchCount += 1;
      matchedRuleIds.push(rule.id);
      if (typeof rule.replacement === "function") {
        return rule.replacement(...args);
      }
      return rule.replacement;
    });
  }

  const hasMatches = matchCount > 0;
  if (!hasMatches) {
    return {
      text,
      mode,
      action: "ALLOW",
      redacted: false,
      blocked: false,
      matchCount: 0,
      ruleIds: [],
      channel: options.channel || "generic"
    };
  }

  if (mode === MODE_DENY) {
    return {
      text: `[DLP_BLOCKED] Sensitive output removed (${matchCount} match${matchCount === 1 ? "" : "es"}).`,
      mode,
      action: "BLOCK",
      redacted: true,
      blocked: true,
      matchCount,
      ruleIds: unique(matchedRuleIds),
      channel: options.channel || "generic"
    };
  }

  return {
    text: next,
    mode,
    action: "REDACT",
    redacted: true,
    blocked: false,
    matchCount,
    ruleIds: unique(matchedRuleIds),
    channel: options.channel || "generic"
  };
}

module.exports = {
  applyOutputDlp,
  resolveDlpMode,
  MODE_OFF,
  MODE_REDACT,
  MODE_DENY
};

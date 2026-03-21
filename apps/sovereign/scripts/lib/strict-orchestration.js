function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function parseBool(value, fallback = false) {
  const text = normalizeLower(value);
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function envOr(primary, legacy, fallback) {
  return normalizeText(process.env[primary] || process.env[legacy] || fallback);
}

function strictConfigFromEnv() {
  const drafterKey = envOr("SOVEREIGN_ORCH_DRAFTER_KEY", "SENTINELSQUAD_ORCH_DRAFTER_KEY", "Drafter");
  const writerKey = envOr("SOVEREIGN_ORCH_WRITER_KEY", "SENTINELSQUAD_ORCH_WRITER_KEY", "Writer");
  const controllerKey = envOr("SOVEREIGN_ORCH_CONTROLLER_KEY", "SENTINELSQUAD_ORCH_CONTROLLER_KEY", "Controller");
  return {
    enabled: parseBool(
      process.env.SOVEREIGN_STRICT_ORCHESTRATION || process.env.SENTINELSQUAD_STRICT_ORCHESTRATION || "1",
      true
    ),
    drafterKey,
    writerKey,
    controllerKey,
    drafterLower: drafterKey.toLowerCase(),
    writerLower: writerKey.toLowerCase(),
    controllerLower: controllerKey.toLowerCase()
  };
}

function roleForAgent(agentKey, cfg) {
  const lower = normalizeLower(agentKey);
  if (lower === cfg.drafterLower) return "DRAFTER";
  if (lower === cfg.writerLower) return "WRITER";
  if (lower === cfg.controllerLower) return "CONTROLLER";
  return null;
}

function isArchitectureContamination(text) {
  const normalized = normalizeLower(text);
  if (!normalized) return false;
  return /\b(architecture|architectural|srs|specification|redesign|schema strategy|rewrite architecture|change architecture)\b/i.test(
    normalized
  );
}

function controllerRequiresRestart(text) {
  const normalized = normalizeLower(text);
  if (!normalized) return false;
  return /\b(decline|restart|required restart|confidence[:\s]*[0-8]?\d%|strict_role_violation)\b/i.test(
    normalized
  );
}

function buildWriterExecutionCommand(sourceContent) {
  const task = normalizeText(sourceContent) || "Implement from @Drafter specification";
  return `@Writer execute the implementation build step now: python3 run.py --task "${task.replace(/"/g, "'")}"`;
}

function buildControllerValidationCommand(sourceContent) {
  const summary = normalizeText(sourceContent) || "Validate latest @Writer implementation";
  return (
    `@Controller validate Writer output against Drafter spec. ` +
    `Run benchmark gate: python3 nexus/agent_manager.py --role @Controller --current-model llama3.1:8b --candidates llama3.1:8b,deepseek-r1:1.5b. ` +
    `Return [CONFIDENCE: X%] + ACCEPT/DECLINE. Context: ${summary}`
  );
}

function classifyToolAccess(tool) {
  const normalized = normalizeText(tool);
  if (!normalized) {
    return {
      family: "UNKNOWN",
      access: "UNKNOWN",
      description: "unknown tool"
    };
  }

  if (normalized === "shell.exec") {
    return {
      family: "SHELL",
      access: "MUTATION",
      description: "shell execution"
    };
  }

  if (normalized.startsWith("git.")) {
    if (
      normalized === "git.status" ||
      normalized === "git.diff" ||
      normalized === "git.log" ||
      normalized === "git.show" ||
      normalized === "git.branch.list"
    ) {
      return {
        family: "GIT",
        access: "READ_ONLY",
        description: "read-only git access"
      };
    }
    return {
      family: "GIT",
      access: "MUTATION",
      description: "git mutation"
    };
  }

  if (normalized.startsWith("filesystem.")) {
    if (
      normalized === "filesystem.list" ||
      normalized === "filesystem.read" ||
      normalized === "filesystem.search" ||
      normalized === "filesystem.stat"
    ) {
      return {
        family: "FILESYSTEM",
        access: "READ_ONLY",
        description: "read-only filesystem access"
      };
    }
    return {
      family: "FILESYSTEM",
      access: "MUTATION",
      description: "filesystem mutation"
    };
  }

  if (normalized.startsWith("memory.")) {
    return {
      family: "PROJECT_MEMORY",
      access: "READ_ONLY",
      description: "read-only project memory (search/list/get)"
    };
  }

  if (normalized.startsWith("backlog.")) {
    const readOnly =
      normalized === "backlog.list_boards" ||
      normalized === "backlog.list_items" ||
      normalized === "backlog.get_item";
    if (readOnly) {
      return {
        family: "BACKLOG",
        access: "READ_ONLY",
        description: "read-only backlog access"
      };
    }
    return {
      family: "BACKLOG",
      access: "MUTATION",
      description: "backlog mutation (create/update/feedback)"
    };
  }

  return {
    family: "UNKNOWN",
    access: "UNKNOWN",
    description: normalized
  };
}

function evaluateExecutionRolePolicy(params) {
  const cfg = params?.config || strictConfigFromEnv();
  if (!cfg.enabled) {
    return {
      allowed: true,
      strictApplied: false,
      role: null,
      reason: "Strict orchestration disabled."
    };
  }

  const agentKey = normalizeText(params?.agentKey || params?.requestedByAgent);
  const role = roleForAgent(agentKey, cfg);
  if (!role) {
    return {
      allowed: true,
      strictApplied: false,
      role: null,
      reason: "Agent is outside strict orchestration roles."
    };
  }

  const tool = normalizeText(params?.tool);
  const access = classifyToolAccess(tool);

  if (role === "DRAFTER") {
    const allowed =
      (access.family === "FILESYSTEM" && access.access === "READ_ONLY") ||
      (access.family === "PROJECT_MEMORY" && access.access === "READ_ONLY") ||
      (access.family === "BACKLOG" && access.access === "READ_ONLY");
    return {
      allowed,
      strictApplied: true,
      role,
      tool,
      access,
      reason: allowed
        ? "@Drafter may use read-only filesystem, project-memory, or backlog inspection while producing specifications."
        : `STRICT_ROLE_VIOLATION: @Drafter cannot execute ${access.description}. Route implementation work to @Writer.`
    };
  }

  if (role === "WRITER") {
    return {
      allowed: true,
      strictApplied: true,
      role,
      tool,
      access,
      reason: "@Writer is the implementation role and may execute workspace tools."
    };
  }

  const allowed =
    (access.family === "FILESYSTEM" && access.access === "READ_ONLY") ||
    (access.family === "GIT" && access.access === "READ_ONLY") ||
    (access.family === "PROJECT_MEMORY" && access.access === "READ_ONLY") ||
    (access.family === "BACKLOG" && access.access === "READ_ONLY");
  return {
    allowed,
    strictApplied: true,
    role,
    tool,
    access,
    reason: allowed
      ? "@Controller may use read-only validation tools (filesystem, git, project memory, backlog)."
      : `STRICT_ROLE_VIOLATION: @Controller cannot execute ${access.description}. Validation must remain read-only.`
  };
}

function enforceStrictOrchestration(params) {
  const cfg = params?.config || strictConfigFromEnv();
  const sourceContent = normalizeText(params?.sourceContent);
  const requestedByAgent = normalizeText(params?.requestedByAgent);
  const inputHandoffs = Array.isArray(params?.handoffs) ? params.handoffs : [];
  const notices = [];

  if (!cfg.enabled) {
    return {
      handoffs: inputHandoffs,
      notices,
      strictApplied: false
    };
  }

  const role = roleForAgent(requestedByAgent, cfg);
  if (!role) {
    return {
      handoffs: inputHandoffs,
      notices,
      strictApplied: false
    };
  }

  if (role === "DRAFTER") {
    const writerTarget = cfg.writerKey;
    return {
      handoffs: [
        {
          target: writerTarget,
          command: buildWriterExecutionCommand(sourceContent),
          rawMention: `@${writerTarget}`,
          routeMode: "STRICT_CHAIN"
        }
      ],
      notices: [
        "Strict orchestration: @Drafter output routed only to @Writer (implementation build step)."
      ],
      strictApplied: true
    };
  }

  if (role === "WRITER") {
    if (isArchitectureContamination(sourceContent)) {
      return {
        handoffs: [
          {
            target: cfg.controllerKey,
            command:
              "@Controller STRICT_ROLE_VIOLATION: @Writer attempted architecture change. Intervene immediately and decide ACCEPT/DECLINE with confidence.",
            rawMention: `@${cfg.controllerKey}`,
            routeMode: "STRICT_VIOLATION"
          }
        ],
        notices: [
          "Strict orchestration: architecture contamination detected from @Writer; @Controller intervention forced."
        ],
        strictApplied: true
      };
    }
    return {
      handoffs: [
        {
          target: cfg.controllerKey,
          command: buildControllerValidationCommand(sourceContent),
          rawMention: `@${cfg.controllerKey}`,
          routeMode: "STRICT_CHAIN"
        }
      ],
      notices: [
        "Strict orchestration: @Writer output routed only to @Controller for validation/benchmark."
      ],
      strictApplied: true
    };
  }

  // CONTROLLER
  if (controllerRequiresRestart(sourceContent)) {
    return {
      handoffs: [
        {
          target: cfg.drafterKey,
          command:
            "@Drafter restart specification. Previous cycle declined by @Controller. Produce updated .md spec and tag @Writer.",
          rawMention: `@${cfg.drafterKey}`,
          routeMode: "STRICT_RESTART"
        }
      ],
      notices: [
        "Strict orchestration: @Controller decline/restart detected; routed back to @Drafter."
      ],
      strictApplied: true
    };
  }

  return {
    handoffs: [],
    notices: [
      "Strict orchestration: @Controller accepted output; chain terminated."
    ],
    strictApplied: true
  };
}

module.exports = {
  strictConfigFromEnv,
  roleForAgent,
  enforceStrictOrchestration,
  evaluateExecutionRolePolicy
};

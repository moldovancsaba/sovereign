import { execFileSync } from "node:child_process";

export type LocalServiceStatus = {
  key: "app" | "worker" | "ollama" | "postgres";
  label: string;
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  detail: string;
};

function commandOutput(command: string, args: string[]) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function portListening(port: number) {
  const output = commandOutput("/usr/sbin/lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  return Boolean(output);
}

function launchAgentLoaded(label: string) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid == null) return false;
  const output = commandOutput("/bin/launchctl", ["print", `gui/${uid}/${label}`]);
  return Boolean(output) && !/could not find service/i.test(output);
}

export function getLocalSystemStatus(): LocalServiceStatus[] {
  const appListening = portListening(3007);
  const postgresListening = portListening(34765);
  const ollamaListening = portListening(11434);
  const workerLoaded = launchAgentLoaded("com.sentinelsquad.worker");
  const ollamaLoaded = launchAgentLoaded("com.sentinelsquad.ollama");
  const appLoaded = launchAgentLoaded("com.sentinelsquad.app");

  return [
    {
      key: "app",
      label: "App",
      status: appListening ? "HEALTHY" : appLoaded ? "DEGRADED" : "UNAVAILABLE",
      detail: appListening
        ? "Next.js app is listening on port 3007."
        : appLoaded
        ? "LaunchAgent is loaded, but the app port is not listening."
        : "App service is not loaded."
    },
    {
      key: "worker",
      label: "Worker",
      status: workerLoaded ? "HEALTHY" : "UNAVAILABLE",
      detail: workerLoaded
        ? "Managed worker LaunchAgent is loaded."
        : "Worker LaunchAgent is not loaded."
    },
    {
      key: "ollama",
      label: "Ollama",
      status: ollamaListening ? "HEALTHY" : ollamaLoaded ? "DEGRADED" : "UNAVAILABLE",
      detail: ollamaListening
        ? "Ollama is listening on port 11434."
        : ollamaLoaded
        ? "Ollama LaunchAgent is loaded, but the API port is not listening."
        : "Ollama service is not loaded."
    },
    {
      key: "postgres",
      label: "Postgres",
      status: postgresListening ? "HEALTHY" : "UNAVAILABLE",
      detail: postgresListening
        ? "Postgres is listening on port 34765."
        : "Postgres is not listening on port 34765."
    }
  ];
}

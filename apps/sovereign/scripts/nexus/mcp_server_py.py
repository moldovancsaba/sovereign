#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ORCHESTRATE = ROOT / "scripts" / "nexus" / "orchestrate.py"
MANAGER = ROOT / "nexus" / "agent_manager.py"
CELL = ROOT / "scripts" / "nexus" / "cell_runner.py"


def run_cmd(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    return {
        "exitCode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr
    }


def handle(payload):
    action = payload.get("action")
    if action == "seminar.run":
        task = str(payload.get("task", "")).strip()
        if not task:
            return {"ok": False, "error": "task is required"}
        return {"ok": True, "result": run_cmd([sys.executable, str(ORCHESTRATE), "--task", task])}

    if action == "models.list":
        return {"ok": True, "result": run_cmd(["ollama", "list"])}

    if action == "benchmark.run":
        role = str(payload.get("role", "@Writer"))
        current_model = str(payload.get("current_model", "deepseek-coder-v2"))
        candidates = str(payload.get("candidates", "llama3:8b,deepseek-coder-v2"))
        cmd = [
            sys.executable,
            str(MANAGER),
            "--role",
            role,
            "--current-model",
            current_model,
            "--candidates",
            candidates
        ]
        if payload.get("auto_apply") is True:
            cmd.append("--auto-apply")
        return {"ok": True, "result": run_cmd(cmd)}

    if action == "cell.run":
        task = str(payload.get("task", "")).strip()
        if not task:
            return {"ok": False, "error": "task is required"}
        return {
            "ok": True,
            "result": run_cmd([sys.executable, str(CELL), "--task", task])
        }

    return {"ok": False, "error": f"unknown action: {action}"}


def parse_natural_command(line):
    text = str(line or "").strip()
    if not text:
        return None

    # Supported natural triggers:
    # - @Controller run cell: <task>
    # - run cell: <task>
    # - cell: <task>
    # - /cell <task>
    patterns = [
        r"^@controller\s+run\s+cell\s*:\s*(.+)$",
        r"^run\s+cell\s*:\s*(.+)$",
        r"^cell\s*:\s*(.+)$",
        r"^/cell\s+(.+)$"
    ]
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            task = str(match.group(1) or "").strip()
            if task:
                return {"action": "cell.run", "task": task}
            return {"action": "cell.run", "task": ""}
    return None


def main():
    # Lightweight stdio JSON bridge compatible with Roo custom command runners.
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            request = parse_natural_command(line)
            if not request:
                sys.stdout.write(json.dumps({"ok": False, "error": "invalid_json"}) + "\n")
                sys.stdout.flush()
                continue

        response = handle(request)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()

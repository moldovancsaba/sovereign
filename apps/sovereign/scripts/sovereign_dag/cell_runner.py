#!/usr/bin/env python3
import argparse
import json
import os
import re
import socket
import subprocess
import textwrap
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[2]
NEXUS_DIR = ROOT / "nexus"
APP_ROOT = ROOT

OLLAMA_BASE = os.environ.get("OLLAMA_HOST", os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")).rstrip("/")
DRAFTER_MODEL = os.environ.get("NEXUS_DRAFTER_MODEL", "llama3.1:8b")
FALLBACK_DRAFTER_MODEL = os.environ.get("NEXUS_DRAFTER_FALLBACK_MODEL", "llama3.2:1b")
CHATDEV_PATH = Path(
    os.environ.get(
        "SOVEREIGN_CHATDEV_PATH",
        str((ROOT.parents[1] / "external" / "ChatDev").resolve()),
    )
)
CHATDEV_WORKFLOW = Path(
    os.environ.get(
        "SOVEREIGN_CHATDEV_WORKFLOW_PATH",
        str((NEXUS_DIR / "chatdev_dev_team.yaml").resolve()),
    )
)
ARTIFACT_DIR = APP_ROOT / ".sovereign" / "nexus"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def call_ollama_generate(model: str, prompt: str) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 700
        }
    }
    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return str(data.get("response", "")).strip()


def generate_drafter_spec(task: str) -> str:
    prompt = build_drafter_prompt(task)
    try:
        return call_ollama_generate(DRAFTER_MODEL, prompt)
    except (TimeoutError, socket.timeout, urllib.error.URLError):
        if FALLBACK_DRAFTER_MODEL and FALLBACK_DRAFTER_MODEL != DRAFTER_MODEL:
            return call_ollama_generate(FALLBACK_DRAFTER_MODEL, prompt)
        raise


def build_drafter_prompt(task: str) -> str:
    return textwrap.dedent(
        f"""
        You are @Drafter.
        Transform the human request into an engineering-ready markdown spec.

        Required sections:
        - Title
        - Objective
        - Scope
        - Deliverables
        - Acceptance Criteria
        - Constraints
        - Non-Goals
        - Suggested Implementation Steps

        Rules:
        - Be concrete, short, implementation-oriented.
        - No code blocks.
        - Keep under 500 words.

        Human request:
        {task}
        """
    ).strip()


def run_chatdev(spec_md: str, task_name: str) -> Dict[str, Any]:
    if not CHATDEV_PATH.exists():
        raise RuntimeError(f"ChatDev path not found: {CHATDEV_PATH}")
    if not CHATDEV_WORKFLOW.exists():
        raise RuntimeError(f"ChatDev workflow not found: {CHATDEV_WORKFLOW}")

    python_bin = CHATDEV_PATH / ".venv" / "bin" / "python"
    if not python_bin.exists():
        raise RuntimeError(f"ChatDev python not found: {python_bin}")

    cmd = [
        str(python_bin),
        "run.py",
        "--path",
        str(CHATDEV_WORKFLOW),
        "--name",
        task_name
    ]
    env = os.environ.copy()
    env["BASE_URL"] = "http://127.0.0.1:11434/v1"
    env["API_KEY"] = "ollama-local"

    proc = subprocess.run(
        cmd,
        cwd=str(CHATDEV_PATH),
        env=env,
        input=f"{spec_md}\n",
        capture_output=True,
        text=True,
        timeout=240
    )
    combined = f"{proc.stdout}\n{proc.stderr}".strip()
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "output": combined[-50000:],
        "command": " ".join(cmd)
    }


def extract_controller_decision(output: str) -> Dict[str, Any]:
    text = output or ""
    conf = None
    decision = None

    m_conf = re.search(r"\[CONFIDENCE:\s*([0-9]{1,3})%\]", text, flags=re.I)
    if not m_conf:
        m_conf = re.search(r"CONFIDENCE:\s*([0-9]{1,3})%", text, flags=re.I)
    if m_conf:
        conf = int(m_conf.group(1))

    m_dec = re.search(r"DECISION:\s*(ACCEPT|DECLINE)", text, flags=re.I)
    if m_dec:
        decision = m_dec.group(1).upper()

    return {
        "confidence": conf,
        "decision": decision
    }


def write_artifact(payload: Dict[str, Any]) -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_DIR / "cell-last-run.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Nexus Dev Cell: Drafter -> ChatDev Team -> Controller")
    parser.add_argument("--task", required=True, help="Human request")
    args = parser.parse_args()

    spec = generate_drafter_spec(args.task)
    task_name = f"NexusDevCell_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    chatdev = run_chatdev(spec, task_name)
    decision = extract_controller_decision(chatdev["output"])

    result = {
        "timestamp": now_iso(),
        "ok": chatdev["ok"],
        "task": args.task,
        "drafter_model": DRAFTER_MODEL,
        "drafter_spec": spec,
        "chatdev": {
            "path": str(CHATDEV_PATH),
            "workflow": str(CHATDEV_WORKFLOW),
            "task_name": task_name,
            "exit_code": chatdev["exit_code"],
            "command": chatdev["command"],
            "output": chatdev["output"]
        },
        "controller": decision
    }

    write_artifact(result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

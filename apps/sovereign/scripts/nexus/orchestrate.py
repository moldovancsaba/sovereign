#!/usr/bin/env python3
import argparse
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[2]
NEXUS = ROOT / "nexus"
CHAIN_PATH = NEXUS / "ChatChainConfig.json"
PHASE_PATH = NEXUS / "PhaseConfig.json"

OLLAMA_BASE = os.environ.get("OLLAMA_HOST", os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))

ROLE_MODEL_DEFAULTS = {
    "@Drafter": os.environ.get("NEXUS_DRAFTER_MODEL", "llama3.2:3b"),
    "@Writer": os.environ.get("NEXUS_WRITER_MODEL", "deepseek-r1:1.5b"),
    "@Controller": os.environ.get("NEXUS_CONTROLLER_MODEL", "llama3.1:8b")
}


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def list_models() -> List[str]:
    urls = [
        f"{OLLAMA_BASE.rstrip('/')}/api/tags",
        f"{OLLAMA_BASE.rstrip('/')}/v1/models"
    ]
    for url in urls:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if url.endswith("/api/tags"):
                models = [str(m.get("name", "")).strip() for m in data.get("models", []) if str(m.get("name", "")).strip()]
            else:
                models = [str(m.get("id", "")).strip() for m in data.get("data", []) if str(m.get("id", "")).strip()]
            if models:
                return sorted(set(models))
        except Exception:
            continue
    return []


def resolve_model_name(requested: str, available: List[str]) -> str:
    req = str(requested or "").strip()
    if not req or not available:
        return req
    if req in available:
        return req

    req_lower = req.lower()
    lower_map = {m.lower(): m for m in available}
    if req_lower in lower_map:
        return lower_map[req_lower]

    base = req.split(":")[0].lower()
    by_base = [m for m in available if m.split(":")[0].lower() == base]
    if by_base:
        by_base.sort(key=lambda x: (":instruct" in x, x.endswith(":latest"), len(x)), reverse=True)
        return by_base[0]
    return req


def call_ollama(model: str, prompt: str) -> str:
    try:
        req = urllib.request.Request(
            f"{OLLAMA_BASE.rstrip('/')}/api/generate",
            data=json.dumps(
                {
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 220}
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            return str(json.loads(resp.read().decode("utf-8")).get("response", "")).strip()
    except urllib.error.HTTPError as err:
        if err.code != 404:
            raise
        try:
            req = urllib.request.Request(
                f"{OLLAMA_BASE.rstrip('/')}/api/chat",
                data=json.dumps(
                    {
                        "model": model,
                        "messages": [
                            {"role": "user", "content": prompt}
                        ],
                        "stream": False,
                        "options": {"temperature": 0.1, "num_predict": 220}
                    }
                ).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return str(data.get("message", {}).get("content", "")).strip()
        except urllib.error.HTTPError as err_chat:
            if err_chat.code != 404:
                raise
            req = urllib.request.Request(
                f"{OLLAMA_BASE.rstrip('/')}/v1/chat/completions",
                data=json.dumps(
                    {
                        "model": model,
                        "messages": [
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 220
                    }
                ).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()


def is_code_like(text: str) -> bool:
    return bool(re.search(r"```|\bdef\s+\w+\(|\bclass\s+\w+\b|\bfunction\s+\w+\b", text, flags=re.I))


def role_violation(role: str, text: str, context: Dict[str, str]) -> str:
    if role == "@Drafter" and is_code_like(text):
        return "STRICT_ROLE_VIOLATION: @Drafter emitted code-like output."
    if role == "@Writer":
        if not context.get("@Drafter"):
            return "STRICT_ROLE_VIOLATION: @Writer attempted implementation without @Drafter spec."
    if role == "@Controller":
        if "confidence" not in text.lower() and "accept" not in text.lower() and "decline" not in text.lower():
            return "STRICT_ROLE_VIOLATION: @Controller missing confidence/decision format."
    return ""


def build_prompt(role: str, role_prompt: str, task: str, context: Dict[str, str]) -> str:
    prev = "\n\n".join([f"{k}:\n{v}" for k, v in context.items() if v])
    return (
        f"Role: {role}\n"
        f"Instructions: {role_prompt}\n\n"
        f"Task: {task}\n\n"
        f"Prior outputs:\n{prev if prev else '(none)'}\n\n"
        "Return concise output only for your role."
    )


def run_chain(task: str) -> Dict[str, Any]:
    chain = read_json(CHAIN_PATH)
    phase_cfg = read_json(PHASE_PATH)

    routing = chain.get("modelRouting", {})
    context: Dict[str, str] = {}
    transcript: List[Dict[str, str]] = []

    available_models = list_models()

    for phase in chain.get("chain", []):
        participants = list(phase.get("participant", []))
        for role in participants:
            role_prompt = phase_cfg.get("roles", {}).get(role, {}).get("rules", [])
            prompt = build_prompt(role, " ".join(role_prompt), task, context)
            requested_model = routing.get(role, ROLE_MODEL_DEFAULTS.get(role, "llama3.2:3b"))
            model = resolve_model_name(requested_model, available_models)
            response = call_ollama(model, prompt)

            violation = role_violation(role, response, context)
            if violation:
                transcript.append({"role": "@Controller", "phase": phase.get("phase", "unknown"), "content": violation})
                return {
                    "status": "BLOCKED",
                    "reason": violation,
                    "transcript": transcript
                }

            context[role] = response
            transcript.append({"role": role, "phase": phase.get("phase", "unknown"), "content": response})

    controller_output = context.get("@Controller", "")
    status = "DONE"
    if "decline" in controller_output.lower():
        status = "RESTART_REQUIRED"

    return {
        "status": status,
        "reason": "Chain completed",
        "available_models": available_models,
        "transcript": transcript,
        "outputs": context
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Nexus role chain locally")
    parser.add_argument("--task", required=True, help="Human task")
    args = parser.parse_args()
    result = run_chain(args.task)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

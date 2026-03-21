#!/usr/bin/env python3
import argparse
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
BENCHMARKS_PATH = ROOT / "benchmarks.json"
CHAIN_CONFIG_PATH = ROOT / "ChatChainConfig.json"

DEFAULT_OLLAMA_BASE = os.environ.get("OLLAMA_HOST", os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
DEFAULT_CANDIDATES = ["deepseek-r1:1.5b", "llama3.1:8b"]


@dataclass
class ModelResult:
    model: str
    pass_rate: float
    avg_latency_sec: float
    avg_tokens_sec: float
    passed: bool
    details: List[Dict[str, Any]]


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def _http_get_json(url: str) -> Dict[str, Any]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def list_models(base_url: str) -> List[str]:
    urls = [
        f"{base_url.rstrip('/')}/api/tags",
        f"{base_url.rstrip('/')}/v1/models"
    ]
    for url in urls:
        try:
            data = _http_get_json(url)
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
    req = requested.strip()
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


def ollama_generate(base_url: str, model: str, prompt: str) -> Dict[str, Any]:
    payload_generate = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 180
        }
    }
    try:
        req = urllib.request.Request(
            f"{base_url.rstrip('/')}/api/generate",
            data=json.dumps(payload_generate).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        # Fall back to alternative local API shapes exposed by Ollama/gateways.
        if err.code != 404:
            raise
        payload_chat = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 180
            }
        }
        try:
            req = urllib.request.Request(
                f"{base_url.rstrip('/')}/api/chat",
                data=json.dumps(payload_chat).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data.get("message", {}).get("content", "")
                return {"response": content, "eval_count": data.get("eval_count", 0), "eval_duration": data.get("eval_duration", 0)}
        except urllib.error.HTTPError as err_chat:
            if err_chat.code != 404:
                raise
            req = urllib.request.Request(
                f"{base_url.rstrip('/')}/v1/chat/completions",
                data=json.dumps(
                    {
                        "model": model,
                        "messages": payload_chat["messages"],
                        "temperature": 0.1,
                        "max_tokens": 180
                    }
                ).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                usage = data.get("usage", {}) if isinstance(data.get("usage"), dict) else {}
                return {
                    "response": content,
                    "eval_count": usage.get("completion_tokens", 0),
                    "eval_duration": 0
                }


def evaluate_response(text: str, criteria: List[str], forbidden: List[str]) -> bool:
    lowered = text.lower()
    if any(token.lower() in lowered for token in forbidden):
        return False
    return all(token.lower() in lowered for token in criteria)


def benchmark_model(base_url: str, model: str, suite: List[Dict[str, Any]], threshold: Dict[str, Any]) -> ModelResult:
    checks: List[Dict[str, Any]] = []

    for test in suite:
        prompt = str(test.get("prompt", "")).strip()
        if not prompt:
            continue
        started = time.time()
        try:
            data = ollama_generate(base_url, model, prompt)
            latency = time.time() - started
            response_text = str(data.get("response", ""))
            eval_count = float(data.get("eval_count", 0) or 0)
            eval_duration_ns = float(data.get("eval_duration", 0) or 0)
            tokens_per_sec = eval_count / (eval_duration_ns / 1e9) if eval_duration_ns > 0 else 0.0

            passed = evaluate_response(
                response_text,
                list(test.get("criteria", [])),
                list(test.get("forbidden", []))
            )
            checks.append(
                {
                    "id": test.get("id"),
                    "passed": passed,
                    "latency_sec": latency,
                    "tokens_per_sec": tokens_per_sec,
                    "response_chars": len(response_text)
                }
            )
        except urllib.error.URLError as err:
            checks.append(
                {
                    "id": test.get("id"),
                    "passed": False,
                    "latency_sec": 0,
                    "tokens_per_sec": 0,
                    "error": f"network_error: {err}"
                }
            )
        except Exception as err:  # pragma: no cover - defensive fallback
            checks.append(
                {
                    "id": test.get("id"),
                    "passed": False,
                    "latency_sec": 0,
                    "tokens_per_sec": 0,
                    "error": f"runtime_error: {err}"
                }
            )

    if not checks:
        return ModelResult(model=model, pass_rate=0.0, avg_latency_sec=0.0, avg_tokens_sec=0.0, passed=False, details=[])

    pass_rate = sum(1 for c in checks if c.get("passed")) / len(checks)
    avg_latency = sum(float(c.get("latency_sec", 0)) for c in checks) / len(checks)
    avg_tps = sum(float(c.get("tokens_per_sec", 0)) for c in checks) / len(checks)

    min_pass = float(threshold.get("min_pass_rate", 1.0))
    min_tps = float(threshold.get("min_tokens_sec", 0))
    max_latency = float(threshold.get("max_latency_seconds", 9999))

    passed = pass_rate >= min_pass and avg_tps >= min_tps and avg_latency <= max_latency

    return ModelResult(
        model=model,
        pass_rate=pass_rate,
        avg_latency_sec=avg_latency,
        avg_tokens_sec=avg_tps,
        passed=passed,
        details=checks
    )


def compare_models(current: ModelResult, candidate: ModelResult, margin: float = 0.15) -> bool:
    current_score = (current.pass_rate * 0.7) + (min(current.avg_tokens_sec / 100, 1.0) * 0.2) + (
        max(0.0, 1.0 - (current.avg_latency_sec / 30.0)) * 0.1
    )
    candidate_score = (candidate.pass_rate * 0.7) + (min(candidate.avg_tokens_sec / 100, 1.0) * 0.2) + (
        max(0.0, 1.0 - (candidate.avg_latency_sec / 30.0)) * 0.1
    )
    return candidate_score >= current_score * (1.0 + margin)


def update_team_config(role: str, model: str) -> None:
    data = read_json(CHAIN_CONFIG_PATH)
    routing = data.setdefault("modelRouting", {})
    routing[role] = model
    write_json(CHAIN_CONFIG_PATH, data)


def run_benchmark(role: str, current_model: str, candidates: List[str], auto_apply: bool) -> Dict[str, Any]:
    benchmark = read_json(BENCHMARKS_PATH)
    suite = list(benchmark.get("test_suite", []))
    threshold = dict(benchmark.get("thresholds", {}).get(role, {}))
    available_models = list_models(DEFAULT_OLLAMA_BASE)

    resolved_current = resolve_model_name(current_model, available_models)
    resolved_candidates = [resolve_model_name(model, available_models) for model in candidates]
    resolved_candidates = [m for i, m in enumerate(resolved_candidates) if m and m not in resolved_candidates[:i]]

    current = benchmark_model(DEFAULT_OLLAMA_BASE, resolved_current or current_model, suite, threshold)
    reports = [current]

    for model in resolved_candidates:
        if model == current.model:
            continue
        reports.append(benchmark_model(DEFAULT_OLLAMA_BASE, model, suite, threshold))

    passed_candidates = [r for r in reports[1:] if r.passed]
    passed_candidates.sort(key=lambda r: (r.pass_rate, r.avg_tokens_sec, -r.avg_latency_sec), reverse=True)

    action = "KEEP"
    hire_model: Optional[str] = None

    if passed_candidates:
        best = passed_candidates[0]
        if compare_models(current, best):
            action = "HIRE_RECOMMENDED"
            hire_model = best.model
            if auto_apply:
                update_team_config(role, best.model)
                action = "HIRED"

    return {
        "role": role,
        "current_model": current.model,
        "requested_current_model": current_model,
        "action": action,
        "hire_model": hire_model,
        "available_models": available_models,
        "reports": [
            {
                "model": r.model,
                "pass_rate": r.pass_rate,
                "avg_latency_sec": r.avg_latency_sec,
                "avg_tokens_sec": r.avg_tokens_sec,
                "passed": r.passed,
                "details": r.details
            }
            for r in reports
        ]
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Nexus model manager for @Controller")
    p.add_argument("--role", default="@Writer", help="Role to benchmark (@Drafter/@Writer/@Controller)")
    p.add_argument("--current-model", default="deepseek-r1:1.5b", help="Current assigned model")
    p.add_argument(
        "--candidates",
        default=",".join(DEFAULT_CANDIDATES),
        help="Comma-separated candidate model names"
    )
    p.add_argument("--auto-apply", action="store_true", help="Apply hire decision to ChatChainConfig.json")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    candidates = [c.strip() for c in args.candidates.split(",") if c.strip()]
    result = run_benchmark(
        role=args.role,
        current_model=args.current_model,
        candidates=candidates,
        auto_apply=args.auto_apply
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

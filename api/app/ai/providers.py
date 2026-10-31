"""LLM adapters. The product must be fully usable with this module doing nothing.

`LLM_PROVIDER=none` (the default) keeps every call local and deterministic. When a Groq key
is configured the same endpoints may use the model to *read* text - never to decide
validity. Every provider call is wrapped in a timeout and falls back to the deterministic
parser on any error.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..config import get_settings
from . import budget

ROOT = Path(__file__).resolve().parents[3]
PROMPT_FILE = ROOT / "prompts" / "extract_booking.md"

EXTRACT_PROMPT = """You convert a campus venue request into JSON. You do not decide whether
it is possible, and you never invent room ids, group ids or periods.

Return only this JSON object:
{"title": str|null, "attendance": int|null, "duration_periods": int|null,
 "days": [str], "from_period": int|null, "to_period": int|null,
 "needs": [str], "room_types": [str], "requested_room": str|null,
 "mandatory_for_groups": [str], "requested_category": str|null,
 "notes": [str]}

Rules:
- periods are 1..9 for teaching (P1 08:00 ... P5 12:00, lunch 13:00, P6 14:00 ... P9 17:00)
  and 10..13 for evening events (P10 18:00 ... P13 21:00).
- "kal" in a booking request means tomorrow; "shaam 6 baje" means P10.
- needs must come from: projector, pa_system, stage, computers, accessible, power_benches, ac.
- room_types must come from: classroom, lecture_hall, auditorium, seminar_hall, outdoor,
  lab_cs, lab_elec, lab_phy, lab_civil, workshop.
- If a value is not stated, use null. Do not guess a number.
"""


def load_prompt() -> str:
    """The prompt lives in the repo (prompts/extract_booking.md), not buried in a string."""
    try:
        text = PROMPT_FILE.read_text(encoding="utf-8")
    except OSError:
        return EXTRACT_PROMPT
    if "```text" in text:
        body = text.split("```text", 1)[1].split("```", 1)[0]
        if body.strip():
            return body.strip()
    return EXTRACT_PROMPT


@dataclass
class LLMStats:
    """Small in-process counter so the UI can show that the key is (not) being used."""
    attempts: int = 0
    successes: int = 0
    failures: int = 0
    last_error: str = ""
    last_model: str = ""
    last_latency_ms: int = 0
    calls_by_model: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"attempts": self.attempts, "successes": self.successes,
                "failures": self.failures, "last_error": self.last_error,
                "last_model": self.last_model, "last_latency_ms": self.last_latency_ms,
                "calls_by_model": dict(self.calls_by_model),
                "budget": budget.snapshot()}


STATS = LLMStats()


@dataclass
class LLMResult:
    ok: bool
    data: dict | None = None
    provider: str = "none"
    model: str = ""
    error: str = ""
    latency_ms: int = 0


class LLMProvider:
    name = "none"

    def available(self) -> bool:
        return False

    def extract(self, text: str, context: dict) -> LLMResult:  # pragma: no cover - interface
        return LLMResult(ok=False, provider=self.name, error="no provider configured")


class NoneProvider(LLMProvider):
    name = "none"


class GroqProvider(LLMProvider):
    """Groq chat-completions (OpenAI-compatible). Primary model, then the fallback model."""

    name = "groq"

    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        s = get_settings()
        self.api_key = s.groq_api_key
        self.model = s.groq_model
        self.fallback_model = s.groq_fallback_model
        self.base_url = s.groq_base_url.rstrip("/")
        self.timeout = s.llm_timeout
        self.transport = transport          # tests inject a mock; production uses the network
        # A mock transport spends nothing, so the free-tier guard is skipped for it.
        self.spends_quota = transport is None
        self.system_prompt = load_prompt()

    def available(self) -> bool:
        return bool(self.api_key)

    def _call(self, model: str, text: str, context: dict) -> tuple[str, int]:
        import time

        payload = {
            "model": model,
            "temperature": 0,
            "max_tokens": 500,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": json.dumps({"request": text, "context": context},
                                                       ensure_ascii=False)},
            ],
        }
        started = time.time()
        kwargs = {"timeout": self.timeout}
        if self.transport is not None:
            kwargs["transport"] = self.transport
        with httpx.Client(**kwargs) as client:
            resp = client.post(f"{self.base_url}/chat/completions", json=payload,
                               headers={"Authorization": f"Bearer {self.api_key}"})
            if resp.status_code in (429, 500, 502, 503, 504):
                raise RuntimeError(f"provider busy ({resp.status_code})")
            resp.raise_for_status()
            body = resp.json()
        content = body["choices"][0]["message"]["content"]
        return content, int((time.time() - started) * 1000)

    def extract(self, text: str, context: dict) -> LLMResult:
        import time

        started = time.time()
        last_error = ""
        for model in [self.model, self.fallback_model]:
            if not model:
                continue
            for attempt in range(2):                     # one retry per model, small backoff
                allowed, why = (budget.reserve(model) if self.spends_quota else (True, "ok"))
                if not allowed:
                    last_error = why
                    STATS.last_error = why
                    break                                    # try the next model, not this one
                try:
                    STATS.attempts += 1
                    content, ms = self._call(model, text, context)
                    data = json.loads(content)
                    if not isinstance(data, dict):
                        raise ValueError("model did not return an object")
                    STATS.successes += 1
                    STATS.last_model = model
                    STATS.last_latency_ms = ms
                    STATS.calls_by_model[model] = STATS.calls_by_model.get(model, 0) + 1
                    return LLMResult(ok=True, data=data, provider=self.name, model=model,
                                     latency_ms=int((time.time() - started) * 1000))
                except Exception as exc:                 # busy, timeout, bad json
                    last_error = f"{type(exc).__name__}: {exc}"
                    STATS.failures += 1
                    STATS.last_error = last_error
                    quota = any(code in last_error for code in ("429", "quota", "budget",
                                                                "rate limit"))
                    if attempt == 0 and "busy" in last_error and not quota:
                        time.sleep(0.4)
                        continue
                    break
        return LLMResult(ok=False, provider=self.name, error=last_error,
                         latency_ms=int((time.time() - started) * 1000))

    def selftest(self) -> dict:
        """One tiny call, so a judge can see the key works (or why it does not)."""
        result = self.extract("Need a room for 40 people on Tuesday 6 to 8 pm with a projector.",
                              {"days": ["MON", "TUE", "WED", "THU", "FRI"], "role": "club"})
        return {"ok": result.ok, "model": result.model, "latency_ms": result.latency_ms,
                "error": result.error, "sample": result.data, "budget": budget.snapshot()}


def get_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "groq" and s.groq_api_key:
        return GroqProvider()
    return NoneProvider()

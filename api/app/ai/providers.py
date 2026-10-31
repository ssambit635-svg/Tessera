"""LLM adapters. The product must be fully usable with this module doing nothing.

`LLM_PROVIDER=none` (the default) keeps every call local and deterministic. When a Groq key
is configured the same endpoints may use the model to *read* text - never to decide
validity. Every provider call is wrapped in a timeout and falls back to the deterministic
parser on any error.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from ..config import get_settings

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

    def __init__(self) -> None:
        s = get_settings()
        self.api_key = s.groq_api_key
        self.model = s.groq_model
        self.fallback_model = s.groq_fallback_model
        self.base_url = s.groq_base_url.rstrip("/")
        self.timeout = s.llm_timeout

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
                {"role": "system", "content": EXTRACT_PROMPT},
                {"role": "user", "content": json.dumps({"request": text, "context": context},
                                                       ensure_ascii=False)},
            ],
        }
        started = time.time()
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(f"{self.base_url}/chat/completions", json=payload,
                               headers={"Authorization": f"Bearer {self.api_key}"})
            resp.raise_for_status()
            body = resp.json()
        return body["choices"][0]["message"]["content"], int((time.time() - started) * 1000)

    def extract(self, text: str, context: dict) -> LLMResult:
        import time

        started = time.time()
        last_error = ""
        for model in [self.model, self.fallback_model]:
            if not model:
                continue
            try:
                content, _ms = self._call(model, text, context)
                data = json.loads(content)
                if not isinstance(data, dict):
                    raise ValueError("model did not return an object")
                return LLMResult(ok=True, data=data, provider=self.name, model=model,
                                 latency_ms=int((time.time() - started) * 1000))
            except Exception as exc:                     # rate limit, timeout, bad json
                last_error = f"{type(exc).__name__}: {exc}"
        return LLMResult(ok=False, provider=self.name, error=last_error,
                         latency_ms=int((time.time() - started) * 1000))


def get_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "groq" and s.groq_api_key:
        return GroqProvider()
    return NoneProvider()

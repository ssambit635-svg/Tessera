"""A spend guard for the free LLM tier.

The Groq free tier is generous but finite: about 30 requests/minute and 1,000 requests/day
on the 70B model, 14,400/day on the 8B. A demo that retries twice on two models can burn
four requests for one sentence, so this module counts *every* attempt before it is made,
stores the counter in the database (a container restart must not reset the budget) and
refuses politely once the day's allowance is gone.

When the budget is exhausted the product does **not** break: every AI endpoint falls back
to the deterministic parser, which is the same code path used when no key is configured.

`snapshot()` is what the UI shows as "1,000/day · 12 used", and it never exposes the key.
"""
from __future__ import annotations

import threading
import time
from datetime import date, datetime, timezone

from ..config import get_settings

_KEY = "llm_budget"
_lock = threading.Lock()
_last_call_at: dict[str, float] = {}          # model -> monotonic seconds, for the RPM gap
_memory: dict[str, int] = {"date_ordinal": 0, "calls": 0, "denied": 0}


def _today() -> str:
    return date.today().isoformat()


def _limits() -> dict:
    s = get_settings()
    return {
        "primary_model": s.groq_model,
        "fallback_model": s.groq_fallback_model,
        "rpd_primary": int(getattr(s, "llm_rpd", 1000)),
        "rpd_fallback": int(getattr(s, "llm_rpd_fallback", 14400)),
        "rpm": int(getattr(s, "llm_rpm", 30)),
        "enabled": s.llm_enabled,
    }


# Last-resort counters. If the database cannot be read or written, the guard must still hold
# (a demo that ignores its own quota is worse than one that stops early), so the numbers are
# mirrored in process memory and `snapshot()` says which store is in charge.
_memory: dict = {"date": _today(), "calls": {}, "denied": 0}
_last_error: str | None = None


def _fresh() -> dict:
    return {"date": _today(), "calls": {}, "denied": 0}


def _roll(state: dict) -> dict:
    if state.get("date") != _today():
        return _fresh()
    return {"date": state["date"], "calls": dict(state.get("calls") or {}),
            "denied": int(state.get("denied") or 0)}


def _load() -> dict:
    """Today's counters, preferring the database so a restart cannot refill the budget."""
    global _last_error
    stored: dict | None = None
    try:
        from sqlmodel import Session as _Session

        from ..db import AppState, get_engine

        with _Session(get_engine()) as session:
            stored = AppState.get(session, _KEY) or {}
        _last_error = None
    except Exception as exc:                           # database not ready, or table missing
        _last_error = f"{type(exc).__name__}: {exc}"
        stored = None
    if stored is None:
        _memory.update(_roll(_memory))
        return _roll(_memory)
    state = _roll(stored)
    _memory.update(state)
    return state


def _save(state: dict) -> None:
    """Write through to the database; the in-memory mirror is always updated first."""
    global _last_error
    _memory.update(state)
    try:
        from sqlmodel import Session as _Session

        from ..db import AppState, get_engine

        with _Session(get_engine()) as session:
            AppState.put(session, _KEY, state)
        _last_error = None
    except Exception as exc:
        _last_error = f"{type(exc).__name__}: {exc}"
        try:                                            # tables may simply not exist yet
            from ..db import init_db

            init_db()
            from sqlmodel import Session as _Session2

            from ..db import AppState as _AppState, get_engine as _get_engine

            with _Session2(_get_engine()) as session:
                _AppState.put(session, _KEY, state)
            _last_error = None
        except Exception as exc2:                       # never let bookkeeping break a request
            _last_error = f"{type(exc2).__name__}: {exc2}"


def reserve(model: str) -> tuple[bool, str]:
    """Ask for permission to spend one provider request on `model`.

    Returns (allowed, reason). The counter is incremented *before* the call, so a crash in
    the middle can only over-count - which is the safe direction on a free tier.
    """
    limits = _limits()
    if not model:
        return False, "no model configured"
    # Only the *known* fallback model gets the larger 8B allowance. An unknown model name is
    # treated as the primary's quota - the safe direction when we cannot identify it.
    if model == limits["fallback_model"] and model != limits["primary_model"]:
        limit = limits["rpd_fallback"]
    else:
        limit = limits["rpd_primary"]

    with _lock:
        state = _load()
        used = int(state["calls"].get(model, 0))
        if used >= limit:
            state["denied"] = int(state.get("denied", 0)) + 1
            _save(state)
            return False, f"daily budget reached for {model} ({used}/{limit})"
        now = time.monotonic()
        last = _last_call_at.get(model, 0.0)
        gap = 0.0 if limits["rpm"] <= 0 else 60.0 / limits["rpm"]
        if gap and now - last < gap:
            return False, f"rate limit: {limits['rpm']} requests/minute - try again in {gap - (now - last):.1f}s"
        _last_call_at[model] = now
        state["calls"][model] = used + 1
        _save(state)
    return True, "ok"


def snapshot() -> dict:
    """Everything the UI and the self-test may show about the budget - never the key."""
    limits = _limits()
    state = _load()
    calls = state.get("calls") or {}
    primary_used = int(calls.get(limits["primary_model"], 0))
    fallback_used = int(calls.get(limits["fallback_model"], 0))
    return {
        "date": state.get("date") or _today(),
        "enabled": limits["enabled"],
        "primary_model": limits["primary_model"],
        "fallback_model": limits["fallback_model"],
        "requests_today": primary_used + fallback_used,
        "by_model": {limits["primary_model"]: primary_used,
                     limits["fallback_model"]: fallback_used},
        "remaining_primary": max(0, limits["rpd_primary"] - primary_used),
        "remaining_fallback": max(0, limits["rpd_fallback"] - fallback_used),
        "daily_limit": limits["rpd_primary"],
        "daily_limit_fallback": limits["rpd_fallback"],
        "per_minute_limit": limits["rpm"],
        "denied_today": int(state.get("denied") or 0),
        "storage": "database" if _last_error is None else "memory (database unavailable)",
        "storage_error": _last_error,
        "note": ("counted before every provider call, stored in the database, and reset at "
                 "midnight local time; when it runs out the deterministic parser takes over"),
    }


def reset_today() -> dict:
    """Admin convenience for a demo: forget today's counters (never touches the key)."""
    with _lock:
        _save({"date": _today(), "calls": {}, "denied": 0})
    return snapshot()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

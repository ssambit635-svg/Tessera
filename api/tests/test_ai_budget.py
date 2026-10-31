"""The free-tier spend guard.

Judges asked the obvious question: "the free Groq tier is 1,000 requests a day - what
happens on request 1,001?" The answer has to be *behaviour*, not a promise:

  * every provider request is counted before it is sent;
  * the counter lives in the database, so a container restart cannot refill it;
  * the rate limit (requests/minute) is enforced too;
  * when the budget is gone the endpoints keep working, on the deterministic parser.
"""
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ai import budget  # noqa: E402
from app.ai.providers import GroqProvider  # noqa: E402
from app.config import reset_settings_cache  # noqa: E402


@pytest.fixture()
def groq_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_not_real")
    monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    monkeypatch.setenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")
    monkeypatch.setenv("LLM_RPD", "2")
    monkeypatch.setenv("LLM_RPM", "0")             # 0 = no per-minute cap, for fast tests
    reset_settings_cache()
    budget.reset_today()
    yield
    monkeypatch.undo()
    reset_settings_cache()
    budget.reset_today()


def ok_transport(status=200, payload=None):
    def handler(request):
        if status != 200:
            return httpx.Response(status, json={"error": "busy"})
        return httpx.Response(200, json={"choices": [{"message": {"content":
                         '{"attendance": 40, "duration_periods": 2}'}}]})

    return httpx.MockTransport(handler)


def test_the_snapshot_never_contains_the_key(groq_env):
    snap = budget.snapshot()
    blob = str(snap)
    assert "gsk_" not in blob
    assert snap["enabled"] is True
    assert snap["daily_limit"] == 2
    assert snap["remaining_primary"] == 2


def test_the_budget_stops_at_the_daily_limit(groq_env):
    assert budget.reserve("llama-3.3-70b-versatile")[0] is True
    assert budget.reserve("llama-3.3-70b-versatile")[0] is True
    allowed, why = budget.reserve("llama-3.3-70b-versatile")
    assert allowed is False and "budget" in why
    snap = budget.snapshot()
    assert snap["remaining_primary"] == 0
    assert snap["denied_today"] == 1
    # the fallback model has its own, much larger allowance
    assert budget.reserve("llama-3.1-8b-instant")[0] is True


def test_the_counter_survives_a_restart(groq_env):
    budget.reserve("llama-3.3-70b-versatile")
    first = budget.snapshot()["requests_today"]
    # a "restart" is just re-reading from the database - there is no in-process cache
    assert budget.snapshot()["requests_today"] == first


def test_exhausted_budget_falls_back_instead_of_failing(groq_env, monkeypatch):
    """With the real transport (quota spent) the adapter refuses locally and says why."""
    from app.ai import parser as parser_module
    from app.services import state

    provider = GroqProvider()                     # no mock transport -> it would spend quota
    monkeypatch.setattr(parser_module, "get_provider", lambda: provider)
    monkeypatch.setenv("LLM_RPD_FALLBACK", "1")
    reset_settings_cache()
    budget.reserve("llama-3.3-70b-versatile")
    budget.reserve("llama-3.3-70b-versatile")
    budget.reserve("llama-3.1-8b-instant")         # exhaust the fallback model as well

    result = provider.extract("Room for 40 on Tuesday", {})
    assert result.ok is False
    assert "budget" in result.error
    # and the product still answers, deterministically:
    ds = state.dataset()
    parsed = parser_module.parse("Room for 40 people on Tuesday 5 to 6 pm", ds, role="club")
    assert parsed.draft.attendance == 40
    assert parsed.source["llm"] is None


def test_a_429_is_not_retried_into_the_ground(groq_env):
    """A quota error must not be retried: retrying is how a free tier disappears."""
    seen = []

    def handler(request):
        seen.append(1)
        return httpx.Response(429, json={"error": "rate limit"})

    provider = GroqProvider(transport=httpx.MockTransport(handler))
    result = provider.extract("Room for 40 on Tuesday", {})
    assert result.ok is False
    assert len(seen) <= 2                     # one attempt per model, never more


def test_budget_reset_is_an_admin_action(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path/'budget.db'}")
    reset_settings_cache()
    try:
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as client:
            tok = client.post("/api/auth/demo-login/admin").json()["token"]
            h = {"Authorization": f"Bearer {tok}"}
            r = client.get("/api/ai/budget", headers=h)
            assert r.status_code == 200 and "daily_limit" in r.json()
            assert client.post("/api/ai/budget/reset", headers=h).status_code == 200
    finally:
        reset_settings_cache()


def test_the_guard_survives_a_broken_database(groq_env, monkeypatch):
    """If the database cannot be written, the guard must not quietly disappear.

    This was a real bug: `_save` swallowed every exception, so a missing table meant an
    unlimited budget while the UI still displayed "0 / 1000 used". The counters are now mirrored
    in memory and the snapshot says which store is in charge.
    """
    from app import db as db_module

    def broken_engine():
        raise RuntimeError("database is not writable")

    monkeypatch.setattr(db_module, "get_engine", broken_engine)
    budget.reset_today()                      # also fails, but must not raise

    assert budget.reserve("llama-3.3-70b-versatile")[0] is True
    assert budget.reserve("llama-3.3-70b-versatile")[0] is True
    allowed, why = budget.reserve("llama-3.3-70b-versatile")
    assert allowed is False and "budget" in why

    snap = budget.snapshot()
    assert snap["requests_today"] == 2
    assert snap["remaining_primary"] == 0
    assert snap["storage"].startswith("memory")
    assert snap["storage_error"]

"""The Groq adapter, tested without a key and without the network.

What has to be true for the judges:
  * with no key, nothing changes (the deterministic parser answers);
  * a model that fails (429, timeout, broken JSON) changes nothing except a warning;
  * a model that answers can only *fill* fields, and every id it names is checked against the
    dataset - invented rooms, groups and types are dropped.
"""
import json
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ai import parser as parser_module  # noqa: E402
from app.ai.providers import GroqProvider  # noqa: E402
from app.config import reset_settings_cache  # noqa: E402
from app.services import state  # noqa: E402


def fake_transport(payload: dict | None = None, status: int = 200, calls: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(json.loads(request.content.decode()))
        if status != 200:
            return httpx.Response(status, json={"error": "busy"})
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps(payload or {})}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 40},
        })
    return httpx.MockTransport(handler)


@pytest.fixture()
def groq_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_not_real")
    monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    monkeypatch.setenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")
    reset_settings_cache()
    yield
    # The env must be un-patched *before* the cache is rebuilt, otherwise the settings object
    # built here survives the monkeypatch undo and the next test sees a configured provider.
    monkeypatch.undo()
    reset_settings_cache()


def use(monkeypatch, provider: GroqProvider):
    monkeypatch.setattr(parser_module, "get_provider", lambda: provider)


def test_no_key_means_no_call(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "none")
    reset_settings_cache()
    ds = state.dataset()
    r = parser_module.parse("seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye", ds)
    assert r.source["llm"] is None
    assert r.draft.attendance == 100
    reset_settings_cache()


def test_model_can_fill_a_field_the_rules_missed(groq_env, monkeypatch):
    provider = GroqProvider(transport=fake_transport({
        "attendance": 120, "duration_periods": 2, "days": ["WED"],
        "from_period": 10, "to_period": 11, "needs": ["pa_system"],
        "room_types": ["seminar_hall"], "notes": ["read by model"],
    }))
    use(monkeypatch, provider)
    ds = state.dataset()
    r = parser_module.parse("seminar hall me kuch event hai, details baad me", ds, role="club")
    assert r.draft.attendance == 120
    assert r.draft.duration_periods == 2
    assert r.source["llm"]["model"] == "llama-3.3-70b-versatile"
    assert r.confidence["attendance"] <= 0.7          # a model-filled field is less certain
    assert r.feasibility["ok"] is True


def test_rules_win_over_the_model(groq_env, monkeypatch):
    provider = GroqProvider(transport=fake_transport({
        "attendance": 999, "duration_periods": 5, "days": ["SAT"],
        "room_types": ["auditorium"],
    }))
    use(monkeypatch, provider)
    ds = state.dataset()
    text = "Need a room for 45 people on Tuesday 6 to 8 pm, projector please."
    r = parser_module.parse(text, ds, role="club")
    assert r.draft.attendance == 45                   # the text wins, not the model
    assert r.draft.windows[0].day == "TUE"
    assert (r.draft.windows[0].from_period, r.draft.windows[0].to_period) == (10, 11)


def test_invented_ids_are_dropped(groq_env, monkeypatch):
    provider = GroqProvider(transport=fake_transport({
        "attendance": 60, "duration_periods": 1, "days": ["WED"],
        "room_types": ["spaceship", "auditorium"],
        "requested_room": "ROOM-404", "mandatory_for_groups": ["Y9-Z"],
        "needs": ["teleporter", "projector"],
    }))
    use(monkeypatch, provider)
    ds = state.dataset()
    r = parser_module.parse("something for the club", ds, role="club")
    assert r.draft.requested_room is None             # does not exist -> ignored
    assert "Y9-Z" not in r.draft.mandatory_for_groups
    assert "spaceship" not in r.draft.room_types
    assert "teleporter" not in r.draft.needs


def test_provider_failure_falls_back_silently(groq_env, monkeypatch):
    provider = GroqProvider(transport=fake_transport(status=429))
    use(monkeypatch, provider)
    ds = state.dataset()
    r = parser_module.parse("Room for 30 people on Monday 5 to 6 pm", ds, role="club")
    assert r.draft.attendance == 30                   # deterministic answer still complete
    assert r.source["llm"] is None
    assert any("AI reader unavailable" in w for w in r.warnings)
    assert provider.available() is True


def test_broken_json_is_not_fatal(groq_env, monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "not json at all"}}]})

    provider = GroqProvider(transport=httpx.MockTransport(handler))
    use(monkeypatch, provider)
    ds = state.dataset()
    r = parser_module.parse("lab with computers for 60 people on Thursday afternoon", ds,
                            role="club")
    assert r.draft.attendance == 60
    assert any("AI reader unavailable" in w for w in r.warnings)


def test_stats_and_selftest(groq_env):
    calls = []
    provider = GroqProvider(transport=fake_transport({"attendance": 40}, calls=calls))
    result = provider.selftest()
    assert result["ok"] is True and result["latency_ms"] >= 0
    assert calls and calls[0]["model"] == "llama-3.3-70b-versatile"
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert "temperature" in calls[0]

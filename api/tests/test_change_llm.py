"""The change reader: Groq may *read*, the rule reader still *decides*.

The design under test
---------------------
`parse_change` first runs the deterministic reader. When a provider is configured it also
asks the model, but whatever comes back is normalised into a sentence and re-parsed by the
same deterministic code. So the model can only rescue a sentence the rules could not read;
it can never invent a session, a day or a period that our parser cannot re-derive.

What must hold:
  * no provider -> no call, identical result;
  * provider failure -> the rule-based read stands, one note explaining why;
  * provider success on an unclear sentence -> intent recovered, `source.llm` names the model;
  * provider success on a *clear* sentence -> the rule-based read is not overridden;
  * invented ids -> dropped, because the canonical sentence does not re-parse.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ai import change as change_module  # noqa: E402
from app.ai.providers import LLMResult  # noqa: E402
from app.services import state  # noqa: E402

FACULTY = "F33"


class StubProvider:
    name = "groq"

    def __init__(self, data=None, ok=True, error="", model="llama-3.3-70b-versatile"):
        self.data = data or {}
        self.ok = ok
        self.error = error
        self.model = model
        self.calls = 0

    def available(self):
        return True

    def read_change(self, text, context):
        self.calls += 1
        return LLMResult(ok=self.ok, data=self.data if self.ok else None, provider=self.name,
                         model=self.model if self.ok else "", error=self.error, latency_ms=173)


class NoProvider:
    name = "none"

    def available(self):
        return False

    def read_change(self, text, context):  # pragma: no cover - must never run
        raise AssertionError("the provider must not be called when it is unavailable")


def use(monkeypatch, provider):
    monkeypatch.setattr(change_module, "get_provider", lambda: provider)


def test_unclear_sentence_is_recovered_by_the_model(monkeypatch):
    ds = state.dataset()
    stub = StubProvider({"intent": "faculty_unavailable", "days": ["FRI"],
                         "from_period": 1, "to_period": 4})
    use(monkeypatch, stub)

    # the rule reader cannot tell what this is; the model can
    parsed = change_module.parse_change("kuch din ke liye schedule theek karna hai, classes dekh lena",
                                        ds, FACULTY)

    assert stub.calls == 1
    assert parsed["intent"] == "faculty_unavailable"
    assert parsed["days"] == ["FRI"]
    assert parsed["periods"] == [1, 2, 3, 4]
    assert parsed["source"]["provider"] == "groq"
    assert parsed["source"]["llm"] == "llama-3.3-70b-versatile"
    assert parsed["source"]["read_as"].startswith("not available on")
    # and the change file the engine consumes is still built by our code
    assert parsed["changes"][0]["type"] == "faculty_unavailable"


def test_model_failure_leaves_the_rule_read_in_place(monkeypatch):
    ds = state.dataset()
    use(monkeypatch, StubProvider(ok=False, error="provider busy (429)"))

    parsed = change_module.parse_change("I am out on Friday", ds, FACULTY)

    assert parsed["intent"] == "faculty_unavailable"
    assert parsed["source"]["provider"] == "deterministic"
    assert "429" in parsed["source"]["model_error"]
    assert any("could not read" in note for note in parsed["notes"])


def test_model_cannot_override_a_confident_rule_read(monkeypatch):
    ds = state.dataset()
    # the model disagrees and names a day the message never mentioned
    use(monkeypatch, StubProvider({"intent": "faculty_unavailable", "days": ["MON"]}))

    parsed = change_module.parse_change("I am out on Friday", ds, FACULTY)

    assert parsed["days"] == ["FRI"]          # the sentence wins, not the model
    assert parsed["source"]["llm"]              # …but we still record who was asked


def test_invented_course_is_dropped(monkeypatch):
    ds = state.dataset()
    use(monkeypatch, StubProvider({"intent": "move_session", "days": ["WED"],
                                   "from_period": 3, "course_id": "XX999"}))

    parsed = change_module.parse_change("please shift my class", ds, FACULTY)

    # XX999 is not a course this faculty teaches, so the canonical sentence does not re-parse
    assert parsed["intent"] == "clarify"
    assert parsed["missing"]
    assert not parsed["changes"]


def test_no_provider_means_no_call(monkeypatch):
    ds = state.dataset()
    use(monkeypatch, NoProvider())

    parsed = change_module.parse_change("I am out on Friday", ds, FACULTY)

    assert parsed["intent"] == "faculty_unavailable"
    assert parsed["source"] == {"provider": "deterministic", "llm": None}


def test_allow_llm_false_skips_the_model(monkeypatch):
    ds = state.dataset()
    stub = StubProvider({"intent": "faculty_unavailable", "days": ["FRI"]})
    use(monkeypatch, stub)

    parsed = change_module.parse_change("I am out on Friday", ds, FACULTY, allow_llm=False)

    assert stub.calls == 0
    assert parsed["source"]["llm"] is None


@pytest.mark.parametrize("data,expected", [
    ({"intent": "faculty_unavailable", "days": ["fri"]}, "not available on FRI"),
    ({"intent": "move_session", "days": ["WED"], "course_id": "cs203", "from_period": 3},
     "move CS203 to WED P3"),
    ({"intent": "add_session", "days": ["THU"], "course_id": "CS203", "from_period": 6,
      "to_period": 7}, "extra class for CS203 on THU P6-P7"),
    ({"intent": "clarify"}, None),
    ({"intent": "faculty_unavailable"}, None),
])
def test_canonical_sentence_builder(data, expected):
    assert change_module._canonical_from_model(data) == expected

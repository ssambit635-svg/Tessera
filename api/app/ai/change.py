"""Faculty change requests in plain language: "I'm out on Friday" / "move my CS203 class".

The model, if one is configured, only helps *read* this text. What happens next is arithmetic:
the sentence becomes a change file (or a single pinned move), the repair engine checks it, and
the result is a proposal that a second admin has to approve. Nothing here can bypass a rule.

Supported intents
-----------------
faculty_unavailable  "I can't come Monday", "leave on Friday and Saturday", "out of station TUE P1-P4"
move_session         "move my CS203 lecture to Wednesday P3", "shift CS203 to THU 2nd period"
add_session          "extra CS203 class on Friday P6, lab"
clarify              everything else, with the exact missing piece in `missing`
"""
from __future__ import annotations

import re

from ..core.dataset import Dataset
from . import normalizer as nz

UNAVAILABLE_WORDS = [
    "can't come", "cannot come", "cant come", "not available", "unavailable", "leave",
    "chutti", "out of station", "out of town", "sick", "ill ", "medical", "conference",
    "won't be there", "wont be there", "no class", "busy that day",
]
MOVE_WORDS = ["move", "shift", "reschedule", "prepone", "postpone", "change the time",
              "change timing", "badal", "aage", "peeche", "clash"]
ADD_WORDS = ["extra class", "extra session", "makeup", "make-up", "add a class", "add class",
             "arrange a class", "extra lecture", "compensate", "cover the syllabus"]

COURSE_RE = re.compile(r"\b([A-Z]{2,3}\s?-?\s?\d{3})\b")


def _course_id(text: str) -> str | None:
    m = COURSE_RE.search(text.upper())
    return m.group(1).replace(" ", "").replace("-", "") if m else None


def _sessions_for(ds: Dataset, faculty_id: str, course_id: str | None,
                  kind: str | None) -> list[dict]:
    out = [s for s in ds.sessions.values() if s["faculty_id"] == faculty_id]
    if course_id:
        out = [s for s in out if s["course_id"].upper() == course_id]
    if kind:
        out = [s for s in out if s["kind"] == kind]
    return sorted(out, key=lambda s: s["id"])


def _kind_word(text: str) -> str | None:
    if nz._has(text, "lab") or nz._has(text, "practical"):
        return "lab"
    if nz._has(text, "tutorial"):
        return "tutorial"
    if nz._has(text, "lecture"):
        return "lecture"
    return None


def _periods(text: str, ds: Dataset) -> list[int]:
    start, end, _ev = nz.find_time_window(text, ds.periods)
    if start is None:
        return list(range(1, ds.max_period + 1))
    end = end if end is not None else start
    return list(range(start, min(end, ds.max_period) + 1))


def parse_change(text: str, ds: Dataset, faculty_id: str, *, tomorrow: str | None = None,
                 today: str | None = None) -> dict:
    raw = nz._norm(text)
    days = nz.find_days(raw, ds.days, tomorrow=tomorrow, today=today)
    periods = _periods(raw, ds)
    course = _course_id(raw)
    kind = _kind_word(raw)
    faculty = ds.faculty.get(faculty_id)
    out: dict = {
        "intent": "clarify",
        "faculty_id": faculty_id,
        "faculty_name": (faculty or {}).get("name", faculty_id),
        "days": days,
        "periods": periods,
        "course_id": course,
        "kind": kind,
        "changes": [],
        "pins": {},
        "target": None,
        "notes": [],
        "missing": [],
        "confidence": {},
    }
    if faculty is None:
        out["missing"].append(f"{faculty_id} is not a faculty member in this dataset")
        return out

    wants_unavailable = any(nz._has(raw, w) for w in UNAVAILABLE_WORDS)
    wants_move = any(nz._has(raw, w) for w in MOVE_WORDS)
    wants_add = any(nz._has(raw, w) for w in ADD_WORDS)

    if wants_move:
        candidates = _sessions_for(ds, faculty_id, course, kind)
        if not candidates:
            out["missing"].append(
                f"which session? {faculty_id} teaches " +
                ", ".join(sorted({s["course_id"] for s in ds.sessions.values()
                                  if s["faculty_id"] == faculty_id}))[:200])
            return out
        if len(candidates) > 1 and not course:
            out["missing"].append("which course/session should move? candidates: " +
                                  ", ".join(f"{s['id']} ({s['course_id']} {s['kind']})"
                                            for s in candidates[:6]))
            out["candidates"] = [s["id"] for s in candidates]
            return out
        session = candidates[0]
        if not days:
            out["missing"].append("move it to which day?")
            return out
        start = periods[0]
        out["intent"] = "move_session"
        out["target"] = {"session_id": session["id"], "course_id": session["course_id"],
                         "day": days[0], "start_period": start,
                         "duration": session["duration"]}
        out["pins"] = {session["id"]: (days[0], start)}
        out["confidence"] = {"session": 0.9 if course else 0.6,
                             "day": 0.9, "period": 0.75 if start else 0.3}
        out["notes"].append(f"moving {session['id']} ({session['course_id']} "
                            f"{session['kind']}) to {days[0]} P{start}")
        return out

    if wants_add:
        if not course:
            out["missing"].append("for which course is the extra class?")
            return out
        if not days:
            out["missing"].append("on which day should the extra class be?")
            return out
        session = (_sessions_for(ds, faculty_id, course, kind) or
                   _sessions_for(ds, faculty_id, course, None))
        if not session:
            out["missing"].append(f"{faculty_id} does not teach {course}")
            return out
        template = dict(session[0])
        new_id = f"{template['id']}-EX1"
        extra = dict(template)
        extra.update({
            "id": new_id,
            "fixed_slot": {"day": days[0], "start_period": periods[0]},
            "basket_slot": None,
        })
        out["intent"] = "add_session"
        out["changes"] = [{"type": "add_session", "session": extra}]
        out["target"] = {"session_id": new_id, "course_id": course, "day": days[0],
                         "start_period": periods[0]}
        out["confidence"] = {"course": 0.85, "day": 0.9, "period": 0.75}
        out["notes"].append(f"new session {new_id} pinned at {days[0]} P{periods[0]}")
        return out

    if wants_unavailable:
        if not days:
            out["missing"].append("which day(s) are you unavailable?")
            return out
        reason = "marked unavailable by " + (faculty.get("name") or faculty_id)
        out["intent"] = "faculty_unavailable"
        out["changes"] = [{"type": "faculty_unavailable", "faculty_id": faculty_id,
                           "days": days, "periods": periods, "reason": reason}]
        out["confidence"] = {"days": 0.9, "periods": 0.8 if len(periods) < ds.max_period else 0.6}
        if len(periods) < ds.max_period:
            out["notes"].append(f"only P{periods[0]}-P{periods[-1]} on "
                                f"{', '.join(days)} are affected, not the whole day")
        return out

    out["missing"].append("I could not tell what you want: mark yourself unavailable, "
                          "move a class, or add an extra one?")
    return out


def summarise(parsed: dict) -> str:
    """One sentence a faculty member can read, built from the parsed intent."""
    intent = parsed["intent"]
    if intent == "faculty_unavailable":
        return (f"{parsed['faculty_name']} unavailable on {', '.join(parsed['days'])} "
                f"for periods {parsed['periods'][0]}-{parsed['periods'][-1]}.")
    if intent == "move_session":
        t = parsed["target"]
        return f"Move {t['session_id']} ({t['course_id']}) to {t['day']} P{t['start_period']}."
    if intent == "add_session":
        t = parsed["target"]
        return (f"Add an extra {parsed['course_id']} session on {t['day']} "
                f"P{t['start_period']}.")
    return "I need one more detail before this can be checked."

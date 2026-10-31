"""Turn a free-text request into a structured, editable booking draft - safely.

Order of operations:
  1. deterministic normaliser (always runs, always available);
  2. optional LLM extraction, merged in only where the rules found nothing;
  3. every value is checked against the dataset (room ids, group ids, periods, capacity);
  4. feasibility is computed by the same kernel the solver uses - never by a model;
  5. anything guessed is returned as an explicit assumption, not silently applied.
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from ..core.constraints import booking_room_ok, inside_window
from ..core.dataset import CAT_WEIGHT, Dataset
from . import normalizer as nz
from .providers import get_provider


class Window(BaseModel):
    day: str
    from_period: int
    to_period: int


class Assumption(BaseModel):
    field: str
    value: object
    why: str


class BookingDraft(BaseModel):
    title: str | None = None
    attendance: int | None = None
    duration_periods: int | None = None
    windows: list[Window] = Field(default_factory=list)
    needs: list[str] = Field(default_factory=list)
    room_types: list[str] = Field(default_factory=list)
    requested_room: str | None = None
    mandatory_for_groups: list[str] = Field(default_factory=list)
    requested_category: str | None = None
    role: str = "club"


class ParseResult(BaseModel):
    draft: BookingDraft
    confidence: dict[str, float]
    assumptions: list[Assumption]
    follow_up: str | None
    notes: list[str]
    warnings: list[str]
    feasibility: dict
    source: dict


def _tomorrow(ds: Dataset, today: date | None = None) -> str:
    today = today or date.today()
    for offset in range(1, 8):
        candidate = date.fromordinal(today.toordinal() + offset)
        name = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][candidate.weekday()]
        if name in ds.days:
            return name
    return ds.days[0]


def parse(text: str, ds: Dataset, role: str = "club", *, allow_llm: bool = True,
          today: date | None = None) -> ParseResult:
    raw = nz._norm(text)
    assumptions: list[Assumption] = []
    notes: list[str] = []
    warnings: list[str] = []
    confidence: dict[str, float] = {}

    # ---------------------------------------------------------------- rules pass
    attendance, attendance_ev = nz.find_attendance(raw)
    duration, duration_ev = nz.find_duration(raw)
    day, day_ev = nz.find_day(raw, ds.days, tomorrow=_tomorrow(ds, today))
    start, end, time_ev = nz.find_time_window(raw, ds.periods)
    needs = nz.find_needs(raw)
    room_types = nz.find_room_types(raw)
    requested_room = nz.find_room_mention(raw, ds)
    groups = nz.find_groups(raw, ds)
    category = nz.find_category(raw)
    compulsory = nz.find_compulsory(raw)
    vague = nz.vague_fields(raw)

    # ---------------------------------------------------------------- optional LLM
    provider = get_provider()
    llm_used = None
    if allow_llm and provider.available():
        result = provider.extract(text, {"days": ds.days, "role": role})
        if result.ok and result.data:
            llm_used = {"provider": result.provider, "model": result.model,
                        "latency_ms": result.latency_ms}
            data = result.data
            if attendance is None and isinstance(data.get("attendance"), int):
                attendance = data["attendance"]
                attendance_ev = "llm"
            if duration is None and isinstance(data.get("duration_periods"), int):
                duration = data["duration_periods"]
                duration_ev = "llm"
            if day is None and data.get("days"):
                candidate = str(data["days"][0]).upper()[:3]
                if candidate in ds.days:
                    day, day_ev = candidate, "llm"
            if start is None and isinstance(data.get("from_period"), int):
                start = data["from_period"]
                end = data.get("to_period") if isinstance(data.get("to_period"), int) else None
                time_ev = "llm"
            for need in data.get("needs") or []:
                if need in {"projector", "pa_system", "stage", "computers", "accessible",
                            "power_benches", "ac"} and need not in needs:
                    needs.append(need)
            for room_type in data.get("room_types") or []:
                if room_type in ds.rooms and room_type not in room_types:
                    room_types.append(room_type)
                elif room_type in {r["type"] for r in ds.rooms.values()} and room_type not in room_types:
                    room_types.append(room_type)
            if requested_room is None and data.get("requested_room") in ds.rooms:
                requested_room = data["requested_room"]
            for gid in data.get("mandatory_for_groups") or []:
                if gid in ds.groups and gid not in groups:
                    groups.append(gid)
            if category is None and data.get("requested_category") in CAT_WEIGHT:
                category = data["requested_category"]
        else:
            warnings.append("AI reader unavailable - the deterministic parser handled this request")
            notes.append(result.error)

    # ---------------------------------------------------------------- assemble
    if duration is None and start is not None and end is not None and end > start:
        duration = end - start + 1
        assumptions.append(Assumption(field="duration_periods", value=duration,
                                      why=f"taken from the stated window {time_ev}"))
    elif duration is None:
        duration = 2 if (start is not None and end is None) else 1
        if start is None:
            duration = None
        else:
            assumptions.append(Assumption(field="duration_periods", value=duration,
                                          why="no length stated; assumed a typical 2-hour evening slot"
                                          if duration == 2 else "no length stated; assumed one period"))

    windows: list[Window] = []
    if day and start is not None:
        end_period = end if end is not None else (start + (duration or 1) - 1)
        windows.append(Window(day=day, from_period=start, to_period=end_period))
        if end is None:
            assumptions.append(Assumption(
                field="windows", value=f"{day} P{start}-P{end_period}",
                why=f"\u201c{time_ev}\u201d on {day} - the window is the rest of that part of the day"))
    elif day and start is None:
        # a day but no time: propose the evening event window
        windows.append(Window(day=day, from_period=10, to_period=13))
        assumptions.append(Assumption(
            field="windows", value=f"{day} P10-P13",
            why="a day was given but no time; proposed the evening event window (18:00-21:00)"))

    if attendance is None:
        warnings.append("attendance was not stated - this is required before a room can be chosen")

    if requested_room and requested_room in ds.rooms and not room_types:
        room_types = [ds.rooms[requested_room]["type"]]
    if not room_types:
        if "computers" in needs:
            room_types = ["lab_cs"]
        elif "stage" in needs:
            room_types = ["auditorium", "outdoor", "seminar_hall"]
        else:
            room_types = ["classroom", "lecture_hall", "seminar_hall"]
        assumptions.append(Assumption(field="room_types", value=room_types,
                                      why="no venue type named; considered every general teaching space"))
    elif room_types == ["classroom"] and not requested_room:
        room_types = ["classroom", "lecture_hall", "seminar_hall"]
        assumptions.append(Assumption(field="room_types", value=room_types,
                                      why="only \u201ca room\u201d was asked for, so every general "
                                          "teaching space was considered"))

    if compulsory and groups:
        notes.append(f"marked compulsory for {', '.join(groups)} - their classes block this slot")
    elif groups and not compulsory:
        assumptions.append(Assumption(
            field="mandatory_for_groups", value=groups,
            why="the request names these students; treat their timetable as blocking unless told otherwise"))

    # ---------------------------------------------------------------- sanity checks
    if duration is not None and duration > 9:
        warnings.append(f"a {duration}-period booking is longer than a teaching day")
    if requested_room and requested_room not in ds.rooms:
        warnings.append(f"room {requested_room} does not exist in the dataset")
        requested_room = None

    if requested_room:
        room = ds.rooms[requested_room]
        if attendance and room["capacity"] < attendance:
            warnings.append(f"{requested_room} seats {room['capacity']} but {attendance} are expected")
        missing = set(needs) - ds.room_features(room)
        if missing:
            warnings.append(f"{requested_room} lacks {sorted(missing)}")
        if room_types and room["type"] not in room_types:
            warnings.append(f"{requested_room} is a {room['type']}, not {room_types}")
        if windows and windows[0].day in ds.days:
            w = windows[0]
            blocked = [p for p in range(w.from_period, min(w.to_period, ds.max_period) + 1)
                       if (w.day, p) in ds.room_unavailable[requested_room]]
            if blocked:
                warnings.append(f"{requested_room} is unavailable {w.day} P{blocked}")

    # ---------------------------------------------------------------- feasibility
    feasibility = _feasibility(ds, attendance, duration, windows, needs, room_types, requested_room, groups)

    # ---------------------------------------------------------------- confidence
    confidence["attendance"] = 0.95 if attendance_ev and attendance_ev != "llm" else (0.7 if attendance else 0.0)
    confidence["duration_periods"] = 0.9 if duration_ev and duration_ev != "llm" else (0.6 if duration else 0.0)
    confidence["day"] = 0.9 if day_ev and day_ev != "llm" else (0.6 if day else 0.0)
    confidence["window"] = 0.85 if time_ev and time_ev != "llm" else (0.5 if windows else 0.0)
    confidence["attendance"] *= 0.75 if vague else 1.0
    confidence["needs"] = 0.8 if needs else 0.4
    confidence["room_types"] = 0.85 if needs or room_types else 0.4

    # ---------------------------------------------------------------- follow-up
    follow_up = _follow_up(attendance, duration, windows, vague)

    draft = BookingDraft(
        title=_title(text), attendance=attendance, duration_periods=duration,
        windows=windows, needs=sorted(set(needs)), room_types=room_types,
        requested_room=requested_room, mandatory_for_groups=groups,
        requested_category=category, role=role,
    )
    return ParseResult(
        draft=draft, confidence={k: round(v, 2) for k, v in confidence.items()},
        assumptions=assumptions, follow_up=follow_up, notes=notes, warnings=warnings,
        feasibility=feasibility,
        source={"provider": "deterministic", "llm": llm_used},
    )


def _title(text: str) -> str | None:
    cleaned = " ".join(text.split())
    return (cleaned[:90] + "...") if len(cleaned) > 93 else cleaned or None


def _follow_up(attendance, duration, windows, vague) -> str | None:
    if attendance is None:
        return "How many people are expected? The room has to seat all of them."
    if not windows:
        return "Which day and time should this be? Evening events can use 18:00-21:00."
    if duration is None:
        return "How long is the event?"
    if vague and attendance:
        return (f"I read \u201caround {attendance}\u201d as {attendance} - is that the maximum, "
                f"or should I keep room for more?")
    return None


def _feasibility(ds: Dataset, attendance, duration, windows, needs, room_types,
                 requested_room, groups) -> dict:
    """What the rules - not a model - say about this draft."""
    out: dict = {"ok": False, "candidate_rooms": [], "conflicts": [], "best_slots": [],
                 "note": ""}
    if attendance is None or duration is None or not windows:
        out["note"] = "not enough information to check yet"
        return out

    probe = {
        "attendance": attendance, "duration_periods": duration,
        "room_types": room_types or ["classroom", "lecture_hall", "seminar_hall"],
        "needs": needs or [], "windows": [w.model_dump() for w in windows],
        "mandatory_for_groups": groups or [],
    }
    candidates = []
    for room in ds.rooms.values():
        if booking_room_ok(ds, probe, room):
            candidates.append(room["id"])
    out["candidate_rooms"] = candidates

    if not candidates:
        biggest = max((r["capacity"] for r in ds.rooms.values()), default=0)
        if attendance > biggest:
            out["conflicts"].append(
                f"no venue seats {attendance}; the largest room on campus holds {biggest}")
        else:
            typed = [r for r in ds.rooms.values() if r["type"] in probe["room_types"]]
            missing = set(probe["needs"]) - (ds.room_features(typed[0]) if typed else set())
            out["conflicts"].append(
                "no room of that type has the required features"
                if missing else "no room matches type, capacity and features together")
        out["note"] = "the request cannot be satisfied as written"
        return out

    w = windows[0]
    slots = []
    for room_id in candidates:
        for period in range(w.from_period, w.to_period + 1):
            end = period + duration - 1
            if end > ds.max_period:
                continue
            if any((w.day, p) in ds.room_unavailable[room_id] for p in range(period, end + 1)):
                continue
            slots.append({"room_id": room_id, "day": w.day, "start_period": period,
                          "end_period": end})
    out["best_slots"] = slots[:8]
    if requested_room and requested_room not in candidates and requested_room in ds.rooms:
        room = ds.rooms[requested_room]
        if room["capacity"] < attendance:
            out["conflicts"].append(f"{requested_room} seats {room['capacity']}, request needs {attendance}")
        missing = set(probe["needs"]) - ds.room_features(room)
        if missing:
            out["conflicts"].append(f"{requested_room} does not have {sorted(missing)}")
        if room["type"] not in probe["room_types"]:
            out["conflicts"].append(f"{requested_room} is a {room['type']}, not {probe['room_types']}")
        alternatives = [c for c in candidates if c != requested_room][:3]
        if alternatives:
            out["conflicts"].append(
                f"suggest instead: {', '.join(alternatives)}")
    out["ok"] = bool(slots) and not out["conflicts"]
    out["note"] = "matches the rules" if out["ok"] else "needs a change before it can be approved"
    return out

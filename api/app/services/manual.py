"""Manual event booking - the path that must keep working when the LLM does not.

An ad-hoc event is not one of the organisers' 25 Spectra requests, so it must never leak into
`exports/schedule.json` (the validator would see an unknown request id). It lives beside the
fest-week decisions instead: checked against the same kernel rules, shown in room
availability, and visible in the dashboard.

Everything here is plain arithmetic over the current timetable - no model, no guessing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Text
from sqlmodel import Field, Session, SQLModel, select

from ..config import get_settings
from ..core.constraints import booking_room_ok
from ..core.dataset import CAT_WEIGHT, Dataset
from ..db import audit


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AdhocEvent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = Field(default="")
    requester: str = Field(default="")
    role: str = Field(default="")
    category: str = Field(default="club_event")
    day: str = Field(default="")
    start_period: int = Field(default=0)
    end_period: int = Field(default=0)
    room_id: str = Field(default="")
    attendance: int = Field(default=0)
    needs: str = Field(default="", sa_column=Column(Text))       # comma separated
    groups: str = Field(default="", sa_column=Column(Text))      # mandatory for these groups
    note: str = Field(default="", sa_column=Column(Text))
    status: str = Field(default="confirmed")                     # confirmed | cancelled
    created_at: datetime = Field(default_factory=utcnow)


def as_dict(e: AdhocEvent) -> dict:
    return {
        "id": e.id, "title": e.title, "requester": e.requester, "role": e.role,
        "category": e.category, "day": e.day, "start_period": e.start_period,
        "end_period": e.end_period, "room_id": e.room_id, "attendance": e.attendance,
        "needs": [n for n in e.needs.split(",") if n], "groups": [g for g in e.groups.split(",") if g],
        "note": e.note, "status": e.status, "created_at": e.created_at.isoformat(),
        "scored_export": False,
    }


# --------------------------------------------------------------------------- occupancy
def occupancy(ds: Dataset, schedule: dict, events: list[AdhocEvent]) -> dict[tuple[str, int, str], str]:
    """(day, period, room) -> what is using it. Classes and Spectra decisions both count."""
    busy: dict[tuple[str, int, str], str] = {}
    for row in schedule.get("sessions") or []:
        sess = ds.sessions.get(row["session_id"])
        if sess is None:
            continue
        end = row["start_period"] + sess["duration"] - 1
        for p in range(row["start_period"], end + 1):
            busy[(row["day"], p, row["room_id"])] = f"class {sess['course_id']} ({sess['id']})"
    for d in (schedule.get("fest_week") or {}).get("bookings", []):
        if d.get("status") not in ("approved", "alternative_offered") or not d.get("room_id"):
            continue
        for p in range(d.get("start_period") or 0, (d.get("end_period") or 0) + 1):
            busy[(d["day"], p, d["room_id"])] = f"Spectra booking {d['request_id']}"
    for e in events:
        if e.status != "confirmed":
            continue
        for p in range(e.start_period, e.end_period + 1):
            busy[(e.day, p, e.room_id)] = f"event {e.id} ({e.title})"
    return busy


def group_busy(ds: Dataset, schedule: dict, day: str, start: int, end: int) -> dict[str, str]:
    """group -> session id, for groups already in class in that slot."""
    out = {}
    for row in schedule.get("sessions") or []:
        if row["day"] != day:
            continue
        sess = ds.sessions.get(row["session_id"])
        if sess is None:
            continue
        s_end = row["start_period"] + sess["duration"] - 1
        if s_end < start or row["start_period"] > end:
            continue
        for g in sess["groups"]:
            out[g] = row["session_id"]
    return out


def _clash(ds: Dataset, req: dict, busy: dict[tuple[str, int, str], str],
           day: str, start: int, end: int, room_id: str) -> list[str]:
    problems = []
    for p in range(start, end + 1):
        if (day, p) in ds.room_unavailable[room_id]:
            problems.append(f"{room_id} is closed for maintenance on {day} P{p}")
        used = busy.get((day, p, room_id))
        if used:
            problems.append(f"{room_id} is already used on {day} P{p} by {used}")
    if room_id not in ds.rooms:
        problems.append(f"{room_id} is not a room in this dataset")
    return problems


def evaluate(ds: Dataset, schedule: dict, events: list[AdhocEvent], req: dict) -> dict:
    """Try to place a manual event; never mutate anything."""
    req = {
        "attendance": int(req["attendance"]),
        "duration_periods": int(req["duration_periods"]),
        "needs": list(req.get("needs") or []),
        "room_types": list(req.get("room_types") or []),
        "windows": list(req.get("windows") or []),
        "mandatory_for_groups": list(req.get("mandatory_for_groups") or []),
    }
    missing = [k for k in ("attendance", "duration_periods", "windows") if not req.get(k)]
    if missing:
        return {"ok": False, "reason": "missing " + ", ".join(missing), "conflicts": [],
                "candidates": []}
    if req["attendance"] <= 0:
        return {"ok": False, "reason": "attendance must be a positive number",
                "conflicts": [], "candidates": []}

    known_types = sorted({r["type"] for r in ds.rooms.values()})
    if not req["room_types"]:
        # default: every venue type that can host an event (labs cannot)
        req["room_types"] = sorted({r["type"] for r in ds.rooms.values()
                                    if "event" in r.get("allowed_uses", [])})
    unknown_types = [t for t in req["room_types"] if t not in known_types]
    if unknown_types:
        return {"ok": False, "conflicts": [],
                "reason": f"{unknown_types} are not room types in this dataset (have: {known_types})",
                "candidates": []}

    biggest = max((r["capacity"] for r in ds.rooms.values()), default=0)
    req["room_types"] = [t for t in req["room_types"] if t in known_types]
    usable = [r for r in ds.rooms.values() if booking_room_ok(ds, req, r)]
    if req["attendance"] > biggest:
        return {"ok": False, "conflicts": [f"no room seats {req['attendance']}; the largest holds {biggest}"],
                "reason": f"no venue seats {req['attendance']} people - reject with this reason",
                "candidates": []}
    if not usable:
        return {"ok": False, "reason": "no room matches the type, capacity and needs",
                "conflicts": [f"need {req['attendance']} seats with {req['needs'] or 'no extra features'} "
                              f"among {req['room_types']}"], "candidates": []}

    mandatory = list(req.get("mandatory_for_groups") or [])
    unknown = [g for g in mandatory if g not in ds.groups]
    if unknown:
        return {"ok": False, "conflicts": [f"unknown group(s): {unknown}"],
                "reason": "a mandatory group in the request does not exist in this dataset",
                "candidates": []}

    busy = occupancy(ds, schedule, events)
    candidates, conflicts = [], []
    for room in sorted(usable, key=lambda r: (r["capacity"], r["id"])):
        for w in req["windows"]:
            day, from_p, to_p = w.get("day"), int(w.get("from_period") or 0), int(w.get("to_period") or 0)
            if day not in ds.days:
                conflicts.append(f"{day} is not a teaching day")
                continue
            for start in range(from_p, to_p + 1):
                end = start + req["duration_periods"] - 1
                if end > to_p or end > ds.max_period:
                    continue
                if within_lunch(ds, start, end):
                    continue
                problems = _clash(ds, req, busy, day, start, end, room["id"])
                if mandatory:
                    hit = [g for g in mandatory if g in group_busy(ds, schedule, day, start, end)]
                    if hit:
                        problems.append(f"{', '.join(hit)} already have a class on {day} "
                                        f"P{start}-P{end}; a mandatory event may not clash")
                if problems:
                    conflicts.extend(problems)
                    continue
                candidates.append({"day": day, "start_period": start, "end_period": end,
                                   "room_id": room["id"], "capacity": room["capacity"]})
    # keep the cheapest good slot per room, sorted by capacity then day/period
    best = {}
    for c in candidates:
        key = c["room_id"]
        if key not in best:
            best[key] = c
    ordered = sorted(best.values(), key=lambda c: (c["capacity"], ds.days.index(c["day"]),
                                                   c["start_period"]))
    bad_days = [w.get("day") for w in req["windows"] if w.get("day") not in ds.days]
    return {
        "ok": bool(ordered),
        "reason": None if ordered else (
            f"{bad_days[0]} is not a teaching day (this dataset has {', '.join(ds.days)})"
            if bad_days else "every matching room is busy in the requested windows"),
        "conflicts": [] if ordered else sorted(set(conflicts))[:8],
        "candidates": ordered[:8],
        "room_types": req["room_types"],
    }


def within_lunch(ds: Dataset, start: int, end: int) -> bool:
    return start <= ds.lunch_after < end


def schedule_event(session: Session, ds: Dataset, schedule: dict, req: dict,
                   actor: dict) -> dict:
    """Check, then persist. `actor` is {email, role}."""
    events = list_events(session)
    result = evaluate(ds, schedule, events, req)
    if not result["ok"]:
        return {"created": None, "check": result}
    pick = result["candidates"][0]
    requested_room = (req.get("room_id") or "").strip()
    if requested_room:
        for c in result["candidates"]:
            if c["room_id"] == requested_room:
                pick = c
                break
    role_cap = ds.role_cap.get(actor["role"], "club_event")
    requested_category = req.get("category") or role_cap
    order = ds.priority_order
    effective = requested_category if (
        requested_category in CAT_WEIGHT and order.index(requested_category) >= order.index(role_cap
        if role_cap in order else "club_event")) else role_cap
    event = AdhocEvent(
        id=f"EV-{uuid.uuid4().hex[:6]}",
        title=(req.get("title") or "Untitled event").strip()[:120],
        requester=actor["email"], role=actor["role"], category=effective,
        day=pick["day"], start_period=pick["start_period"], end_period=pick["end_period"],
        room_id=pick["room_id"], attendance=int(req["attendance"]),
        needs=",".join(req.get("needs") or []),
        groups=",".join(req.get("mandatory_for_groups") or []),
        note=(req.get("note") or "").strip(),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    audit(session, actor["email"], actor["role"], "manual_event",
          f"{event.id} {event.title} -> {event.day} P{event.start_period}-{event.end_period} "
          f"in {event.room_id}")
    return {"created": as_dict(event), "check": result,
            "category_note": (None if effective == requested_category else
                              f"capped by role '{actor['role']}' to {effective}"),
            "warning": "this event is not part of exports/schedule.json - it is an in-app booking "
                       "on top of the scored timetable"}


def list_events(session: Session, include_cancelled: bool = True) -> list[AdhocEvent]:
    rows = list(session.exec(select(AdhocEvent).order_by(AdhocEvent.created_at.desc())).all())
    return rows if include_cancelled else [r for r in rows if r.status == "confirmed"]


def cancel(session: Session, event_id: str, actor: str) -> bool:
    row = session.get(AdhocEvent, event_id)
    if row is None or row.status == "cancelled":
        return False
    row.status = "cancelled"
    session.add(row)
    session.commit()
    audit(session, actor, "user", "cancel_event", f"{event_id} cancelled")
    return True

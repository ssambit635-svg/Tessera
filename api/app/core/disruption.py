"""Apply a change file to a dataset.

Supports every change type the organisers' validator supports, and is deliberately
strict: a change that names an unknown faculty member, room or session raises instead of
being silently dropped (a silently dropped change means the judge's test looks like it
passed while nothing happened).
"""
from __future__ import annotations

import copy

from .dataset import Dataset

CHANGE_TYPES = {
    "faculty_unavailable",
    "room_unavailable",
    "add_faculty",
    "add_session",
    "remove_session",
}


def apply_changes(ds: Dataset, changes: list[dict]) -> tuple[Dataset, list[dict]]:
    """Return (new Dataset, human-readable change log)."""
    raw = copy.deepcopy(ds.raw)
    fac = {f["id"]: f for f in raw["faculty"]}
    room_ids = {r["id"] for r in raw["rooms"]}
    session_ids = {s["id"] for s in raw["sessions"]}
    log: list[dict] = []

    for i, ch in enumerate(changes):
        kind = ch.get("type")
        if kind not in CHANGE_TYPES:
            raise ValueError(f"change #{i}: unknown change type {kind!r}; expected one of {sorted(CHANGE_TYPES)}")

        if kind == "faculty_unavailable":
            fid = ch.get("faculty_id")
            if fid not in fac:
                raise ValueError(f"change #{i}: unknown faculty {fid!r}")
            days = ch.get("days") or []
            periods = ch.get("periods") or []
            if not days or not periods:
                raise ValueError(f"change #{i}: faculty_unavailable needs both days and periods")
            for day in days:
                fac[fid].setdefault("unavailable", []).append(
                    {"day": day, "periods": list(periods), "reason": ch.get("reason", "change file")})
            log.append({
                "type": kind, "faculty_id": fid, "days": list(days), "periods": list(periods),
                "text": f"{fac[fid]['name']} unavailable on {', '.join(days)} for periods {periods}",
            })

        elif kind == "room_unavailable":
            rid = ch.get("room_id")
            if rid not in room_ids:
                raise ValueError(f"change #{i}: unknown room {rid!r}")
            days = ch.get("days") or []
            periods = ch.get("periods") or []
            if not days or not periods:
                raise ValueError(f"change #{i}: room_unavailable needs both days and periods")
            for day in days:
                raw["room_unavailability"].append(
                    {"room_id": rid, "day": day, "periods": list(periods),
                     "reason": ch.get("reason", "change file")})
            log.append({
                "type": kind, "room_id": rid, "days": list(days), "periods": list(periods),
                "text": f"room {rid} closed on {', '.join(days)} for periods {periods}",
            })

        elif kind == "add_faculty":
            f = ch.get("faculty") or {}
            if "id" not in f:
                raise ValueError(f"change #{i}: add_faculty needs a faculty object with an id")
            if f["id"] in fac:
                raise ValueError(f"change #{i}: faculty {f['id']} already exists")
            f.setdefault("unavailable", [])
            f.setdefault("preferences", [])
            raw["faculty"].append(f)
            fac[f["id"]] = f
            log.append({"type": kind, "faculty_id": f["id"],
                        "text": f"new faculty {f['id']} ({f.get('name', 'unnamed')}) added"})

        elif kind == "add_session":
            s = ch.get("session") or {}
            if "id" not in s:
                raise ValueError(f"change #{i}: add_session needs a session object with an id")
            if s["id"] in session_ids:
                raise ValueError(f"change #{i}: session {s['id']} already exists")
            s.setdefault("fixed_slot", None)
            s.setdefault("basket_slot", None)
            s.setdefault("needs_accessible", False)
            raw["sessions"].append(s)
            session_ids.add(s["id"])
            log.append({"type": kind, "session_id": s["id"],
                        "text": f"new session {s['id']} added ({s.get('kind')}, {s.get('duration')} periods, "
                                f"groups {s.get('groups')}, faculty {s.get('faculty_id')})"})

        elif kind == "remove_session":
            sid = ch.get("session_id")
            if sid not in session_ids:
                raise ValueError(f"change #{i}: unknown session {sid!r}")
            raw["sessions"] = [s for s in raw["sessions"] if s["id"] != sid]
            session_ids.discard(sid)
            log.append({"type": kind, "session_id": sid, "text": f"session {sid} removed"})

    return Dataset(raw), log


def load_disruption(path: str) -> list[dict]:
    import json
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)
    if isinstance(payload, list):
        return payload
    return payload.get("changes", [])
